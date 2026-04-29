import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Client, type Room } from "colyseus.js";
import {
  ABILITY_CONFIG,
  BATTLE_ROYALE_ROOM,
  CLIENT_MESSAGE_TYPES,
  DEFAULT_TANK_ARCHETYPE,
  SERVER_MESSAGE_TYPES,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
  WEAPON_CONFIG,
  type AbilityMessagePayload,
  type ErrorMessagePayload,
  type FireMessagePayload,
  type InputMessagePayload,
  type JoinMessagePayload,
  type ReadyMessagePayload,
  type StartMessagePayload,
  type SystemMessagePayload,
  type TankArchetypeId
} from "@alpha7/shared";
import { Alpha7StateSchema } from "@alpha7/shared/schema";
import {
  Check,
  Copy,
  Crosshair,
  Gauge,
  Lock,
  LogOut,
  Map,
  Play,
  RadioTower,
  Shield,
  Target,
  Unlock,
  WifiOff,
  Wrench,
  Zap
} from "lucide-react";
import { ArenaRenderer, type LocalPose } from "./ArenaRenderer";
import {
  endpointFromEnv,
  isActiveMatchState,
  isWaitingRoomState,
  previewSnapshot,
  snapshotFromState,
  type ClientPlayer,
  type ClientSnapshot,
  type ConnectionStatus,
  type InputFrame,
  type JoinMode,
  type ScreenMode
} from "./clientState";

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    render_game_to_text?: () => string;
  }
}

const statLabels = ["firepower", "armor", "mobility", "support"] as const;
const archetypes = TANK_ARCHETYPES.map((id) => TANK_ARCHETYPE_CONFIG[id]);

const defaultInputFrame = (): InputFrame => ({
  moveX: 0,
  moveY: 0,
  aimScreenX: 0,
  aimScreenY: 0,
  aimWorldX: 520,
  aimWorldY: 0,
  aimDirX: 1,
  aimDirY: 0,
  fire: false,
  ability: false
});

const sanitizeName = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 18) || "Operator";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeVector = (x: number, y: number): { x: number; y: number } => {
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
};

const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  Boolean(target.closest("button, input, select, textarea, a, .interactive-panel"));

const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

function Dots({ value }: { value: number }) {
  return (
    <span className="dots" aria-label={`${value} of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span className={index < value ? "dot is-filled" : "dot"} key={index} />
      ))}
    </span>
  );
}

function TankCard({
  selected,
  tank,
  onSelect
}: {
  selected: boolean;
  tank: (typeof TANK_ARCHETYPE_CONFIG)[TankArchetypeId];
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "tank-card is-selected" : "tank-card"}
      onClick={onSelect}
      type="button"
    >
      <span className="tank-card-title">
        <strong>{tank.name}</strong>
        <small>{tank.role}</small>
      </span>
      <span className="tank-card-description">{tank.description}</span>
      {statLabels.map((label) => (
        <span className="stat-row" key={label}>
          <em>{label}</em>
          <Dots value={tank.stats[label]} />
        </span>
      ))}
    </button>
  );
}

function NetworkBadge({
  status,
  endpoint
}: {
  status: ConnectionStatus;
  endpoint: string;
}) {
  const label =
    status === "connected"
      ? "online"
      : status === "connecting"
        ? "linking"
        : status === "error"
          ? "error"
          : status === "offline"
            ? "offline"
            : "idle";
  return (
    <span className={`network-badge is-${status}`}>
      {status === "error" || status === "offline" ? <WifiOff size={14} /> : <RadioTower size={14} />}
      <span>{label}</span>
      <b>{endpoint.replace(/^wss?:\/\//, "")}</b>
    </span>
  );
}

function PlayerRow({ player }: { player: ClientPlayer }) {
  return (
    <li className={player.isSelf ? "player-row is-self" : "player-row"}>
      <span className="player-index">{player.isHost ? "H" : player.isReady ? "R" : "--"}</span>
      <span className="player-dot" />
      <span className="player-name">{player.name}</span>
      <span className="player-kit">{TANK_ARCHETYPE_CONFIG[player.archetypeId].name}</span>
    </li>
  );
}

function MenuPanel({
  endpoint,
  isConnecting,
  joinCode,
  networkMessage,
  playerName,
  selectedTank,
  setJoinCode,
  setPlayerName,
  setSelectedTank,
  onJoin
}: {
  endpoint: string;
  isConnecting: boolean;
  joinCode: string;
  networkMessage: string;
  playerName: string;
  selectedTank: TankArchetypeId;
  setJoinCode: (value: string) => void;
  setPlayerName: (value: string) => void;
  setSelectedTank: (value: TankArchetypeId) => void;
  onJoin: (mode: JoinMode) => void;
}) {
  return (
    <>
      <section className="landing-panel hud-panel interactive-panel" aria-label="Alpha-7 join panel">
        <div className="panel-heading">
          <span>Room Protocol</span>
          <span>{BATTLE_ROYALE_ROOM}</span>
        </div>
        <h1>Alpha-7</h1>
        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            onJoin(joinCode.trim() ? "code" : "quick");
          }}
        >
          <label>
            Callsign
            <input
              autoComplete="nickname"
              maxLength={18}
              name="playerName"
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="Operator"
              value={playerName}
            />
          </label>
          <div className="action-grid">
            <button className="primary-button" disabled={isConnecting} type="submit">
              <Play size={17} />
              Quick Play
            </button>
            <button
              className="secondary-button"
              disabled={isConnecting}
              onClick={() => onJoin("public")}
              type="button"
            >
              <Unlock size={17} />
              Public
            </button>
            <button
              className="secondary-button"
              disabled={isConnecting}
              onClick={() => onJoin("private")}
              type="button"
            >
              <Lock size={17} />
              Private
            </button>
          </div>
          <div className="room-code-entry">
            <label>
              Room Code
              <input
                autoCapitalize="off"
                autoCorrect="off"
                maxLength={16}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="A7CODE / room ID"
                spellCheck={false}
                value={joinCode}
              />
            </label>
            <button
              className="secondary-button"
              disabled={isConnecting || !joinCode.trim()}
              onClick={() => onJoin("code")}
              type="button"
            >
              <Target size={17} />
              Join
            </button>
          </div>
        </form>
        {networkMessage ? <p className="network-message">{networkMessage}</p> : null}
        <NetworkBadge endpoint={endpoint} status={isConnecting ? "connecting" : "idle"} />
      </section>

      <section className="tank-select hud-panel interactive-panel" aria-label="Tank selection">
        <div className="panel-heading">
          <span>Tank Kit</span>
          <span>4 Chassis</span>
        </div>
        <div className="tank-grid">
          {archetypes.map((tank) => (
            <TankCard
              key={tank.id}
              onSelect={() => setSelectedTank(tank.id)}
              selected={tank.id === selectedTank}
              tank={tank}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function LobbyPanel({
  connectionStatus,
  endpoint,
  networkMessage,
  now,
  snapshot,
  onCopyCode,
  onLeave,
  onReady,
  onStart
}: {
  connectionStatus: ConnectionStatus;
  endpoint: string;
  networkMessage: string;
  now: number;
  snapshot: ClientSnapshot;
  onCopyCode: () => void;
  onLeave: () => void;
  onReady: () => void;
  onStart: () => void;
}) {
  const self = snapshot.self;
  const readyCount = snapshot.players.filter((player) => player.isReady).length;
  const canStart = Boolean(self?.isHost);
  const countdown = snapshot.matchState === "countdown" ? formatTime(snapshot.countdownEndsAt - now) : null;

  return (
    <section className="lobby-panel hud-panel interactive-panel" aria-label="Lobby waiting room">
      <div className="panel-heading">
        <span>{snapshot.matchState === "countdown" ? "Countdown" : "Waiting Room"}</span>
        <span>{readyCount}/{snapshot.players.length} Ready</span>
      </div>
      <div className="room-code-display">
        <span>{snapshot.roomCode}</span>
        <button aria-label="Copy room code" className="icon-button" onClick={onCopyCode} type="button">
          <Copy size={17} />
        </button>
      </div>
      {countdown ? <div className="countdown-block">{countdown}</div> : null}
      <ul className="player-list">
        {snapshot.players.map((player) => (
          <PlayerRow key={player.sessionId} player={player} />
        ))}
      </ul>
      <div className="lobby-actions">
        <button className={self?.isReady ? "secondary-button is-active" : "primary-button"} onClick={onReady} type="button">
          <Check size={17} />
          {self?.isReady ? "Ready" : "Ready Up"}
        </button>
        <button className="secondary-button" disabled={!canStart} onClick={onStart} type="button">
          <Play size={17} />
          Start
        </button>
        <button aria-label="Leave room" className="icon-button" onClick={onLeave} type="button">
          <LogOut size={17} />
        </button>
      </div>
      {networkMessage ? <p className="network-message">{networkMessage}</p> : null}
      <NetworkBadge endpoint={endpoint} status={connectionStatus} />
    </section>
  );
}

function MatchHeader({ now, snapshot }: { now: number; snapshot: ClientSnapshot }) {
  const timer =
    snapshot.matchState === "countdown"
      ? formatTime(snapshot.countdownEndsAt - now)
      : snapshot.matchEndsAt > 0
        ? formatTime(snapshot.matchEndsAt - now)
        : "--:--";
  const aliveCount = isActiveMatchState(snapshot.matchState)
    ? snapshot.alivePlayers
    : snapshot.players.filter((player) => !player.isSpectator).length;

  return (
    <section className="hud-panel match-header" aria-label="Match status">
      <span>ROOM {snapshot.roomCode}</span>
      <strong>{timer}</strong>
      <span>{snapshot.matchState.toUpperCase()} / {aliveCount} ALIVE</span>
    </section>
  );
}

function MiniMap({ snapshot, localPose }: { snapshot: ClientSnapshot; localPose: LocalPose }) {
  const markers = snapshot.players.map((player) => {
    const x = player.isSelf ? localPose.x : player.x;
    const y = player.isSelf ? localPose.y : player.y;
    return {
      id: player.sessionId,
      isSelf: player.isSelf,
      left: clamp((x / snapshot.map.width) * 100, 2, 98),
      top: clamp((y / snapshot.map.height) * 100, 2, 98)
    };
  });

  return (
    <section className="hud-panel minimap-panel" aria-label="Minimap">
      <header>
        <Map size={16} />
        <span>MAP</span>
        <b>{snapshot.map.source === "server" ? "SYNC" : "LOCAL"}</b>
      </header>
      <div className="minimap-grid">
        {snapshot.map.walls.slice(0, 22).map((wall) => (
          <span
            className="minimap-wall"
            key={wall.id}
            style={{
              height: `${clamp((wall.height / snapshot.map.height) * 100, 2, 100)}%`,
              left: `${clamp((wall.x / snapshot.map.width) * 100, 0, 100)}%`,
              top: `${clamp((wall.y / snapshot.map.height) * 100, 0, 100)}%`,
              width: `${clamp((wall.width / snapshot.map.width) * 100, 2, 100)}%`
            }}
          />
        ))}
        {markers.map((marker) => (
          <span
            className={marker.isSelf ? "self-marker" : "threat-marker"}
            key={marker.id}
            style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
          />
        ))}
      </div>
    </section>
  );
}

function TankStatusCard({ player }: { player: ClientPlayer | null }) {
  if (!player) return null;
  const tank = TANK_ARCHETYPE_CONFIG[player.archetypeId];
  const healthRatio = clamp(player.health / Math.max(1, player.maxHealth), 0, 1);
  const armorRatio = clamp(player.armor / Math.max(1, player.maxArmor), 0, 1);

  return (
    <section className="hud-panel tank-status-card" aria-label="Tank status">
      <div className="tank-status-head">
        <span>
          <strong>{tank.name}</strong>
          <em>{tank.role}</em>
        </span>
        <b>{player.name}</b>
      </div>
      <div className="status-meter">
        <span>Health</span>
        <b>{Math.round(player.health)} / {player.maxHealth}</b>
        <i style={{ width: `${healthRatio * 100}%` }} />
      </div>
      <div className="status-meter armor-meter">
        <span>Armor</span>
        <b>{Math.round(player.armor)} / {player.maxArmor}</b>
        <i style={{ width: `${armorRatio * 100}%` }} />
      </div>
      <div className="tank-meta-grid">
        <span>
          <Gauge size={15} />
          {tank.speed}
        </span>
        <span>
          <Crosshair size={15} />
          {WEAPON_CONFIG[player.weaponType].name}
        </span>
      </div>
    </section>
  );
}

function WeaponStrip({ player }: { player: ClientPlayer | null }) {
  if (!player) return null;
  const weapon = WEAPON_CONFIG[player.weaponType];
  const ammo = player.ammo > 0 ? player.ammo : weapon.category === "rapid" ? 60 : 24;
  return (
    <section className="hud-panel weapon-strip" aria-label="Weapon strip">
      <span className="weapon-name">
        <Crosshair size={17} />
        {weapon.name}
      </span>
      <span className="ammo-readout">{ammo}</span>
      <span className="weapon-dots" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <i className={index < Math.min(7, Math.ceil(ammo / 8)) ? "is-hot" : ""} key={index} />
        ))}
      </span>
      <span className="weapon-type">{weapon.category}</span>
    </section>
  );
}

function AbilityDock({
  player,
  onAbility
}: {
  player: ClientPlayer | null;
  onAbility: (abilityType?: ClientPlayer["abilityType"]) => void;
}) {
  if (!player) return null;
  const ability = ABILITY_CONFIG[player.abilityType];
  const abilityIcon = player.abilityType === "repair" ? <Wrench size={21} /> : player.abilityType === "shield_pulse" ? <Shield size={21} /> : player.abilityType === "speed_burst" ? <Zap size={21} /> : <RadioTower size={21} />;

  return (
    <section className="hud-panel ability-dock interactive-panel" aria-label="Ability dock">
      <button className="is-primary" onClick={() => onAbility(player.abilityType)} type="button">
        {abilityIcon}
        <span>{ability.name}</span>
      </button>
      <button onClick={() => onAbility(player.abilityType)} type="button">
        <Shield size={21} />
        <span>Pulse</span>
      </button>
      <button onClick={() => onAbility(player.abilityType)} type="button">
        <Wrench size={21} />
        <span>Repair</span>
      </button>
      <button onClick={() => onAbility(player.abilityType)} type="button">
        <Target size={21} />
        <span>Mark</span>
      </button>
    </section>
  );
}

function MobileControls({
  joystickKnob,
  onAbility,
  onAimPointerDown,
  onAimPointerMove,
  onAimPointerUp,
  onFireDown,
  onFireUp,
  onStickPointerDown,
  onStickPointerMove,
  onStickPointerUp
}: {
  joystickKnob: { x: number; y: number };
  onAbility: () => void;
  onAimPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onAimPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onAimPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onFireDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onFireUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onStickPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onStickPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onStickPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="mobile-controls interactive-panel" aria-label="Mobile controls">
      <div
        className="mobile-stick"
        onPointerCancel={onStickPointerUp}
        onPointerDown={onStickPointerDown}
        onPointerMove={onStickPointerMove}
        onPointerUp={onStickPointerUp}
      >
        <span style={{ transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)` }} />
      </div>
      <div
        className="mobile-aim-zone"
        onPointerCancel={onAimPointerUp}
        onPointerDown={onAimPointerDown}
        onPointerMove={onAimPointerMove}
        onPointerUp={onAimPointerUp}
      >
        <Crosshair size={26} />
      </div>
      <button
        className="mobile-fire-button"
        onPointerCancel={onFireUp}
        onPointerDown={onFireDown}
        onPointerUp={onFireUp}
        type="button"
      >
        <Target size={24} />
      </button>
      <button className="mobile-ability-button" onClick={onAbility} type="button">
        <Zap size={23} />
      </button>
    </div>
  );
}

export function App() {
  const endpoint = useMemo(() => endpointFromEnv(), []);
  const [playerName, setPlayerName] = useState("Operator");
  const [selectedTank, setSelectedTank] = useState<TankArchetypeId>(DEFAULT_TANK_ARCHETYPE);
  const [joinCode, setJoinCode] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [networkMessage, setNetworkMessage] = useState("");
  const [snapshot, setSnapshot] = useState<ClientSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fireSignal, setFireSignal] = useState(0);
  const [abilitySignal, setAbilitySignal] = useState(0);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });

  const inputRef = useRef<InputFrame>(defaultInputFrame());
  const roomRef = useRef<Room<Alpha7StateSchema> | null>(null);
  const snapshotRef = useRef<ClientSnapshot | null>(null);
  const roomTokenRef = useRef(0);
  const sequenceRef = useRef(1);
  const localPoseRef = useRef<LocalPose>({ x: 0, y: 0, rotation: 0, turretRotation: 0 });
  const keyboardMoveRef = useRef({ x: 0, y: 0 });
  const joystickMoveRef = useRef({ x: 0, y: 0 });
  const pressedKeysRef = useRef(new Set<string>());
  const fireThrottleRef = useRef(0);

  const displaySnapshot = useMemo(
    () => snapshot ?? previewSnapshot(selectedTank, playerName),
    [playerName, selectedTank, snapshot]
  );
  const screenMode: ScreenMode = snapshot
    ? isWaitingRoomState(snapshot.matchState)
      ? "lobby"
      : "playing"
    : "menu";
  const active = isActiveMatchState(displaySnapshot.matchState);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const recomputeMove = useCallback(() => {
    const combined = normalizeVector(
      keyboardMoveRef.current.x + joystickMoveRef.current.x,
      keyboardMoveRef.current.y + joystickMoveRef.current.y
    );
    inputRef.current.moveX = combined.x;
    inputRef.current.moveY = combined.y;
  }, []);

  const sendInputIntent = useCallback(() => {
    const room = roomRef.current;
    const currentSnapshot = snapshotRef.current;
    if (!room || !currentSnapshot || !isActiveMatchState(currentSnapshot.matchState)) return;
    const input = inputRef.current;
    const payload: InputMessagePayload = {
      sequence: sequenceRef.current++,
      tick: currentSnapshot.tick,
      moveX: input.moveX,
      moveY: input.moveY,
      aimX: input.aimWorldX,
      aimY: input.aimWorldY,
      fire: input.fire,
      ability: input.ability
    };
    try {
      room.send(CLIENT_MESSAGE_TYPES.INPUT, payload);
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "Input send failed");
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(sendInputIntent, 50);
    return () => window.clearInterval(timer);
  }, [sendInputIntent]);

  const triggerFire = useCallback(() => {
    const time = performance.now();
    if (time - fireThrottleRef.current < 120) return;
    fireThrottleRef.current = time;
    setFireSignal((value) => value + 1);

    const room = roomRef.current;
    const currentSnapshot = snapshotRef.current;
    if (!room || !currentSnapshot || !isActiveMatchState(currentSnapshot.matchState)) return;
    const self = currentSnapshot.self;
    const input = inputRef.current;
    const pose = localPoseRef.current;
    const payload: FireMessagePayload = {
      sequence: sequenceRef.current++,
      weaponType: self?.weaponType,
      aimX: input.aimWorldX || pose.x + input.aimDirX * 560,
      aimY: input.aimWorldY || pose.y + input.aimDirY * 560,
      chargeMs: 0
    };
    try {
      room.send(CLIENT_MESSAGE_TYPES.FIRE, payload);
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "Fire send failed");
    }
  }, []);

  const triggerAbility = useCallback((abilityType?: ClientPlayer["abilityType"]) => {
    setAbilitySignal((value) => value + 1);
    inputRef.current.ability = true;
    window.setTimeout(() => {
      inputRef.current.ability = false;
    }, 140);

    const room = roomRef.current;
    const currentSnapshot = snapshotRef.current;
    const self = currentSnapshot?.self;
    if (!room || !currentSnapshot || !self || !isActiveMatchState(currentSnapshot.matchState)) return;
    const input = inputRef.current;
    const payload: AbilityMessagePayload = {
      sequence: sequenceRef.current++,
      abilityType: abilityType ?? self.abilityType,
      targetX: input.aimWorldX,
      targetY: input.aimWorldY
    };
    try {
      room.send(CLIENT_MESSAGE_TYPES.ABILITY, payload);
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "Ability send failed");
    }
  }, []);

  const setupRoom = useCallback((room: Room<Alpha7StateSchema>) => {
    const token = ++roomTokenRef.current;
    roomRef.current = room;
    setConnectionStatus("connected");
    setNetworkMessage("Connected");
    setSnapshot(snapshotFromState(room.state, room.roomId, room.sessionId));
    setJoinCode(room.roomId);

    room.onStateChange((state) => {
      if (roomTokenRef.current !== token) return;
      setSnapshot(snapshotFromState(state, room.roomId, room.sessionId));
    });
    room.onMessage<SystemMessagePayload>(SERVER_MESSAGE_TYPES.SYSTEM, (message) => {
      if (roomTokenRef.current !== token) return;
      setNetworkMessage(message.message);
    });
    room.onMessage<ErrorMessagePayload>(SERVER_MESSAGE_TYPES.ERROR, (message) => {
      if (roomTokenRef.current !== token) return;
      setNetworkMessage(message.message);
      if (message.retryable) setConnectionStatus("error");
    });
    room.onError((code, message) => {
      if (roomTokenRef.current !== token) return;
      setConnectionStatus("error");
      setNetworkMessage(message ?? `Room error ${code}`);
    });
    room.onLeave((code) => {
      if (roomTokenRef.current !== token) return;
      roomRef.current = null;
      setSnapshot(null);
      setConnectionStatus(code === 1000 ? "idle" : "offline");
      setNetworkMessage(code === 1000 ? "Left room" : `Disconnected (${code})`);
    });
  }, []);

  const joinRoom = useCallback(
    async (mode: JoinMode) => {
      if (connectionStatus === "connecting") return;
      setConnectionStatus("connecting");
      setNetworkMessage("");

      const room = roomRef.current;
      if (room) {
        roomTokenRef.current += 1;
        roomRef.current = null;
        void room.leave(false);
      }

      const client = new Client(endpoint);
      const joinPayload: JoinMessagePayload = {
        playerName: sanitizeName(playerName),
        archetypeId: selectedTank,
        clientVersion: "0.1.0"
      };
      const options = {
        ...joinPayload,
        privateRoom: mode === "private" ? true : undefined
      };

      try {
        const nextRoom =
          mode === "quick"
            ? await client.joinOrCreate(BATTLE_ROYALE_ROOM, options, Alpha7StateSchema)
            : mode === "code"
              ? await client.joinById(joinCode.trim(), joinPayload, Alpha7StateSchema)
              : await client.create(BATTLE_ROYALE_ROOM, options, Alpha7StateSchema);

        setupRoom(nextRoom);
        nextRoom.send(CLIENT_MESSAGE_TYPES.JOIN, joinPayload);
      } catch (error) {
        setConnectionStatus("error");
        setSnapshot(null);
        setNetworkMessage(error instanceof Error ? error.message : "Unable to join room");
      }
    },
    [connectionStatus, endpoint, joinCode, playerName, selectedTank, setupRoom]
  );

  const leaveRoom = useCallback(() => {
    roomTokenRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    setSnapshot(null);
    setConnectionStatus("idle");
    setNetworkMessage("Left room");
    if (room) void room.leave();
  }, []);

  const toggleReady = useCallback(() => {
    const room = roomRef.current;
    const self = snapshotRef.current?.self;
    if (!room || !self) return;
    const payload: ReadyMessagePayload = { ready: !self.isReady };
    room.send(CLIENT_MESSAGE_TYPES.READY, payload);
  }, []);

  const startMatch = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const payload: StartMessagePayload = { start: true };
    room.send(CLIENT_MESSAGE_TYPES.START, payload);
  }, []);

  const copyRoomCode = useCallback(() => {
    const code = snapshotRef.current?.roomCode;
    if (!code) return;
    void navigator.clipboard?.writeText(code);
    setNetworkMessage("Room code copied");
  }, []);

  const updateAimScreen = useCallback((clientX: number, clientY: number) => {
    inputRef.current.aimScreenX = clientX;
    inputRef.current.aimScreenY = clientY;
  }, []);

  useEffect(() => {
    const keyMove = (): void => {
      const keys = pressedKeysRef.current;
      let x = 0;
      let y = 0;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
      keyboardMoveRef.current = normalizeVector(x, y);
      recomputeMove();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isInteractiveTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === " " && !event.repeat) {
        inputRef.current.fire = true;
        triggerFire();
        return;
      }
      if ((key === "e" || key === "q") && !event.repeat) {
        triggerAbility();
        return;
      }
      pressedKeysRef.current.add(key);
      keyMove();
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === " ") inputRef.current.fire = false;
      pressedKeysRef.current.delete(key);
      keyMove();
    };

    const onPointerUp = (): void => {
      inputRef.current.fire = false;
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [recomputeMove, triggerAbility, triggerFire]);

  useEffect(() => {
    window.advanceTime = (ms: number) => {
      window.__alpha7ArenaAdvance?.(ms);
    };
    window.render_game_to_text = () => {
      const currentSnapshot = snapshotRef.current ?? displaySnapshot;
      const arena = window.__alpha7ArenaState?.();
      return JSON.stringify({
        mode: screenMode,
        connection: connectionStatus,
        coordinateSystem: "world origin at arena top-left; x increases right, y increases toward lower map edge",
        room: {
          id: currentSnapshot.roomId,
          code: currentSnapshot.roomCode,
          matchState: currentSnapshot.matchState,
          tick: currentSnapshot.tick
        },
        local: {
          pose: arena?.localPose ?? localPoseRef.current,
          health: currentSnapshot.self?.health ?? 0,
          armor: currentSnapshot.self?.armor ?? 0,
          weapon: currentSnapshot.self?.weaponType,
          ability: currentSnapshot.self?.abilityType
        },
        input: inputRef.current,
        players: currentSnapshot.players.map((player) => ({
          id: player.sessionId,
          name: player.name,
          x: player.x,
          y: player.y,
          health: player.health,
          ready: player.isReady,
          self: player.isSelf
        })),
        arena
      });
    };
    return () => {
      delete window.advanceTime;
      delete window.render_game_to_text;
    };
  }, [connectionStatus, displaySnapshot, screenMode]);

  useEffect(() => {
    return () => {
      roomTokenRef.current += 1;
      const room = roomRef.current;
      if (room) void room.leave(false);
    };
  }, []);

  const handleShellPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") updateAimScreen(event.clientX, event.clientY);
    },
    [updateAimScreen]
  );

  const handleShellPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse" || isInteractiveTarget(event.target)) return;
      updateAimScreen(event.clientX, event.clientY);
      inputRef.current.fire = true;
      triggerFire();
    },
    [triggerFire, updateAimScreen]
  );

  const updateJoystickFromPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const max = rect.width * 0.32;
      const length = Math.hypot(dx, dy);
      const scale = length > max ? max / length : 1;
      const knob = { x: dx * scale, y: dy * scale };
      setJoystickKnob(knob);
      joystickMoveRef.current = normalizeVector(knob.x / max, knob.y / max);
      recomputeMove();
    },
    [recomputeMove]
  );

  const handleStickPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateJoystickFromPointer(event);
    },
    [updateJoystickFromPointer]
  );

  const handleStickPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      joystickMoveRef.current = { x: 0, y: 0 };
      setJoystickKnob({ x: 0, y: 0 });
      recomputeMove();
    },
    [recomputeMove]
  );

  const handleAimPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateAimScreen(event.clientX, event.clientY);
      inputRef.current.fire = true;
      triggerFire();
    },
    [triggerFire, updateAimScreen]
  );

  const handleAimPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updateAimScreen(event.clientX, event.clientY);
    },
    [updateAimScreen]
  );

  const handleAimPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    inputRef.current.fire = false;
  }, []);

  const handleFireDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateAimScreen(event.clientX, event.clientY);
      inputRef.current.fire = true;
      triggerFire();
    },
    [triggerFire, updateAimScreen]
  );

  const handleFireUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    inputRef.current.fire = false;
  }, []);

  const handleLocalPose = useCallback((pose: LocalPose) => {
    localPoseRef.current = pose;
  }, []);

  const selfPlayer = displaySnapshot.self;
  const shellClass = `game-shell mode-${screenMode}${active ? " is-active-match" : ""}`;

  return (
    <main
      className={shellClass}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handleShellPointerDown}
      onPointerMove={handleShellPointerMove}
    >
      <ArenaRenderer
        abilitySignal={abilitySignal}
        fireSignal={fireSignal}
        inputRef={inputRef}
        onLocalPose={handleLocalPose}
        snapshot={displaySnapshot}
      />

      <div className="hud-layer" aria-label="Game HUD">
        <MatchHeader now={now} snapshot={displaySnapshot} />
        <MiniMap localPose={localPoseRef.current} snapshot={displaySnapshot} />
        <TankStatusCard player={selfPlayer} />
        <WeaponStrip player={selfPlayer} />
        <AbilityDock onAbility={triggerAbility} player={selfPlayer} />
        <aside className="hud-panel scoreboard-panel" aria-label="Players">
          <div className="panel-heading">
            <span>Players</span>
            <span>{displaySnapshot.players.length}/8</span>
          </div>
          <ul className="player-list">
            {displaySnapshot.players.map((player) => (
              <PlayerRow key={player.sessionId} player={player} />
            ))}
          </ul>
        </aside>
      </div>

      {screenMode === "menu" ? (
        <MenuPanel
          endpoint={endpoint}
          isConnecting={connectionStatus === "connecting"}
          joinCode={joinCode}
          networkMessage={networkMessage}
          onJoin={joinRoom}
          playerName={playerName}
          selectedTank={selectedTank}
          setJoinCode={setJoinCode}
          setPlayerName={setPlayerName}
          setSelectedTank={setSelectedTank}
        />
      ) : null}

      {screenMode === "lobby" && snapshot ? (
        <LobbyPanel
          connectionStatus={connectionStatus}
          endpoint={endpoint}
          networkMessage={networkMessage}
          now={now}
          onCopyCode={copyRoomCode}
          onLeave={leaveRoom}
          onReady={toggleReady}
          onStart={startMatch}
          snapshot={snapshot}
        />
      ) : null}

      <MobileControls
        joystickKnob={joystickKnob}
        onAbility={() => triggerAbility()}
        onAimPointerDown={handleAimPointerDown}
        onAimPointerMove={handleAimPointerMove}
        onAimPointerUp={handleAimPointerUp}
        onFireDown={handleFireDown}
        onFireUp={handleFireUp}
        onStickPointerDown={handleStickPointerDown}
        onStickPointerMove={updateJoystickFromPointer}
        onStickPointerUp={handleStickPointerUp}
      />
    </main>
  );
}
