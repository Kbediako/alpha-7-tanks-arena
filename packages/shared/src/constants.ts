export const BATTLE_ROYALE_ROOM = "battle_royale" as const;

export const MATCH_STATES = [
  "waiting",
  "countdown",
  "running",
  "danger",
  "final_zone",
  "finished"
] as const;

export type MatchState = (typeof MATCH_STATES)[number];

export const TANK_ARCHETYPE_CONFIG = {
  nova: {
    id: "nova",
    name: "Nova",
    role: "Assault",
    description: "Frontline brawler with high burst damage.",
    stats: { firepower: 5, armor: 3, mobility: 3, support: 1 }
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    role: "Balanced",
    description: "Reliable baseline with even armor, speed, and firepower.",
    stats: { firepower: 3, armor: 4, mobility: 3, support: 2 }
  },
  quill: {
    id: "quill",
    name: "Quill",
    role: "Skirmisher",
    description: "Fast flanker built for repositioning and weak-point strikes.",
    stats: { firepower: 3, armor: 2, mobility: 5, support: 1 }
  },
  rook: {
    id: "rook",
    name: "Rook",
    role: "Support",
    description: "Durable utility chassis with repairs and battlefield control.",
    stats: { firepower: 2, armor: 5, mobility: 2, support: 5 }
  }
} as const;

export const TANK_ARCHETYPES = Object.keys(TANK_ARCHETYPE_CONFIG) as TankArchetypeId[];
export type TankArchetypeId = keyof typeof TANK_ARCHETYPE_CONFIG;
export type TankArchetypeConfig = (typeof TANK_ARCHETYPE_CONFIG)[TankArchetypeId];

export interface HealthResponse {
  ok: true;
  service: "alpha7-server";
  room: typeof BATTLE_ROYALE_ROOM;
  version: string;
}

