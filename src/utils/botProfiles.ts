import type { EngineOption, GoMode } from "@/bindings";

export interface BotStyle {
    aggression: number; // 0-100, maps to Contempt
    moveSpeed: "fast" | "normal" | "slow" | "deliberate";
}

export interface BotProfile {
    id: string;
    name: string;
    title: string;
    description: string;
    elo: number;
    avatar: string;
    style: BotStyle;
    builtIn: boolean;
}

export const BUILT_IN_PROFILES: BotProfile[] = [
    {
        id: "bot-timmy",
        name: "Timmy",
        title: "The Absolute Beginner",
        description:
            "Just learned how the pieces move. Hangs pieces constantly and has no sense of danger.",
        elo: 600,
        avatar: "\u{1F476}",
        style: { aggression: 50, moveSpeed: "fast" },
        builtIn: true,
    },
    {
        id: "bot-rosa",
        name: "Rosa",
        title: "The Cautious Learner",
        description:
            "Plays carefully but misses most tactics. Prefers safe-looking moves over active ones.",
        elo: 800,
        avatar: "\u{1F331}",
        style: { aggression: 25, moveSpeed: "normal" },
        builtIn: true,
    },
    {
        id: "bot-jake",
        name: "Jake",
        title: "The Wild Attacker",
        description:
            "Throws pieces at your king from move one. Dangerous if you're not careful, but forgets about defense entirely.",
        elo: 1000,
        avatar: "\u{1F525}",
        style: { aggression: 85, moveSpeed: "fast" },
        builtIn: true,
    },
    {
        id: "bot-mei",
        name: "Mei",
        title: "The Club Regular",
        description:
            "Solid fundamentals and improving every day. Knows her openings but sometimes drifts in the middlegame.",
        elo: 1200,
        avatar: "\u{1F338}",
        style: { aggression: 50, moveSpeed: "normal" },
        builtIn: true,
    },
    {
        id: "bot-carlos",
        name: "Carlos",
        title: "The Tactician",
        description:
            "Always looking for tricks and combinations. Will punish loose pieces but can be outmaneuvered positionally.",
        elo: 1400,
        avatar: "\u26A1",
        style: { aggression: 70, moveSpeed: "normal" },
        builtIn: true,
    },
    {
        id: "bot-priya",
        name: "Priya",
        title: "The Positional Thinker",
        description:
            "Prefers quiet positions and long-term plans. Patient and methodical \u2014 tries to squeeze you slowly.",
        elo: 1500,
        avatar: "\u26F0\uFE0F",
        style: { aggression: 30, moveSpeed: "slow" },
        builtIn: true,
    },
    {
        id: "bot-viktor",
        name: "Viktor",
        title: "The Gambiteer",
        description:
            "Sacrifices pawns for initiative and plays sharp gambits. Thrives in chaos, struggles in quiet endgames.",
        elo: 1600,
        avatar: "\u2694\uFE0F",
        style: { aggression: 90, moveSpeed: "fast" },
        builtIn: true,
    },
    {
        id: "bot-sarah",
        name: "Sarah",
        title: "The Iron Wall",
        description:
            "Rock-solid defense and excellent endgame technique. Forces you to find the winning plan yourself.",
        elo: 1700,
        avatar: "\u{1F6E1}\uFE0F",
        style: { aggression: 20, moveSpeed: "deliberate" },
        builtIn: true,
    },
    {
        id: "bot-dmitri",
        name: "Dmitri",
        title: "The All-Rounder",
        description:
            "Adapts to any position type. Equally comfortable attacking and defending \u2014 a tough opponent with no clear weakness.",
        elo: 1800,
        avatar: "\u2B50",
        style: { aggression: 55, moveSpeed: "normal" },
        builtIn: true,
    },
    {
        id: "bot-amara",
        name: "Amara",
        title: "The Strategist",
        description:
            "Deep understanding of pawn structures and piece placement. Builds small advantages into winning ones.",
        elo: 1900,
        avatar: "\u{1F52E}",
        style: { aggression: 35, moveSpeed: "slow" },
        builtIn: true,
    },
    {
        id: "bot-magnus-jr",
        name: "Magnus Jr.",
        title: "The Tournament Player",
        description:
            "Tournament-level strength with very few mistakes. You'll need accurate play to have a chance.",
        elo: 2000,
        avatar: "\u{1F451}",
        style: { aggression: 60, moveSpeed: "normal" },
        builtIn: true,
    },
    {
        id: "bot-professor",
        name: "The Professor",
        title: "The Expert",
        description:
            "Near-master level play. Punishes every inaccuracy and grinds out wins from the smallest advantages.",
        elo: 2200,
        avatar: "\u{1F393}",
        style: { aggression: 45, moveSpeed: "deliberate" },
        builtIn: true,
    },
];

// --- UCI Mapping ---

function aggressionToContempt(aggression: number): number {
    // 0 -> -50, 50 -> 25, 100 -> 100
    return Math.round(-50 + (aggression / 100) * 150);
}

function eloToDepth(elo: number): number {
    if (elo <= 600) return 5;
    if (elo <= 800) return 8;
    if (elo <= 1000) return 10;
    if (elo <= 1200) return 12;
    if (elo <= 1400) return 15;
    if (elo <= 1600) return 18;
    if (elo <= 1800) return 20;
    if (elo <= 2000) return 22;
    return 24;
}

function eloToSkillLevel(elo: number): number {
    // Map 600-1319 to Skill Level 0-10
    const clamped = Math.max(600, Math.min(1319, elo));
    return Math.round(((clamped - 600) / (1319 - 600)) * 10);
}

function getMoveTimeMs(moveSpeed: BotStyle["moveSpeed"], elo: number): number {
    const table: Record<BotStyle["moveSpeed"], [number, number, number, number]> = {
        fast: [500, 800, 1000, 1200],
        normal: [1000, 1500, 2000, 2500],
        slow: [2000, 3000, 4000, 5000],
        deliberate: [3000, 5000, 7000, 8000],
    };
    const row = table[moveSpeed];
    if (elo < 1000) return row[0];
    if (elo < 1500) return row[1];
    if (elo < 2000) return row[2];
    return row[3];
}

export interface BotEngineConfig {
    options: EngineOption[];
    go: GoMode;
    minMoveTimeMs: number;
}

export function botProfileToEngineConfig(profile: BotProfile): BotEngineConfig {
    const options: EngineOption[] = [];
    const contempt = aggressionToContempt(profile.style.aggression);
    options.push({ name: "Contempt", value: String(contempt) });

    if (profile.elo < 1320) {
        // Below Stockfish's UCI_Elo floor — use Skill Level
        const skill = eloToSkillLevel(profile.elo);
        options.push({ name: "Skill Level", value: String(skill) });
    } else {
        // Use UCI_Elo limiting
        const clampedElo = Math.min(3190, profile.elo);
        options.push({ name: "UCI_LimitStrength", value: "true" });
        options.push({ name: "UCI_Elo", value: String(clampedElo) });
    }

    const depth = eloToDepth(profile.elo);
    const go: GoMode = { t: "Depth", c: depth };
    const minMoveTimeMs = getMoveTimeMs(profile.style.moveSpeed, profile.elo);

    return { options, go, minMoveTimeMs };
}

// --- Profile Generator ---

const FIRST_NAMES = [
    "Aiko",
    "Alex",
    "Amina",
    "Boris",
    "Chen",
    "Clara",
    "Diego",
    "Elena",
    "Fatima",
    "Felix",
    "Greta",
    "Hassan",
    "Ingrid",
    "Javier",
    "Kenji",
    "Lena",
    "Marco",
    "Nadia",
    "Olga",
    "Pavel",
    "Quinn",
    "Ravi",
    "Sofia",
    "Tariq",
    "Uma",
    "Vera",
    "Wei",
    "Yuki",
    "Zara",
];

const AVATARS = [
    "\u{1F60A}",
    "\u{1F913}",
    "\u{1F60E}",
    "\u{1F914}",
    "\u{1F9D0}",
    "\u{1F47E}",
    "\u{1F916}",
    "\u{1F3AF}",
    "\u{1F9E9}",
    "\u{1F3B2}",
    "\u265F\uFE0F",
    "\u{1F40E}",
    "\u{1F9CA}",
    "\u{1F30D}",
    "\u{1F308}",
    "\u{1F680}",
    "\u{1F3C6}",
    "\u{1F48E}",
    "\u{1F52D}",
    "\u{1F3B5}",
];

const STYLE_TITLES: Record<string, string[]> = {
    aggressive: ["The Attacker", "The Blitz Player", "The Swashbuckler", "The Berserker"],
    balanced: ["The Practical Player", "The Adapter", "The Steady Hand", "The Realist"],
    positional: ["The Strategist", "The Grinder", "The Patient One", "The Squeeze Master"],
};

const STYLE_DESCRIPTIONS: Record<string, string[]> = {
    aggressive: [
        "Loves sharp positions and is always looking for a chance to attack.",
        "Plays actively and isn't afraid to sacrifice material for the initiative.",
        "Thrives in complicated positions where tactics decide the game.",
    ],
    balanced: [
        "Plays solidly and adapts to whatever the position demands.",
        "A well-rounded player comfortable in all types of positions.",
        "Pragmatic and flexible \u2014 takes what the position gives.",
    ],
    positional: [
        "Prefers quiet maneuvering and building long-term advantages.",
        "Patient and methodical, waiting for the right moment to strike.",
        "Focuses on pawn structure and piece placement over flashy tactics.",
    ],
};

function randomFrom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getStyleCategory(aggression: number): string {
    if (aggression >= 65) return "aggressive";
    if (aggression <= 35) return "positional";
    return "balanced";
}

export function generateBotProfile(eloRange: [number, number] = [800, 1800]): BotProfile {
    const elo = Math.round((eloRange[0] + Math.random() * (eloRange[1] - eloRange[0])) / 50) * 50;
    const aggression = Math.round(20 + Math.random() * 60); // 20-80

    const speeds: BotStyle["moveSpeed"][] = ["fast", "normal", "slow", "deliberate"];
    const moveSpeed = randomFrom(speeds);
    const category = getStyleCategory(aggression);

    return {
        id: crypto.randomUUID(),
        name: randomFrom(FIRST_NAMES),
        title: randomFrom(STYLE_TITLES[category]),
        description: randomFrom(STYLE_DESCRIPTIONS[category]),
        elo,
        avatar: randomFrom(AVATARS),
        style: { aggression, moveSpeed },
        builtIn: false,
    };
}
