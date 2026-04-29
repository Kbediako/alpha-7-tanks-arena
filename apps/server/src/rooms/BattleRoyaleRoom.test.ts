import { EventEmitter } from "node:events";
import { ErrorCode, ServerError, type AuthContext, type Client } from "colyseus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BATTLE_ROYALE_ROOM, SERVER_MESSAGE_TYPES } from "@alpha7/shared";
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
  fireIntents: Map<string, unknown>;
  inputIntents: Map<string, unknown>;
  rematchVotes: Map<string, unknown>;
};

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

  it("populates players from join options with sanitized names, host selection, and tank defaults", async () => {
    const { room, internals, metadata } = await makeRoom();
    const host = makeClient("host1");
    const guest = makeClient("guest1");

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
      isHost: true,
      isReady: false
    });
    expect(guestPlayer).toMatchObject({
      name: "Player GUES",
      archetypeId: "atlas",
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
});
