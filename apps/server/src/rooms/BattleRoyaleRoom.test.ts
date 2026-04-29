import { EventEmitter } from "node:events";
import { ErrorCode, ServerError, type AuthContext, type Client } from "colyseus";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BATTLE_ROYALE_ROOM,
  PICKUP_CONFIG,
  SERVER_MESSAGE_TYPES,
  WEAPON_CONFIG,
  isWallCollision
} from "@alpha7/shared";
import type { ServerConfig } from "../config.js";
import { BattleRoyaleRoom } from "./BattleRoyaleRoom.js";

type RoomInternals = {
  handleAbilityMessage(client: Client, payload: unknown): void;
  handleFireMessage(client: Client, payload: unknown): void;
  handleInputMessage(client: Client, payload: unknown): void;
  handleJoinMessage(client: Client, payload: unknown): void;
  handleReadyMessage(client: Client, payload: unknown): void;
  handleRematchMessage(client: Client, payload: unknown): void;
  handleStartMessage(client: Client, payload: unknown): void;
  advanceTimedLifecycle(now: number): void;
  onSimulationTick(deltaTime: number): void;
  fireIntents: Map<string, unknown>;
  inputIntents: Map<string, unknown>;
  rematchVotes: Map<string, unknown>;
};

interface TestArenaPoint {
  x: number;
  y: number;
  rotation?: number;
  radius?: number;
}

interface TestArenaWall {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TestArenaConfig {
  seed: string;
  width?: number;
  height?: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | undefined;
  spawnPoints: TestArenaPoint[];
  pickupPoints?: TestArenaPoint[];
  pickupPlacements?: TestArenaPoint[];
  zonePhases: unknown[];
  walls?: TestArenaWall[];
  collisionRects?: TestArenaWall[];
}

interface TestClient {
  client: Client;
  send: ReturnType<typeof vi.fn>;
}

interface TestRoom {
  room: BattleRoyaleRoom;
  internals: RoomInternals;
  metadata: Record<string, unknown>;
  privateValue?: boolean;
  lock: ReturnType<typeof vi.fn>;
  unlock: ReturnType<typeof vi.fn>;
  setSimulationInterval: ReturnType<typeof vi.fn>;
}

const testConfig: ServerConfig = {
  port: 2567,
  nodeEnv: "test",
  allowedOrigins: ["http://localhost:5173"],
  publicClientUrl: "http://localhost:5173",
  maxPlayers: 12,
  demoMaxPlayers: 4,
  roomTickRate: 30,
  roomPatchRate: 20,
  roomAutoStartSeconds: 12,
  enableBots: false,
  logLevel: "silent",
  buildVersion: "test"
};

const rooms: BattleRoyaleRoom[] = [];
const TEST_TANK_RADIUS = 28;

const makeClient = (sessionId: string): TestClient => {
  const send = vi.fn();
  const client = {
    id: sessionId,
    sessionId,
    state: 1,
    ref: new EventEmitter(),
    send: send as unknown as Client["send"],
    sendBytes: vi.fn(),
    raw: vi.fn(),
    enqueueRaw: vi.fn(),
    leave: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
    reconnectionToken: ""
  } as unknown as Client;

  return { client, send };
};

const makeRoom = async (
  options: Partial<Parameters<BattleRoyaleRoom["onCreate"]>[0]> = {}
): Promise<TestRoom> => {
  const room = new BattleRoyaleRoom();
  const metadata: Record<string, unknown> = {};
  let privateValue: boolean | undefined;

  room.roomId = "ROOM123";
  const lock = vi.fn(async () => undefined);
  const unlock = vi.fn(async () => undefined);
  const setSimulationInterval = vi.fn();

  vi.spyOn(room, "setPrivate").mockImplementation(async (value = true) => {
    privateValue = value;
  });
  vi.spyOn(room, "setMetadata").mockImplementation(async (partial) => {
    Object.assign(metadata, partial);
  });
  vi.spyOn(room, "setSimulationInterval").mockImplementation(setSimulationInterval);
  vi.spyOn(room, "lock").mockImplementation(lock);
  vi.spyOn(room, "unlock").mockImplementation(unlock);
  vi.spyOn(room, "broadcast").mockImplementation(() => undefined);

  await room.onCreate({
    config: testConfig,
    ...options
  });

  rooms.push(room);
  return {
    room,
    internals: room as unknown as RoomInternals,
    metadata,
    privateValue,
    lock,
    unlock,
    setSimulationInterval
  };
};

const readArenaConfig = (room: BattleRoyaleRoom): TestArenaConfig => {
  const state = room.state as typeof room.state & {
    arenaConfigJson?: string;
    mapConfigJson?: string;
  };
  const arenaConfigJson = state.arenaConfigJson || state.mapConfigJson;
  expect(arenaConfigJson).toEqual(expect.any(String));
  return JSON.parse(arenaConfigJson ?? "{}") as TestArenaConfig;
};

const arenaBounds = (arena: TestArenaConfig): NonNullable<TestArenaConfig["bounds"]> => {
  if (arena.bounds) return arena.bounds;
  expect(arena.width).toEqual(expect.any(Number));
  expect(arena.height).toEqual(expect.any(Number));
  return {
    minX: 0,
    minY: 0,
    maxX: arena.width ?? 0,
    maxY: arena.height ?? 0
  };
};

const pickupPoints = (arena: TestArenaConfig): TestArenaPoint[] =>
  arena.pickupPlacements ?? arena.pickupPoints ?? [];

const firstInteriorWall = (arena: TestArenaConfig): TestArenaWall | undefined =>
  arena.collisionRects?.find((wall) => wall.x > TEST_TANK_RADIUS + 8 && wall.y > TEST_TANK_RADIUS + 8) ??
  arena.walls?.[0];

const wallLeft = (arena: TestArenaConfig, wall: TestArenaWall): number =>
  arena.collisionRects?.includes(wall) ? wall.x : wall.x - wall.width / 2;

const wallCenterY = (arena: TestArenaConfig, wall: TestArenaWall): number =>
  arena.collisionRects?.includes(wall) ? wall.y + wall.height / 2 : wall.y;

const findOpenDuelLine = (arena: TestArenaConfig) => {
  const bounds = arenaBounds(arena);
  const candidates = [
    { dx: 90, dy: 0 },
    { dx: -90, dy: 0 },
    { dx: 0, dy: 90 },
    { dx: 0, dy: -90 },
    { dx: 150, dy: 0 },
    { dx: 0, dy: 150 }
  ];

  for (const spawn of arena.spawnPoints) {
    for (const candidate of candidates) {
      const x = spawn.x + candidate.dx;
      const y = spawn.y + candidate.dy;
      if (
        x <= bounds.minX + TEST_TANK_RADIUS ||
        x >= bounds.maxX - TEST_TANK_RADIUS ||
        y <= bounds.minY + TEST_TANK_RADIUS ||
        y >= bounds.maxY - TEST_TANK_RADIUS
      ) {
        continue;
      }
      if (isWallCollision(arena as never, x, y, TEST_TANK_RADIUS)) continue;

      return {
        attackerX: spawn.x,
        attackerY: spawn.y,
        targetX: x,
        targetY: y
      };
    }
  }

  const fallback = arena.spawnPoints[0] ?? { x: bounds.minX + 120, y: bounds.minY + 120 };
  return {
    attackerX: fallback.x,
    attackerY: fallback.y,
    targetX: fallback.x + 90,
    targetY: fallback.y
  };
};

afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.onDispose();
  }
  vi.restoreAllMocks();
});

describe("BattleRoyaleRoom phase 3 lifecycle", () => {
  it("creates battle_royale metadata with private room code and configured rates", async () => {
    const { room, metadata, privateValue, setSimulationInterval } = await makeRoom({
      privateRoom: true,
      seed: " phase-3-seed "
    });

    expect(room.state.match.roomName).toBe(BATTLE_ROYALE_ROOM);
    expect(room.state.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.roomId).toBe(room.state.roomCode);
    expect(room.state.seed).toBe("phase-3-seed");
    expect(room.maxClients).toBe(testConfig.demoMaxPlayers);
    expect(room.patchRate).toBe(50);
    expect(privateValue).toBe(true);
    expect(setSimulationInterval).toHaveBeenCalledWith(expect.any(Function), 33);
    expect(metadata).toMatchObject({
      roomName: BATTLE_ROYALE_ROOM,
      roomCode: room.state.roomCode,
      private: true,
      matchState: "waiting",
      playerCount: 0,
      maxClients: testConfig.demoMaxPlayers,
      seed: "phase-3-seed"
    });
  });

  it("syncs deterministic arena config onto room state for clients", async () => {
    const { room } = await makeRoom({
      seed: "arena-seed"
    });

    const arena = readArenaConfig(room);
    const bounds = arenaBounds(arena);
    expect(arena.seed).toBe("arena-seed");
    expect(bounds).toMatchObject({
      minX: expect.any(Number),
      minY: expect.any(Number),
      maxX: expect.any(Number),
      maxY: expect.any(Number)
    });
    expect(arena.spawnPoints.length).toBeGreaterThanOrEqual(testConfig.demoMaxPlayers);
    expect(pickupPoints(arena).length).toBeGreaterThan(0);
    expect(arena.zonePhases.length).toBeGreaterThanOrEqual(3);
    expect(room.state.zone.radius).toBeGreaterThan(0);
  });

  it("populates players from join options with sanitized names, host selection, and tank defaults", async () => {
    const { room, internals, metadata } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");
    const arena = readArenaConfig(room);
    const hostSpawn = arena.spawnPoints[0];
    const guestSpawn = arena.spawnPoints[1];
    expect(hostSpawn).toBeDefined();
    expect(guestSpawn).toBeDefined();

    room.onJoin(host.client, {
      playerName: " <Rook>\nPilot ",
      archetypeId: "rook"
    });
    room.onJoin(guest.client, {
      playerName: "\u0000",
      archetypeId: "bogus"
    });

    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    expect(hostPlayer).toMatchObject({
      id: "host1",
      sessionId: "host1",
      name: "Rook Pilot",
      archetypeId: "rook",
      weaponType: "cannon",
      abilityType: "repair",
      maxHealth: 140,
      health: 140,
      maxArmor: 60,
      armor: 60,
      x: hostSpawn?.x,
      y: hostSpawn?.y,
      isHost: true,
      isReady: false
    });
    expect(guestPlayer).toMatchObject({
      name: "Player GUES",
      archetypeId: "atlas",
      x: guestSpawn?.x,
      y: guestSpawn?.y,
      isHost: false
    });

    internals.handleJoinMessage(guest.client, {
      playerName: "Rook Two",
      archetypeId: "rook"
    });
    expect(guestPlayer).toMatchObject({
      name: "Rook Two",
      archetypeId: "rook",
      maxHealth: 140,
      health: 140,
      maxArmor: 60,
      armor: 60
    });

    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.SYSTEM,
      expect.objectContaining({
        code: "player_joined",
        roomCode: room.state.roomCode,
        matchState: "waiting"
      })
    );
    expect(metadata.playerCount).toBe(2);
  });

  it("reassigns a single host when the lobby host leaves", async () => {
    const { room, metadata } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });

    room.onLeave(host.client);

    const guestPlayer = room.state.players.get(guest.client.sessionId);
    expect(room.state.players.has(host.client.sessionId)).toBe(false);
    expect(guestPlayer?.isHost).toBe(true);
    expect(metadata.playerCount).toBe(1);
  });

  it("allows already-reserved final seats when Colyseus auto-locks a waiting room at capacity", async () => {
    const { room, metadata } = await makeRoom({
      config: {
        ...testConfig,
        demoMaxPlayers: 2
      }
    });
    const host = makeClient("host1");
    const finalSeat = makeClient("seat2");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    Object.defineProperty(room, "locked", {
      configurable: true,
      get: () => true
    });

    expect(room.onAuth(finalSeat.client, {}, { headers: {}, ip: "127.0.0.1" } as AuthContext)).toBe(
      true
    );
    room.onJoin(finalSeat.client, { playerName: "Final", archetypeId: "atlas" });

    expect(room.state.players.has(finalSeat.client.sessionId)).toBe(true);
    expect(metadata.playerCount).toBe(2);
  });

  it("starts countdown when all joined players are ready and rejects active late joins by admission error", async () => {
    const { room, internals, metadata, lock, unlock } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");
    const late = makeClient("late1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });

    internals.handleReadyMessage(host.client, { ready: true });
    expect(room.state.matchState).toBe("waiting");

    internals.handleReadyMessage(guest.client, { ready: true });
    expect(room.state.matchState).toBe("countdown");
    expect(room.state.zonePhase.matchState).toBe("countdown");
    expect(room.state.match.countdownEndsAt).toBeGreaterThan(room.state.match.stateStartedAt);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(metadata.matchState).toBe("countdown");

    expect(() =>
      room.onAuth(late.client, {}, { headers: {}, ip: "127.0.0.1" } as AuthContext)
    ).toThrow(ServerError);
    try {
      room.onAuth(late.client, {}, { headers: {}, ip: "127.0.0.1" } as AuthContext);
    } catch (error) {
      expect((error as ServerError).code).toBe(ErrorCode.AUTH_FAILED);
    }

    room.onLeave(guest.client);
    expect(room.state.matchState).toBe("waiting");
    expect(room.state.zonePhase.matchState).toBe("waiting");
    expect(room.state.match.countdownEndsAt).toBe(0);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(room.onAuth(late.client, {}, { headers: {}, ip: "127.0.0.1" } as AuthContext)).toBe(
      true
    );
  });

  it("allows only the host to start countdown and requires at least two joined players", async () => {
    const { room, internals } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    internals.handleStartMessage(host.client, {});
    expect(room.state.matchState).toBe("waiting");
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_state",
        retryable: true
      })
    );

    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });
    internals.handleStartMessage(guest.client, {});
    expect(room.state.matchState).toBe("waiting");
    expect(guest.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_state",
        retryable: false
      })
    );

    internals.handleStartMessage(host.client, {});
    expect(room.state.matchState).toBe("countdown");
  });

  it("advances countdown to running, danger, final_zone, and finished through timed lifecycle skeleton", async () => {
    const { room, internals } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });
    internals.handleStartMessage(host.client, {});

    const runningAt = room.state.match.countdownEndsAt;
    internals.advanceTimedLifecycle(runningAt);
    expect(room.state.matchState).toBe("running");
    expect(room.state.zonePhase.matchState).toBe("running");
    expect(room.state.match.matchEndsAt).toBe(runningAt + 210_000);

    internals.advanceTimedLifecycle(runningAt + 90_000);
    expect(room.state.matchState).toBe("danger");

    internals.advanceTimedLifecycle(runningAt + 150_000);
    expect(room.state.matchState).toBe("final_zone");

    internals.advanceTimedLifecycle(runningAt + 210_000);
    expect(room.state.matchState).toBe("finished");
    expect(room.state.zonePhase.matchState).toBe("finished");
  });

  it("resets alive players to deterministic spawns and clean match state on start", async () => {
    const { room, internals } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");
    const arena = readArenaConfig(room);
    const hostSpawn = arena.spawnPoints[0];
    const guestSpawn = arena.spawnPoints[1];

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });
    internals.handleStartMessage(host.client, {});

    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    expect(hostPlayer).toBeDefined();
    expect(guestPlayer).toBeDefined();
    if (hostPlayer) {
      hostPlayer.x = 999;
      hostPlayer.y = -999;
      hostPlayer.health = 1;
      hostPlayer.armor = 0;
      hostPlayer.velocityX = 20;
      hostPlayer.velocityY = -20;
      hostPlayer.isReady = true;
    }
    internals.inputIntents.set(host.client.sessionId, {
      sequence: 99
    });

    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    expect(room.state.matchState).toBe("running");
    expect(hostPlayer).toMatchObject({
      x: hostSpawn?.x,
      y: hostSpawn?.y,
      health: 110,
      armor: 35,
      velocityX: 0,
      velocityY: 0,
      isAlive: true,
      isReady: false
    });
    expect(guestPlayer).toMatchObject({
      x: guestSpawn?.x,
      y: guestSpawn?.y,
      health: 90,
      armor: 20
    });
    expect(internals.inputIntents.size).toBe(0);
    expect(room.state.match.alivePlayers).toBe(2);
  });

  it("applies server-authoritative movement with arena bounds and wall collision", async () => {
    const { room, internals } = await makeRoom({
      seed: "movement-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "atlas" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const arena = readArenaConfig(room);
    const bounds = arenaBounds(arena);
    const collisionRadius = arena.spawnPoints[0]?.radius ?? TEST_TANK_RADIUS;
    const player = room.state.players.get(host.client.sessionId);
    expect(player).toBeDefined();
    if (!player) return;

    player.x = bounds.maxX - collisionRadius - 1;
    player.y = (bounds.minY + bounds.maxY) / 2;
    internals.handleInputMessage(host.client, {
      sequence: 1,
      tick: 1,
      moveX: 1,
      moveY: 0,
      aimX: bounds.minX,
      aimY: player.y + 100,
      fire: false,
      ability: false
    });
    internals.onSimulationTick(1_000);

    expect(player.x).toBeLessThanOrEqual(bounds.maxX - collisionRadius);
    expect(player.y).toBe((bounds.minY + bounds.maxY) / 2);
    expect(player.turretRotation).toBeGreaterThan(1.4);

    const wall = firstInteriorWall(arena);
    expect(wall).toBeDefined();
    if (!wall) return;

    const left = wallLeft(arena, wall);
    const centerY = wallCenterY(arena, wall);
    player.x = left - collisionRadius - 2;
    player.y = centerY;
    player.velocityX = 0;
    player.velocityY = 0;
    internals.handleInputMessage(host.client, {
      sequence: 2,
      tick: 2,
      moveX: 1,
      moveY: 0,
      aimX: left,
      aimY: centerY,
      fire: false,
      ability: false
    });
    internals.onSimulationTick(1_000);

    expect(player.x).toBeCloseTo(left - collisionRadius - 2);
    expect(player.velocityX).toBe(0);
  });

  it("expires stale movement intents instead of replaying old input forever", async () => {
    const { room, internals } = await makeRoom({
      seed: "stale-intent-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "atlas" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const player = room.state.players.get(host.client.sessionId);
    expect(player).toBeDefined();
    if (!player) return;
    const startX = player.x;
    const startY = player.y;

    internals.inputIntents.set(host.client.sessionId, {
      sequence: 10,
      tick: room.state.match.tick,
      moveX: 1,
      moveY: 0,
      aimX: startX + 100,
      aimY: startY,
      fire: false,
      ability: false,
      receivedAt: Date.now() - 1_000
    });
    internals.onSimulationTick(16);

    expect(player.x).toBe(startX);
    expect(player.y).toBe(startY);
    expect(player.velocityX).toBe(0);
    expect(player.velocityY).toBe(0);
    expect(internals.inputIntents.has(host.client.sessionId)).toBe(false);
  });

  it("keeps post-join payloads defensive and stores authoritative intent/rematch skeletons", async () => {
    const { room, internals } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });
    internals.handleInputMessage(host.client, {
      sequence: 1,
      tick: 1,
      moveX: 1,
      moveY: 0,
      aimX: 4,
      aimY: 2,
      fire: false,
      ability: false
    });
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_state"
      })
    );

    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);
    internals.handleInputMessage(host.client, {
      sequence: 2,
      tick: 3,
      moveX: 4,
      moveY: -4,
      aimX: 40,
      aimY: 20,
      fire: true,
      ability: false
    });
    expect(internals.inputIntents.get(host.client.sessionId)).toMatchObject({
      sequence: 2,
      moveX: 1,
      moveY: -1,
      fire: true
    });
    internals.handleFireMessage(host.client, {
      sequence: 6,
      weaponType: "explosive",
      aimX: 1,
      aimY: 2
    });
    expect(internals.fireIntents.has(host.client.sessionId)).toBe(false);
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_payload"
      })
    );

    internals.handleAbilityMessage(host.client, {
      sequence: 3,
      abilityType: "repair"
    });
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_payload"
      })
    );

    internals.handleRematchMessage(host.client, {
      ready: true,
      previousMatchId: room.state.match.matchId
    });
    expect(internals.rematchVotes.has(host.client.sessionId)).toBe(false);
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_state"
      })
    );

    const matchStartedAt = room.state.match.stateStartedAt;
    internals.advanceTimedLifecycle(matchStartedAt + 90_000);
    internals.advanceTimedLifecycle(matchStartedAt + 150_000);
    internals.advanceTimedLifecycle(matchStartedAt + 210_000);
    expect(room.state.matchState).toBe("finished");
    internals.handleRematchMessage(host.client, {
      ready: true,
      previousMatchId: room.state.match.matchId
    });
    expect(internals.rematchVotes.get(host.client.sessionId)).toMatchObject({
      ready: true,
      previousMatchId: room.state.match.matchId
    });
  });

  it("rejects active intents from dead or spectator players", async () => {
    const { room, internals } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "quill" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    if (hostPlayer) {
      hostPlayer.isAlive = false;
    }
    if (guestPlayer) {
      guestPlayer.isSpectator = true;
    }

    internals.handleInputMessage(host.client, {
      sequence: 4,
      tick: 4,
      moveX: 1,
      moveY: 0,
      aimX: 4,
      aimY: 2,
      fire: false,
      ability: false
    });
    internals.handleFireMessage(guest.client, {
      sequence: 5,
      aimX: 1,
      aimY: 2
    });

    expect(internals.inputIntents.has(host.client.sessionId)).toBe(false);
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_state"
      })
    );
    expect(guest.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "invalid_state"
      })
    );
  });

  it("simulates projectile hits, awards the kill, and finishes on the last elimination", async () => {
    const { room, internals } = await makeRoom({
      seed: "projectile-finish-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "quill" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "atlas" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const arena = readArenaConfig(room);
    const duel = findOpenDuelLine(arena);
    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    expect(hostPlayer).toBeDefined();
    expect(guestPlayer).toBeDefined();
    if (!hostPlayer || !guestPlayer) return;

    hostPlayer.x = duel.attackerX;
    hostPlayer.y = duel.attackerY;
    guestPlayer.x = duel.targetX;
    guestPlayer.y = duel.targetY;
    guestPlayer.armor = 0;
    guestPlayer.health = 6;

    internals.handleFireMessage(host.client, {
      sequence: 1,
      weaponType: hostPlayer.weaponType,
      aimX: guestPlayer.x,
      aimY: guestPlayer.y
    });
    internals.onSimulationTick(100);

    expect(room.state.projectiles.length).toBe(0);
    expect(guestPlayer).toMatchObject({
      isAlive: false,
      isSpectator: true,
      placement: 2,
      deaths: 1
    });
    expect(hostPlayer).toMatchObject({
      kills: 1,
      placement: 1
    });
    expect(room.state.matchState).toBe("finished");
    expect(room.state.match.alivePlayers).toBe(1);
  });

  it("applies zone damage outside the safe area during danger and final zone states", async () => {
    const { room, internals } = await makeRoom({
      seed: "zone-damage-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "rook" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const runningStartedAt = room.state.match.stateStartedAt;
    internals.advanceTimedLifecycle(runningStartedAt + 90_000);
    expect(room.state.matchState).toBe("danger");

    const arena = readArenaConfig(room);
    const bounds = arenaBounds(arena);
    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    expect(hostPlayer).toBeDefined();
    expect(guestPlayer).toBeDefined();
    if (!hostPlayer || !guestPlayer) return;

    hostPlayer.x = room.state.zone.x;
    hostPlayer.y = room.state.zone.y;

    const outsideRight = Math.min(
      bounds.maxX - TEST_TANK_RADIUS,
      room.state.zone.x + room.state.zone.radius + 120
    );
    guestPlayer.x =
      outsideRight > room.state.zone.x + room.state.zone.radius
        ? outsideRight
        : Math.max(bounds.minX + TEST_TANK_RADIUS, room.state.zone.x - room.state.zone.radius - 120);
    guestPlayer.y = room.state.zone.y;
    guestPlayer.shield = 0;
    guestPlayer.armor = 0;
    guestPlayer.health = 100;

    for (let tick = 0; tick < 30; tick += 1) {
      internals.onSimulationTick(33);
    }

    expect(guestPlayer.health).toBe(93);
    internals.onSimulationTick(33);
    expect(guestPlayer.health).toBe(92);

    internals.advanceTimedLifecycle(runningStartedAt + 150_000);
    expect(room.state.matchState).toBe("final_zone");
    const healthBeforeFinal = guestPlayer.health;
    for (let tick = 0; tick < 10; tick += 1) {
      internals.onSimulationTick(100);
    }
    expect(guestPlayer.health).toBeLessThan(healthBeforeFinal);
  });

  it("resolves a deterministic winner when final-zone damage eliminates all tanks in one tick", async () => {
    const { room, internals } = await makeRoom({
      seed: "zone-tiebreak-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");
    const closer = makeClient("closer1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "rook" });
    room.onJoin(closer.client, { playerName: "Closer", archetypeId: "quill" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const runningStartedAt = room.state.match.stateStartedAt;
    internals.advanceTimedLifecycle(runningStartedAt + 90_000);
    internals.advanceTimedLifecycle(runningStartedAt + 150_000);
    expect(room.state.matchState).toBe("final_zone");

    const arena = readArenaConfig(room);
    const bounds = arenaBounds(arena);
    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    const closerPlayer = room.state.players.get(closer.client.sessionId);
    expect(hostPlayer).toBeDefined();
    expect(guestPlayer).toBeDefined();
    expect(closerPlayer).toBeDefined();
    if (!hostPlayer || !guestPlayer || !closerPlayer) return;

    const corners = [
      { x: bounds.minX + TEST_TANK_RADIUS, y: bounds.minY + TEST_TANK_RADIUS },
      { x: bounds.maxX - TEST_TANK_RADIUS, y: bounds.minY + TEST_TANK_RADIUS },
      { x: bounds.minX + TEST_TANK_RADIUS, y: bounds.maxY - TEST_TANK_RADIUS },
      { x: bounds.maxX - TEST_TANK_RADIUS, y: bounds.maxY - TEST_TANK_RADIUS }
    ].sort(
      (left, right) =>
        Math.hypot(right.x - room.state.zone.x, right.y - room.state.zone.y) -
        Math.hypot(left.x - room.state.zone.x, left.y - room.state.zone.y)
    );
    const outside = corners[0];
    expect(Math.hypot(outside.x - room.state.zone.x, outside.y - room.state.zone.y)).toBeGreaterThan(
      room.state.zone.radius
    );

    hostPlayer.x = outside.x;
    hostPlayer.y = outside.y;
    guestPlayer.x = outside.x;
    guestPlayer.y = outside.y;
    closerPlayer.x = outside.x;
    closerPlayer.y = outside.y;
    hostPlayer.shield = 0;
    hostPlayer.armor = 0;
    hostPlayer.health = 1;
    hostPlayer.damageDealt = 30;
    guestPlayer.shield = 0;
    guestPlayer.armor = 0;
    guestPlayer.health = 1;
    guestPlayer.damageDealt = 50;
    closerPlayer.shield = 0;
    closerPlayer.armor = 0;
    closerPlayer.health = 1;
    closerPlayer.damageDealt = 80;

    internals.onSimulationTick(1000);

    expect(room.state.matchState).toBe("finished");
    expect(room.state.match.alivePlayers).toBe(1);
    expect(closerPlayer).toMatchObject({
      isAlive: true,
      isSpectator: false,
      placement: 1
    });
    expect(hostPlayer).toMatchObject({
      isAlive: false,
      isSpectator: true,
      placement: 3
    });
    expect(guestPlayer).toMatchObject({
      isAlive: false,
      isSpectator: true,
      placement: 3
    });
  });

  it("collects pickups, applies server-side effects, and respawns inactive pickups", async () => {
    const { room, internals } = await makeRoom({
      seed: "pickup-effects-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "atlas" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "rook" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const hostPlayer = room.state.players.get(host.client.sessionId);
    const pickup = room.state.pickups[0];
    expect(hostPlayer).toBeDefined();
    expect(pickup).toBeDefined();
    if (!hostPlayer || !pickup) return;

    hostPlayer.health = 50;
    pickup.pickupType = "health_repair";
    pickup.value = PICKUP_CONFIG.health_repair.value;
    pickup.durationMs = PICKUP_CONFIG.health_repair.durationMs;
    pickup.x = hostPlayer.x;
    pickup.y = hostPlayer.y;
    pickup.isActive = true;
    internals.onSimulationTick(16);

    expect(hostPlayer.health).toBe(85);
    expect(pickup.isActive).toBe(false);

    pickup.isActive = true;
    pickup.pickupType = "ability_charge";
    pickup.value = PICKUP_CONFIG.ability_charge.value;
    pickup.durationMs = PICKUP_CONFIG.ability_charge.durationMs;
    hostPlayer.abilityCharge = 0;
    internals.onSimulationTick(16);
    expect(hostPlayer.abilityCharge).toBeGreaterThanOrEqual(PICKUP_CONFIG.ability_charge.value);

    pickup.isActive = true;
    pickup.pickupType = "barrage_explosive";
    pickup.value = PICKUP_CONFIG.barrage_explosive.value;
    pickup.durationMs = PICKUP_CONFIG.barrage_explosive.durationMs;
    hostPlayer.ammo = 24;
    internals.onSimulationTick(16);
    expect(hostPlayer.weaponType).toBe("explosive");
    expect(hostPlayer.ammo).toBe(WEAPON_CONFIG.explosive.ammoCost * 3);

    pickup.isActive = false;
    pickup.respawnsAt = Date.now() - 1;
    internals.onSimulationTick(16);
    expect(pickup.isActive).toBe(true);
  });

  it("applies speed burst movement and rejects ability spam while cooling down", async () => {
    const { room, internals } = await makeRoom({
      seed: "speed-burst-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "atlas" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const arena = readArenaConfig(room);
    const duel = findOpenDuelLine(arena);
    const hostPlayer = room.state.players.get(host.client.sessionId);
    expect(hostPlayer).toBeDefined();
    if (!hostPlayer) return;

    hostPlayer.x = duel.attackerX;
    hostPlayer.y = duel.attackerY;

    internals.handleAbilityMessage(host.client, {
      sequence: 1,
      abilityType: "speed_burst"
    });
    internals.onSimulationTick(16);

    const startX = hostPlayer.x;
    const startY = hostPlayer.y;
    const moveX = Math.sign(duel.targetX - duel.attackerX) || 1;
    const moveY = Math.sign(duel.targetY - duel.attackerY);
    internals.handleInputMessage(host.client, {
      sequence: 9,
      tick: 9,
      moveX,
      moveY,
      aimX: duel.targetX,
      aimY: duel.targetY,
      fire: false,
      ability: false
    });
    internals.onSimulationTick(100);

    expect(Math.hypot(hostPlayer.x - startX, hostPlayer.y - startY)).toBeGreaterThan(35);
    expect(hostPlayer.abilityCooldownMs).toBeGreaterThan(0);
    expect(hostPlayer.abilityCharge).toBeLessThan(100);

    internals.handleAbilityMessage(host.client, {
      sequence: 2,
      abilityType: "speed_burst"
    });
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "rate_limited",
        field: "ability"
      })
    );
  });

  it("drops stale fire intents and rejects weapon spam while cooling down", async () => {
    const { room, internals } = await makeRoom({
      seed: "fire-cooldown-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "nova" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "rook" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const arena = readArenaConfig(room);
    const duel = findOpenDuelLine(arena);
    const hostPlayer = room.state.players.get(host.client.sessionId);
    expect(hostPlayer).toBeDefined();
    if (!hostPlayer) return;
    hostPlayer.x = duel.attackerX;
    hostPlayer.y = duel.attackerY;

    internals.fireIntents.set(host.client.sessionId, {
      sequence: 1,
      weaponType: hostPlayer.weaponType,
      aimX: duel.targetX,
      aimY: duel.targetY,
      receivedAt: Date.now() - 1_000
    });
    internals.onSimulationTick(16);

    expect(room.state.projectiles.length).toBe(0);
    expect(internals.fireIntents.has(host.client.sessionId)).toBe(false);

    internals.handleFireMessage(host.client, {
      sequence: 2,
      weaponType: hostPlayer.weaponType,
      aimX: duel.targetX,
      aimY: duel.targetY
    });
    internals.onSimulationTick(16);
    expect(room.state.projectiles.length).toBe(1);

    internals.handleFireMessage(host.client, {
      sequence: 3,
      weaponType: hostPlayer.weaponType,
      aimX: duel.targetX,
      aimY: duel.targetY
    });
    expect(host.send).toHaveBeenCalledWith(
      SERVER_MESSAGE_TYPES.ERROR,
      expect.objectContaining({
        code: "rate_limited",
        field: "fire"
      })
    );
  });

  it("resets the match once all connected players vote for a rematch", async () => {
    const { room, internals } = await makeRoom({
      seed: "rematch-seed"
    });
    const host = makeClient("host1");
    const guest = makeClient("guest1");

    room.onJoin(host.client, { playerName: "Host", archetypeId: "quill" });
    room.onJoin(guest.client, { playerName: "Guest", archetypeId: "atlas" });
    internals.handleStartMessage(host.client, {});
    internals.advanceTimedLifecycle(room.state.match.countdownEndsAt);

    const arena = readArenaConfig(room);
    const duel = findOpenDuelLine(arena);
    const hostPlayer = room.state.players.get(host.client.sessionId);
    const guestPlayer = room.state.players.get(guest.client.sessionId);
    expect(hostPlayer).toBeDefined();
    expect(guestPlayer).toBeDefined();
    if (!hostPlayer || !guestPlayer) return;

    hostPlayer.x = duel.attackerX;
    hostPlayer.y = duel.attackerY;
    guestPlayer.x = duel.targetX;
    guestPlayer.y = duel.targetY;
    guestPlayer.armor = 0;
    guestPlayer.health = 6;

    internals.handleFireMessage(host.client, {
      sequence: 1,
      weaponType: hostPlayer.weaponType,
      aimX: guestPlayer.x,
      aimY: guestPlayer.y
    });
    internals.onSimulationTick(100);
    expect(room.state.matchState).toBe("finished");

    const previousMatchId = room.state.match.matchId;
    const previousRound = room.state.match.round;

    internals.handleRematchMessage(host.client, {
      ready: true,
      previousMatchId
    });
    expect(hostPlayer.isReady).toBe(true);
    expect(room.state.matchState).toBe("finished");

    internals.handleRematchMessage(host.client, {
      ready: false,
      previousMatchId
    });
    expect(hostPlayer.isReady).toBe(false);
    expect(room.state.matchState).toBe("finished");

    internals.handleRematchMessage(host.client, {
      ready: true,
      previousMatchId
    });
    expect(hostPlayer.isReady).toBe(true);

    internals.handleRematchMessage(guest.client, {
      ready: true,
      previousMatchId
    });

    expect(room.state.match.round).toBe(previousRound + 1);
    expect(room.state.match.matchId).not.toBe(previousMatchId);
    expect(["waiting", "countdown"]).toContain(room.state.matchState);
    expect(hostPlayer).toMatchObject({
      isAlive: true,
      isSpectator: false,
      placement: 0
    });
    expect(guestPlayer).toMatchObject({
      isAlive: true,
      isSpectator: false,
      placement: 0
    });
  });
});
