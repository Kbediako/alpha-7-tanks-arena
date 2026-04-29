import type { AbilityType, MatchState, TankArchetypeId, WeaponType } from "./constants.js";

export const CLIENT_MESSAGE_TYPES = {
  JOIN: "join",
  READY: "ready",
  INPUT: "input",
  FIRE: "fire",
  ABILITY: "ability",
  REMATCH: "rematch"
} as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[keyof typeof CLIENT_MESSAGE_TYPES];

export interface JoinMessagePayload {
  playerName: string;
  archetypeId: TankArchetypeId;
  clientVersion?: string;
}

export interface ReadyMessagePayload {
  ready: boolean;
}

export interface InputMessagePayload {
  sequence: number;
  tick: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  ability: boolean;
}

export interface FireMessagePayload {
  sequence: number;
  weaponType?: WeaponType;
  aimX: number;
  aimY: number;
  chargeMs?: number;
}

export interface AbilityMessagePayload {
  sequence: number;
  abilityType: AbilityType;
  targetX?: number;
  targetY?: number;
}

export interface RematchMessagePayload {
  ready: boolean;
  previousMatchId?: string;
}

export interface ClientToServerPayloadMap {
  join: JoinMessagePayload;
  ready: ReadyMessagePayload;
  input: InputMessagePayload;
  fire: FireMessagePayload;
  ability: AbilityMessagePayload;
  rematch: RematchMessagePayload;
}

export type ClientToServerMessage<Type extends ClientMessageType = ClientMessageType> =
  ClientToServerPayloadMap[Type];

export const SERVER_MESSAGE_TYPES = {
  SYSTEM: "system",
  ERROR: "error"
} as const;

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPES)[keyof typeof SERVER_MESSAGE_TYPES];

export type SystemMessageCode =
  | "player_joined"
  | "player_ready"
  | "match_state"
  | "pickup_collected"
  | "rematch";

export interface SystemMessagePayload {
  code?: SystemMessageCode;
  message: string;
  matchState?: MatchState;
  roomCode?: string;
  seed?: string;
  at?: number;
}

export type ErrorMessageCode =
  | "invalid_payload"
  | "invalid_state"
  | "rate_limited"
  | "not_joined"
  | "server_error";

export interface ErrorMessagePayload {
  code: ErrorMessageCode;
  message: string;
  retryable: boolean;
  field?: string;
}

export interface ServerToClientPayloadMap {
  system: SystemMessagePayload;
  error: ErrorMessagePayload;
}

export type ServerToClientMessage<Type extends ServerMessageType = ServerMessageType> =
  ServerToClientPayloadMap[Type];
