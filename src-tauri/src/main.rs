#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#![allow(clippy::result_large_err)]
#![allow(clippy::too_many_arguments)]

mod chess;
mod db;
mod engine;
mod error;
mod game;

mod fs;
mod lexer;
mod oauth;
mod opening;
mod pgn;
mod progress;
mod puzzle;
mod sound;
mod system_tts;
mod tts_servers;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chess::{BestMovesPayload, EngineProcess};
use dashmap::DashMap;
use db::{DatabaseProgress, GameQuery, NormalizedGame, PositionStats};
use derivative::Derivative;
use game::GameManager;
use progress::{clear_progress, get_progress, ProgressEvent, ProgressStore};

use log::LevelFilter;
use oauth::AuthState;
#[cfg(debug_assertions)]
use specta_typescript::{BigIntExportBehavior, Typescript};
use sysinfo::SystemExt;
use tauri::{Manager, Window};
use tauri_plugin_log::{Target, TargetKind};

use crate::chess::{
    analyze_game, cancel_analysis, get_engine_config, get_engine_logs, kill_engine, kill_engines,
    stop_engine,
};
use crate::db::{
    clear_games, convert_pgn, create_indexes, delete_database, delete_db_game, delete_empty_games,
    delete_indexes, export_to_pgn, get_player, get_players_game_info, get_tournaments,
    preload_reference_db, search_position, MmapSearchIndex,
};
use crate::game::{
    abort_game, get_game_engine_logs, get_game_state, make_game_move, resign_game, start_game,
    take_back_game_move, ClockUpdateEvent, GameMoveEvent, GameOverEvent,
};

use crate::fs::set_file_as_executable;
use crate::lexer::lex_pgn;
use crate::oauth::authenticate;
use crate::pgn::{count_pgn_games, delete_game, read_games, write_game};
use crate::puzzle::{
    delete_puzzle_database, get_puzzle, get_puzzle_db_info, get_puzzle_themes,
    get_themes_for_puzzle,
};
use crate::sound::get_sound_server_port;
use crate::system_tts::{
    system_tts_list_voices, system_tts_set_voice, system_tts_speak, system_tts_stop,
    SystemTtsState,
};
use crate::tts_servers::{
    check_docker_installed, check_docker_running, check_kittentts_packages, check_kittentts_script,
    check_kittentts_venv, check_opentts_image, check_python_installed, fetch_tts_audio,
    kittentts_start, kittentts_stop, opentts_start, opentts_stop, setup_kittentts_venv,
    setup_opentts_load, setup_opentts_pull, TtsServerState,
};
use crate::{
    chess::get_best_moves,
    db::{
        delete_duplicated_games, edit_db_info, get_db_info, get_games, get_players, merge_players,
    },
    fs::{download_file, file_exists, get_file_metadata},
    opening::{
        get_opening_from_fen, get_opening_from_fens, get_opening_from_name, search_opening_name,
    },
};
use std::sync::atomic::AtomicBool;
use tokio::sync::Semaphore;

#[derive(Derivative)]
#[derivative(Default)]
pub struct AppState {
    connection_pool: DashMap<
        String,
        diesel::r2d2::Pool<diesel::r2d2::ConnectionManager<diesel::SqliteConnection>>,
    >,
    line_cache: DashMap<(GameQuery, PathBuf), (Vec<PositionStats>, Vec<NormalizedGame>)>,
    db_cache: Mutex<Option<MmapSearchIndex>>,
    #[derivative(Default(value = "Arc::new(Semaphore::new(2))"))]
    new_request: Arc<Semaphore>,
    #[derivative(Default(value = "DashMap::new()"))]
    search_collisions: DashMap<(GameQuery, PathBuf), Arc<tokio::sync::Mutex<()>>>,
    pgn_offsets: DashMap<String, Vec<u64>>,

    engine_processes: DashMap<(String, String), Arc<tokio::sync::Mutex<EngineProcess>>>,
    analysis_cancel_flags: DashMap<String, Arc<AtomicBool>>,
    auth: AuthState,
    game_manager: GameManager,
    progress_state: ProgressStore,
}

#[tauri::command]
#[specta::specta]
async fn close_splashscreen(window: Window) -> Result<(), String> {
    window
        .get_webview_window("main")
        .expect("no window labeled 'main' found")
        .show()
        .unwrap();
    Ok(())
}

fn main() {
    let specta_builder = tauri_specta::Builder::new()
        .commands(tauri_specta::collect_commands!(
            close_splashscreen,
            get_best_moves,
            analyze_game,
            cancel_analysis,
            stop_engine,
            kill_engine,
            kill_engines,
            get_engine_logs,
            memory_size,
            get_puzzle,
            search_opening_name,
            get_opening_from_fen,
            get_opening_from_fens,
            get_opening_from_name,
            get_players_game_info,
            get_engine_config,
            file_exists,
            get_file_metadata,
            merge_players,
            convert_pgn,
            get_player,
            count_pgn_games,
            read_games,
            lex_pgn,
            is_bmi2_compatible,
            delete_game,
            delete_duplicated_games,
            delete_empty_games,
            clear_games,
            set_file_as_executable,
            delete_indexes,
            create_indexes,
            edit_db_info,
            delete_db_game,
            delete_database,
            export_to_pgn,
            authenticate,
            write_game,
            download_file,
            get_tournaments,
            get_db_info,
            get_games,
            search_position,
            get_players,
            get_puzzle_db_info,
            get_puzzle_themes,
            get_themes_for_puzzle,
            delete_puzzle_database,
            start_game,
            get_game_state,
            make_game_move,
            take_back_game_move,
            resign_game,
            abort_game,
            get_game_engine_logs,
            preload_reference_db,
            get_progress,
            clear_progress,
            get_sound_server_port,
            system_tts_speak,
            system_tts_stop,
            system_tts_list_voices,
            system_tts_set_voice,
            opentts_start,
            opentts_stop,
            kittentts_start,
            kittentts_stop,
            fetch_tts_audio,
            check_docker_installed,
            check_docker_running,
            check_opentts_image,
            check_python_installed,
            check_kittentts_venv,
            check_kittentts_packages,
            check_kittentts_script,
            setup_kittentts_venv,
            setup_opentts_load,
            setup_opentts_pull,
            download_and_install_linux
        ))
        .events(tauri_specta::collect_events!(
            BestMovesPayload,
            DatabaseProgress,
            ProgressEvent,
            GameMoveEvent,
            ClockUpdateEvent,
            GameOverEvent
        ));

    #[cfg(debug_assertions)]
    specta_builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::BigInt),
            "../src/bindings/generated.ts",
        )
        .expect("Failed to export types");

    #[cfg(debug_assertions)]
    let log_targets = [TargetKind::Stdout, TargetKind::Webview];

    #[cfg(not(debug_assertions))]
    let log_targets = [
        TargetKind::Stdout,
        TargetKind::LogDir {
            file_name: Some(String::from("en-parlant.log")),
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets(log_targets.map(Target::new))
                .level(LevelFilter::Info)
                .build(),
        )
        .invoke_handler(specta_builder.invoke_handler())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .setup(move |app| {
            log::info!("Setting up application");

            // #[cfg(any(windows, target_os = "macos"))]
            // set_shadow(&app.get_webview_window("main").unwrap(), true).unwrap();

            specta_builder.mount_events(app);

            #[cfg(target_os = "linux")]
            {
                let sound_dir = app
                    .path()
                    .resolve("sound", tauri::path::BaseDirectory::Resource)
                    .expect("failed to resolve sound resource directory");
                let port = sound::start_sound_server(sound_dir);
                app.manage(sound::SoundServerPort(port));
            }
            #[cfg(not(target_os = "linux"))]
            app.manage(sound::SoundServerPort(0));

            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_cli::init())?;

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            log::info!("Finished rust initialization");

            Ok(())
        })
        .manage(SystemTtsState(std::sync::Mutex::new(None)))
        .manage(TtsServerState {
            kittentts_pid: std::sync::Mutex::new(None),
        })
        .manage(AppState::default())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state = app.state::<AppState>();
                for entry in state.engine_processes.iter() {
                    if let Ok(mut process) = entry.value().try_lock() {
                        process.kill_sync();
                    }
                }
            }
        });
}

/// Linux system-install updater: downloads the .deb from GitHub and installs
/// via pkexec dpkg -i (shows one polkit auth prompt).
#[tauri::command]
#[specta::specta]
async fn download_and_install_linux(app: tauri::AppHandle, version: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use futures_util::StreamExt;
        use std::io::Write;
        use std::process::Command;
        use tauri::Emitter;

        let url = format!(
            "https://github.com/DarrellThomas/en-parlant/releases/download/v{}/En.Parlant_{}_amd64.deb",
            version, version
        );

        let deb_path = format!("/tmp/en-parlant-update-{}.deb", version);

        // Download with progress events
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Download failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }

        let total = response.content_length();
        let mut downloaded: u64 = 0;
        let mut file = std::fs::File::create(&deb_path)
            .map_err(|e| format!("Cannot create temp file: {}", e))?;

        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Write error: {}", e))?;
            downloaded += chunk.len() as u64;
            let _ = app.emit(
                "linux-update-progress",
                serde_json::json!({ "downloaded": downloaded, "total": total }),
            );
        }
        drop(file);

        // Install via pkexec dpkg -i
        let mut child = Command::new("pkexec")
            .args(["dpkg", "-i", &deb_path])
            .stdin(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to launch pkexec: {}", e))?;

        let timeout = std::time::Duration::from_secs(120);
        let start = std::time::Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(s)) => break s,
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        std::fs::remove_file(&deb_path).ok();
                        return Err(
                            "Authentication timed out (120 s). \
                             Is a polkit agent (e.g. gnome-polkit) running?"
                                .to_string(),
                        );
                    }
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
                Err(e) => {
                    let _ = child.kill();
                    std::fs::remove_file(&deb_path).ok();
                    return Err(format!("Failed to wait for pkexec: {}", e));
                }
            }
        };

        std::fs::remove_file(&deb_path).ok();

        let mut stderr_str = String::new();
        if let Some(mut s) = child.stderr.take() {
            use std::io::Read;
            let _ = s.read_to_string(&mut stderr_str);
        }

        if !status.success() {
            return Err(format!(
                "Install failed (password cancelled or dpkg error). {}",
                stderr_str.trim()
            ));
        }

        return Ok(());
    }

    #[cfg(not(target_os = "linux"))]
    Err("download_and_install_linux is only available on Linux".to_string())
}

#[tauri::command]
#[specta::specta]
fn is_bmi2_compatible() -> bool {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    if is_x86_feature_detected!("bmi2") {
        return true;
    }
    false
}

#[tauri::command]
#[specta::specta]
fn memory_size() -> u32 {
    let total_bytes = sysinfo::System::new_all().total_memory();
    (total_bytes / 1024 / 1024) as u32
}
