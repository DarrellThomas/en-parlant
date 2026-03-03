use log::{error, info, warn};
use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use tauri::{Manager, State};

// --- Fetch audio from localhost TTS servers (bypasses browser fetch issues) ---

#[tauri::command]
#[specta::specta]
pub fn fetch_tts_audio(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::new();
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .map_err(|e| format!("TTS fetch error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("TTS server error {}: {}", response.status(), response.text().unwrap_or_default()));
    }

    response.bytes()
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read TTS audio: {}", e))
}

pub struct TtsServerState {
    pub kittentts_pid: Mutex<Option<u32>>,
}

// --- Dependency checking ---

#[derive(Serialize, Clone, specta::Type)]
pub struct DepCheck {
    pub ok: bool,
    pub label: String,
    pub detail: String,
    pub fix_hint: String,
}

/// Shared path-resolution logic for KittenTTS resources.
struct KittenTtsPaths {
    script: Option<String>,
    python: Option<String>,
    venv_dir: Option<String>,
    models_dir: Option<String>,
}

/// Python binary name within a venv, platform-aware.
#[cfg(not(target_os = "windows"))]
const VENV_PYTHON: &str = "bin/python";
#[cfg(target_os = "windows")]
const VENV_PYTHON: &str = "Scripts/python.exe";

/// Pip binary name within a venv, platform-aware.
#[cfg(not(target_os = "windows"))]
const VENV_PIP: &str = "bin/pip";
#[cfg(target_os = "windows")]
const VENV_PIP: &str = "Scripts/pip.exe";

fn find_kittentts_paths(app_handle: &tauri::AppHandle) -> KittenTtsPaths {
    let mut script_candidates: Vec<std::path::PathBuf> = Vec::new();
    let mut venv_candidates: Vec<std::path::PathBuf> = Vec::new();
    let mut models_candidates: Vec<std::path::PathBuf> = Vec::new();

    // User-writable app data dir — primary location for venv and models
    if let Ok(app_data) = app_handle.path().app_data_dir() {
        let kittentts_dir = app_data.join("kittentts");
        venv_candidates.push(kittentts_dir.join(".venv"));
        models_candidates.push(kittentts_dir.join("models"));
    }

    // Tauri bundled resources — scripts live here (read-only is fine)
    if let Ok(res_dir) = app_handle.path().resolve("scripts", tauri::path::BaseDirectory::Resource) {
        script_candidates.push(res_dir.join("kittentts-server.py"));

        // Windows: check for PyInstaller exe
        #[cfg(target_os = "windows")]
        script_candidates.push(res_dir.join("kittentts-server.exe"));
    }

    // System install location (Linux) — scripts only
    #[cfg(target_os = "linux")]
    {
        let sys = std::path::PathBuf::from("/usr/lib/en-parlant/scripts");
        script_candidates.push(sys.join("kittentts-server.py"));
    }

    // Dev fallback (relative to CWD)
    script_candidates.push(std::path::PathBuf::from("scripts/kittentts-server.py"));
    venv_candidates.push(std::path::PathBuf::from("scripts/.venv"));
    models_candidates.push(std::path::PathBuf::from("scripts/models"));

    // Windows: also check for exe in dev
    #[cfg(target_os = "windows")]
    script_candidates.push(std::path::PathBuf::from("scripts/kittentts-server.exe"));

    let script = script_candidates.iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    // Validate venv by checking for the actual Python binary, not just the directory
    let python = venv_candidates.iter()
        .map(|v| v.join(VENV_PYTHON))
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    let venv_dir = venv_candidates.iter()
        .find(|v| v.join(VENV_PYTHON).exists())
        .map(|p| p.to_string_lossy().to_string());

    let models_dir = models_candidates.iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    KittenTtsPaths { script, python, venv_dir, models_dir }
}

// --- Dependency check commands ---

#[tauri::command]
#[specta::specta]
pub fn check_docker_installed() -> DepCheck {
    match Command::new("docker").arg("--version").output() {
        Ok(output) if output.status.success() => {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            DepCheck {
                ok: true,
                label: "Docker installed".into(),
                detail: ver,
                fix_hint: String::new(),
            }
        }
        _ => DepCheck {
            ok: false,
            label: "Docker not installed".into(),
            detail: "Docker is required to run OpenTTS".into(),
            fix_hint: if cfg!(target_os = "windows") {
                "Install Docker Desktop from docker.com".into()
            } else {
                "sudo apt install docker.io && sudo usermod -aG docker $USER".into()
            },
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_docker_running() -> DepCheck {
    match Command::new("docker").arg("info").output() {
        Ok(output) if output.status.success() => DepCheck {
            ok: true,
            label: "Docker running".into(),
            detail: "Docker daemon is active".into(),
            fix_hint: String::new(),
        },
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let hint = if cfg!(target_os = "windows") {
                "Start Docker Desktop from the Start menu"
            } else if stderr.contains("permission denied") {
                "sudo usermod -aG docker $USER && newgrp docker"
            } else {
                "sudo systemctl start docker"
            };
            DepCheck {
                ok: false,
                label: "Docker not running".into(),
                detail: stderr.lines().next().unwrap_or("Docker daemon is not active").to_string(),
                fix_hint: hint.into(),
            }
        }
        _ => DepCheck {
            ok: false,
            label: "Docker not running".into(),
            detail: "Could not communicate with Docker".into(),
            fix_hint: if cfg!(target_os = "windows") {
                "Start Docker Desktop from the Start menu".into()
            } else {
                "sudo systemctl start docker".into()
            },
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_opentts_image() -> DepCheck {
    match Command::new("docker")
        .args(["images", "-q", "synesthesiam/opentts:en"])
        .output()
    {
        Ok(output) if output.status.success() => {
            let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if id.is_empty() {
                DepCheck {
                    ok: false,
                    label: "OpenTTS image not found".into(),
                    detail: "Image synesthesiam/opentts:en is not pulled".into(),
                    fix_hint: "Use the Setup Wizard to download the image".into(),
                }
            } else {
                DepCheck {
                    ok: true,
                    label: "OpenTTS image ready".into(),
                    detail: format!("Image ID: {}", id),
                    fix_hint: String::new(),
                }
            }
        }
        _ => DepCheck {
            ok: false,
            label: "Could not check images".into(),
            detail: "Docker may not be running".into(),
            fix_hint: "Use the Setup Wizard to download the image".into(),
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_python_installed() -> DepCheck {
    let python_cmd = if cfg!(target_os = "windows") { "python" } else { "python3" };
    match Command::new(python_cmd).arg("--version").output() {
        Ok(output) if output.status.success() => {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            DepCheck {
                ok: true,
                label: "Python installed".into(),
                detail: ver,
                fix_hint: String::new(),
            }
        }
        _ => DepCheck {
            ok: false,
            label: "Python 3 not installed".into(),
            detail: "Python 3.10+ is required for KittenTTS".into(),
            fix_hint: if cfg!(target_os = "windows") {
                "Install Python from python.org".into()
            } else {
                "sudo apt install python3 python3-venv".into()
            },
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_kittentts_venv(app_handle: tauri::AppHandle) -> DepCheck {
    let paths = find_kittentts_paths(&app_handle);
    // Check for actual Python binary, not just directory existence
    match paths.python {
        Some(ref _python) => match paths.venv_dir {
            Some(dir) => DepCheck {
                ok: true,
                label: "Virtual environment found".into(),
                detail: dir,
                fix_hint: String::new(),
            },
            None => DepCheck {
                ok: false,
                label: "Virtual environment not found".into(),
                detail: "No valid .venv found".into(),
                fix_hint: "Will be created automatically".into(),
            },
        },
        None => DepCheck {
            ok: false,
            label: "Virtual environment not set up".into(),
            detail: "Python venv with packages needs to be created".into(),
            fix_hint: "Will be created automatically".into(),
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_kittentts_packages(app_handle: tauri::AppHandle) -> DepCheck {
    let paths = find_kittentts_paths(&app_handle);
    let python = match paths.python {
        Some(p) => p,
        None => {
            return DepCheck {
                ok: false,
                label: "Packages not installed".into(),
                detail: "Virtual environment not found — create it first".into(),
                fix_hint: "Create venv, then install packages".into(),
            };
        }
    };

    match Command::new(&python)
        .args(["-c", "import kittentts; import flask; import soundfile; import numpy"])
        .output()
    {
        Ok(output) if output.status.success() => DepCheck {
            ok: true,
            label: "Python packages installed".into(),
            detail: "kittentts, flask, soundfile, numpy".into(),
            fix_hint: String::new(),
        },
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let missing = if stderr.contains("kittentts") {
                "kittentts"
            } else if stderr.contains("flask") {
                "flask"
            } else if stderr.contains("soundfile") {
                "soundfile"
            } else if stderr.contains("numpy") {
                "numpy"
            } else {
                "some packages"
            };
            DepCheck {
                ok: false,
                label: format!("Missing: {}", missing),
                detail: stderr.lines().next().unwrap_or("Import failed").to_string(),
                fix_hint: "pip install kittentts flask soundfile numpy".into(),
            }
        }
        _ => DepCheck {
            ok: false,
            label: "Could not check packages".into(),
            detail: "Failed to run venv Python".into(),
            fix_hint: "Recreate the virtual environment".into(),
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_kittentts_script(app_handle: tauri::AppHandle) -> DepCheck {
    let paths = find_kittentts_paths(&app_handle);
    match paths.script {
        Some(path) => DepCheck {
            ok: true,
            label: "Server script found".into(),
            detail: path,
            fix_hint: String::new(),
        },
        None => DepCheck {
            ok: false,
            label: "Server script not found".into(),
            detail: "kittentts-server.py not found in expected locations".into(),
            fix_hint: "Reinstall the application".into(),
        },
    }
}

// --- Setup commands (long-running) ---

#[tauri::command]
#[specta::specta]
pub fn setup_kittentts_venv(app_handle: tauri::AppHandle) -> Result<String, String> {
    let paths = find_kittentts_paths(&app_handle);

    // If a valid venv already exists, nothing to do
    if paths.python.is_some() {
        return Ok("Already installed".to_string());
    }

    // Create venv in user-writable app data dir
    let kittentts_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Cannot determine app data directory: {}", e))?
        .join("kittentts");
    let venv_dir = kittentts_dir.join(".venv");
    let venv_str = venv_dir.to_string_lossy().to_string();

    info!("Setting up KittenTTS venv at {}", venv_str);

    // Ensure parent directory exists
    std::fs::create_dir_all(&kittentts_dir)
        .map_err(|e| format!("Cannot create directory {}: {}", kittentts_dir.display(), e))?;

    let python_cmd = if cfg!(target_os = "windows") { "python" } else { "python3" };

    // Check Python is available
    let python_check = Command::new(python_cmd).arg("--version").output();
    match python_check {
        Ok(output) if output.status.success() => {
            info!("Found {}", String::from_utf8_lossy(&output.stdout).trim());
        }
        _ => {
            return Err("Python 3.10+ is required but not installed. On Ubuntu/Debian: sudo apt install python3 python3-venv".to_string());
        }
    }

    // Remove stale/empty venv if python binary is missing
    if venv_dir.exists() && !venv_dir.join(VENV_PYTHON).exists() {
        info!("Removing incomplete venv at {}", venv_str);
        let _ = std::fs::remove_dir_all(&venv_dir);
    }

    // Create venv
    if !venv_dir.exists() {
        info!("Creating Python virtual environment...");
        let create = Command::new(python_cmd)
            .args(["-m", "venv", &venv_str])
            .output()
            .map_err(|e| format!("Failed to create venv: {}. On Ubuntu/Debian you may need: sudo apt install python3-venv", e))?;
        if !create.status.success() {
            let stderr = String::from_utf8_lossy(&create.stderr).trim().to_string();
            return Err(format!(
                "Failed to create venv: {}{}",
                stderr,
                if stderr.contains("ensurepip") { ". Fix: sudo apt install python3-venv" } else { "" }
            ));
        }
    }

    // Find requirements.txt using same priority as other resources
    let mut req_candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(res_dir) = app_handle.path().resolve("scripts", tauri::path::BaseDirectory::Resource) {
        req_candidates.push(res_dir.join("requirements.txt"));
    }
    #[cfg(target_os = "linux")]
    req_candidates.push(std::path::PathBuf::from("/usr/lib/en-parlant/scripts/requirements.txt"));
    req_candidates.push(std::path::PathBuf::from("scripts/requirements.txt"));

    let requirements = req_candidates.iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    // Install packages
    info!("Installing Python packages (kittentts, flask, soundfile, numpy)...");
    let pip = format!("{}/{}", venv_str, VENV_PIP);
    let install = if let Some(req_path) = requirements {
        info!("Using requirements.txt: {}", req_path);
        Command::new(&pip)
            .args(["install", "-r", &req_path])
            .output()
            .map_err(|e| format!("Failed to run pip: {}", e))?
    } else {
        Command::new(&pip)
            .args(["install", "kittentts", "flask", "soundfile", "numpy"])
            .output()
            .map_err(|e| format!("Failed to run pip: {}", e))?
    };

    if install.status.success() {
        info!("KittenTTS packages installed successfully");
        Ok("Packages installed successfully".to_string())
    } else {
        Err(format!(
            "pip install failed: {}",
            String::from_utf8_lossy(&install.stderr).trim()
        ))
    }
}

#[tauri::command]
#[specta::specta]
pub fn setup_opentts_load(tarball_path: String) -> Result<String, String> {
    let load = Command::new("docker")
        .args(["load", "-i", &tarball_path])
        .output()
        .map_err(|e| format!("Failed to run docker load: {}", e))?;

    if load.status.success() {
        // Clean up tarball after successful load
        let _ = std::fs::remove_file(&tarball_path);
        Ok("Image loaded successfully".to_string())
    } else {
        Err(format!(
            "docker load failed: {}",
            String::from_utf8_lossy(&load.stderr).trim()
        ))
    }
}

#[tauri::command]
#[specta::specta]
pub fn setup_opentts_pull() -> Result<String, String> {
    let pull = Command::new("docker")
        .args(["pull", "synesthesiam/opentts:en"])
        .output()
        .map_err(|e| format!("Failed to run docker pull: {}", e))?;

    if pull.status.success() {
        Ok("Image pulled successfully".to_string())
    } else {
        Err(format!(
            "docker pull failed: {}",
            String::from_utf8_lossy(&pull.stderr).trim()
        ))
    }
}

// --- OpenTTS (Docker) ---

#[tauri::command]
#[specta::specta]
pub fn opentts_start() -> Result<String, String> {
    // Try starting an existing stopped container first
    let start = Command::new("docker")
        .args(["start", "opentts"])
        .output()
        .map_err(|e| format!("Failed to run docker: {}", e))?;

    if start.status.success() {
        return Ok("started".to_string());
    }

    // Container doesn't exist — create it
    let run = Command::new("docker")
        .args([
            "run",
            "-d",
            "--name",
            "opentts",
            "-p",
            "5500:5500",
            "synesthesiam/opentts:en",
        ])
        .output()
        .map_err(|e| format!("Failed to run docker: {}", e))?;

    if run.status.success() {
        Ok("started".to_string())
    } else {
        Err(String::from_utf8_lossy(&run.stderr).trim().to_string())
    }
}

#[tauri::command]
#[specta::specta]
pub fn opentts_stop() -> Result<String, String> {
    let output = Command::new("docker")
        .args(["stop", "opentts"])
        .output()
        .map_err(|e| format!("Failed to run docker: {}", e))?;

    if output.status.success() {
        Ok("stopped".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

// --- KittenTTS (Python server) ---

#[tauri::command]
#[specta::specta]
pub fn kittentts_start(app_handle: tauri::AppHandle, state: State<'_, TtsServerState>, threads: Option<u32>) -> Result<String, String> {
    let mut pid_lock = state.kittentts_pid.lock().map_err(|e| e.to_string())?;

    // Check if already running
    if let Some(pid) = *pid_lock {
        if is_process_alive(pid) {
            return Ok("already running".to_string());
        }
        *pid_lock = None;
    }

    let paths = find_kittentts_paths(&app_handle);

    let script = paths.script.ok_or("KittenTTS server script not found")?;

    // Windows: if we found a .exe, run it directly (PyInstaller bundle)
    #[cfg(target_os = "windows")]
    let is_exe = script.ends_with(".exe");
    #[cfg(not(target_os = "windows"))]
    let is_exe = false;

    let mut cmd = if is_exe {
        Command::new(&script)
    } else {
        let python = paths.python.unwrap_or_else(|| {
            if cfg!(target_os = "windows") { "python".to_string() } else { "python3".to_string() }
        });
        let mut c = Command::new(&python);
        c.arg(&script);
        c
    };

    if let Some(t) = threads {
        if t > 0 {
            cmd.args(["--threads", &t.to_string()]);
        }
    }

    // Point HuggingFace cache at app data models dir (user-writable)
    let models_dir = if let Some(ref models) = paths.models_dir {
        models.clone()
    } else if let Ok(app_data) = app_handle.path().app_data_dir() {
        let dir = app_data.join("kittentts").join("models");
        let _ = std::fs::create_dir_all(&dir);
        dir.to_string_lossy().to_string()
    } else {
        String::new()
    };
    if !models_dir.is_empty() {
        cmd.env("HF_HOME", &models_dir);
    }

    // Windows: hide the console window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    info!("Starting KittenTTS server");

    let mut child = cmd
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start KittenTTS: {}", e))?;

    let pid = child.id();
    *pid_lock = Some(pid);

    // Log stderr in a background thread so crashes are visible
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(line) if line.contains("Error") || line.contains("error") || line.contains("Traceback") => {
                        error!("KittenTTS: {}", line);
                    }
                    Ok(line) if line.contains("Warning") || line.contains("warning") => {
                        warn!("KittenTTS: {}", line);
                    }
                    Ok(line) if !line.trim().is_empty() => {
                        info!("KittenTTS: {}", line);
                    }
                    Err(e) => {
                        error!("KittenTTS stderr read error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });
    }

    Ok("started".to_string())
}

#[tauri::command]
#[specta::specta]
pub fn kittentts_stop(state: State<'_, TtsServerState>) -> Result<String, String> {
    let mut pid_lock = state.kittentts_pid.lock().map_err(|e| e.to_string())?;

    if let Some(pid) = pid_lock.take() {
        kill_process(pid);
        Ok("stopped".to_string())
    } else {
        // Try to kill by port as fallback
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("sh")
                .args(["-c", "fuser -k 8192/tcp 2>/dev/null"])
                .output();
        }
        Ok("stopped".to_string())
    }
}

// --- Platform helpers ---

fn is_process_alive(pid: u32) -> bool {
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout);
                out.contains(&pid.to_string())
            })
            .unwrap_or(false)
    }
}

fn kill_process(pid: u32) {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill").arg(pid.to_string()).output();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
}
