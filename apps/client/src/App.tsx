import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent
} from "react";
import { Client, type Room } from "colyseus.js";
import {
  ABILITY_CONFIG,
  BATTLE_ROYALE_ROOM,
  CLIENT_MESSAGE_TYPES,
  DEFAULT_TANK_ARCHETYPE,
  PICKUP_CONFIG,
  SERVER_MESSAGE_TYPES,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
  WEAPON_CONFIG,
  generateArenaConfig,
  type AbilityMessagePayload,
  type ArenaConfig,
  type ErrorMessagePayload,
  type FireMessagePayload,
  type InputMessagePayload,
  type JoinMessagePayload,
  type ReadyMessagePayload,
  type RematchMessagePayload,
  type StartMessagePayload,
  type SystemMessagePayload,
  type TankArchetypeId
} from "@alpha7/shared";
import { Alpha7StateSchema } from "@alpha7/shared/schema";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Eye,
  Gauge,
  Lock,
  LogOut,
  Map,
  Play,
  RadioTower,
  RefreshCcw,
  Shield,
  Target,
  Unlock,
  WifiOff,
  Wrench,
  Zap
} from "lucide-react";
import { ArenaRenderer, type LocalPose } from "./ArenaRenderer";
import { loadAlpha7AssetManifest, type Alpha7AssetManifest } from "./assets";
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

type AppRoute = "arena" | "editor";
type EditorLayerKey = "walls" | "spawns" | "pickups" | "zones" | "safeZones";

const statLabels = ["firepower", "armor", "mobility", "support"] as const;
const archetypes = TANK_ARCHETYPES.map((id) => TANK_ARCHETYPE_CONFIG[id]);
const editorLayerOrder: EditorLayerKey[] = ["walls", "spawns", "pickups", "zones", "safeZones"];
const editorLayerLabels: Record<EditorLayerKey, string> = {
  walls: "Walls",
  spawns: "Spawns",
  pickups: "Pickups",
  zones: "Zone phases",
  safeZones: "Mobile safe zones"
};

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

const formatPlacement = (value: number): string => {
  if (value <= 0) return "--";
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
  return `${value}${suffix}`;
};

const routeFromLocation = (): AppRoute =>
  window.location.pathname === "/editor" ? "editor" : "arena";

const createSeed = (): string => `A7-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const getSafeZoneRadius = (snapshot: ClientSnapshot): number =>
  snapshot.zone.radius > 0 ? snapshot.zone.radius : snapshot.zone.targetRadius;

const isOutsideSafeZone = (snapshot: ClientSnapshot, pose: Pick<LocalPose, "x" | "y">): boolean => {
  const radius = getSafeZoneRadius(snapshot);
  if (radius <= 8) return false;
  return Math.hypot(pose.x - snapshot.zone.x, pose.y - snapshot.zone.y) > radius;
};

const abilityIconPath = (
  abilityType: ClientPlayer["abilityType"],
  assetManifest: Alpha7AssetManifest | null
): string | undefined => {
  if (abilityType === "repair") return assetManifest?.ui?.icons?.repair;
  if (abilityType === "shield_pulse") return assetManifest?.ui?.icons?.shield;
  if (abilityType === "barrage") return assetManifest?.ui?.icons?.reticle;
  return undefined;
};

const abilityIcon = (
  abilityType: ClientPlayer["abilityType"],
  size = 21,
  assetManifest: Alpha7AssetManifest | null = null
) => {
  const iconPath = abilityIconPath(abilityType, assetManifest);
  if (iconPath) {
    return <img alt="" className="hud-icon-img" height={size} src={iconPath} width={size} />;
  }

  switch (abilityType) {
    case "repair":
      return <Wrench size={size} />;
    case "shield_pulse":
      return <Shield size={size} />;
    case "speed_burst":
      return <Zap size={size} />;
    case "barrage":
      return <Target size={size} />;
    default:
      return <RadioTower size={size} />;
  }
};

const sortPlayersByStanding = (players: readonly ClientPlayer[]): ClientPlayer[] =>
  [...players].sort((left, right) => {
    const leftPlacement = left.placement > 0 ? left.placement : Number.MAX_SAFE_INTEGER;
    const rightPlacement = right.placement > 0 ? right.placement : Number.MAX_SAFE_INTEGER;
    if (leftPlacement !== rightPlacement) return leftPlacement - rightPlacement;
    if (left.isAlive !== right.isAlive) return Number(right.isAlive) - Number(left.isAlive);
    if (left.kills !== right.kills) return right.kills - left.kills;
    if (left.damageDealt !== right.damageDealt) return right.damageDealt - left.damageDealt;
    return left.name.localeCompare(right.name);
  });

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
  connectionStatus,
  endpoint,
  joinCode,
  networkMessage,
  playerName,
  selectedTank,
  setJoinCode,
  setPlayerName,
  setSelectedTank,
  onJoin,
  onOpenEditor
}: {
  connectionStatus: ConnectionStatus;
  endpoint: string;
  joinCode: string;
  networkMessage: string;
  playerName: string;
  selectedTank: TankArchetypeId;
  setJoinCode: (value: string) => void;
  setPlayerName: (value: string) => void;
  setSelectedTank: (value: TankArchetypeId) => void;
  onJoin: (mode: JoinMode) => void;
  onOpenEditor: () => void;
}) {
  const isConnecting = connectionStatus === "connecting";
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
        <div className="menu-utility-row">
          <button className="secondary-button" onClick={onOpenEditor} type="button">
            <Map size={17} />
            Arena Editor
          </button>
        </div>
        {networkMessage ? <p className="network-message">{networkMessage}</p> : null}
        <NetworkBadge endpoint={endpoint} status={connectionStatus} />
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
        <button
          className={self?.isReady ? "secondary-button is-active" : "primary-button"}
          onClick={onReady}
          type="button"
        >
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

function MatchHeader({
  now,
  outsideSafeZone,
  snapshot
}: {
  now: number;
  outsideSafeZone: boolean;
  snapshot: ClientSnapshot;
}) {
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
    <section className={outsideSafeZone ? "hud-panel match-header is-alert" : "hud-panel match-header"} aria-label="Match status">
      <span>ROOM {snapshot.roomCode}</span>
      <strong>{timer}</strong>
      <span>{outsideSafeZone ? "OUTSIDE SAFE ZONE" : `${snapshot.matchState.toUpperCase()} / ${aliveCount} ALIVE`}</span>
    </section>
  );
}

function MiniMap({
  outsideSafeZone,
  snapshot,
  localPose
}: {
  outsideSafeZone: boolean;
  snapshot: ClientSnapshot;
  localPose: LocalPose;
}) {
  const markers = snapshot.players
    .filter((player) => !player.isSpectator)
    .map((player) => {
      const x = player.isSelf ? localPose.x : player.x;
      const y = player.isSelf ? localPose.y : player.y;
      return {
        id: player.sessionId,
        isSelf: player.isSelf,
        left: clamp((x / snapshot.map.width) * 100, 2, 98),
        top: clamp((y / snapshot.map.height) * 100, 2, 98)
      };
    });
  const zoneRadius = getSafeZoneRadius(snapshot);
  const zoneWidth = zoneRadius > 0 ? (zoneRadius * 2 * 100) / snapshot.map.width : 0;
  const zoneHeight = zoneRadius > 0 ? (zoneRadius * 2 * 100) / snapshot.map.height : 0;
  const targetWidth = snapshot.zone.targetRadius > 0 ? (snapshot.zone.targetRadius * 2 * 100) / snapshot.map.width : 0;
  const targetHeight = snapshot.zone.targetRadius > 0 ? (snapshot.zone.targetRadius * 2 * 100) / snapshot.map.height : 0;
  const mapAspect = snapshot.map.width / Math.max(1, snapshot.map.height);
  const mapFrameStyle: CSSProperties =
    mapAspect >= 1
      ? { height: `${100 / mapAspect}%`, width: "100%" }
      : { height: "100%", width: `${mapAspect * 100}%` };

  return (
    <section className={outsideSafeZone ? "hud-panel minimap-panel is-alert" : "hud-panel minimap-panel"} aria-label="Minimap">
      <header>
        <Map size={16} />
        <span>Map</span>
        <b>{snapshot.map.source === "server" ? "Sync" : "Local"}</b>
      </header>
      <div className="minimap-grid">
        <div className="minimap-map" style={mapFrameStyle}>
          {zoneRadius > 0 ? (
            <span
              className="minimap-zone is-current"
              style={{
                height: `${zoneHeight}%`,
                left: `${(snapshot.zone.x * 100) / snapshot.map.width}%`,
                top: `${(snapshot.zone.y * 100) / snapshot.map.height}%`,
                width: `${zoneWidth}%`
              }}
            />
          ) : null}
          {snapshot.zone.targetRadius > 0 ? (
            <span
              className="minimap-zone is-target"
              style={{
                height: `${targetHeight}%`,
                left: `${(snapshot.zone.targetX * 100) / snapshot.map.width}%`,
                top: `${(snapshot.zone.targetY * 100) / snapshot.map.height}%`,
                width: `${targetWidth}%`
              }}
            />
          ) : null}
          {snapshot.map.walls.map((wall) => (
            <span
              className="minimap-wall"
              key={wall.id}
              style={{
                height: `${clamp((wall.height / snapshot.map.height) * 100, 1, 100)}%`,
                left: `${clamp((wall.x / snapshot.map.width) * 100, 0, 100)}%`,
                top: `${clamp((wall.y / snapshot.map.height) * 100, 0, 100)}%`,
                width: `${clamp((wall.width / snapshot.map.width) * 100, 1, 100)}%`
              }}
            />
          ))}
          {snapshot.pickups.filter((pickup) => pickup.isActive).slice(0, 24).map((pickup) => (
            <span
              className={`minimap-pickup is-${PICKUP_CONFIG[pickup.pickupType].effect}`}
              key={pickup.id}
              style={{
                left: `${clamp((pickup.x / snapshot.map.width) * 100, 1, 99)}%`,
                top: `${clamp((pickup.y / snapshot.map.height) * 100, 1, 99)}%`
              }}
            />
          ))}
          {markers.map((marker) => (
            <span
              className={marker.isSelf ? (outsideSafeZone ? "self-marker is-alert" : "self-marker") : "threat-marker"}
              key={marker.id}
              style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
            />
          ))}
        </div>
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
        <span>
          <Target size={15} />
          {player.kills} Kills
        </span>
        <span>
          <Shield size={15} />
          {Math.round(player.damageDealt)} Dmg
        </span>
      </div>
    </section>
  );
}

function WeaponStrip({ player }: { player: ClientPlayer | null }) {
  if (!player) return null;
  const weapon = WEAPON_CONFIG[player.weaponType];
  const ammo = player.ammo > 0 ? player.ammo : weapon.category === "rapid" ? 60 : 24;
  const cooldownSeconds = Math.max(0, player.fireCooldownMs / 1000);
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
      <span className="weapon-type">{cooldownSeconds > 0 ? `${cooldownSeconds.toFixed(1)}s` : weapon.category}</span>
    </section>
  );
}

function AbilityDock({
  assetManifest,
  player,
  onAbility
}: {
  assetManifest: Alpha7AssetManifest | null;
  player: ClientPlayer | null;
  onAbility: (abilityType?: ClientPlayer["abilityType"]) => void;
}) {
  if (!player) return null;
  const ability = ABILITY_CONFIG[player.abilityType];
  const chargeTarget = Math.max(ability.chargeCost, 100);
  const chargeRatio = clamp(player.abilityCharge / chargeTarget, 0, 1);
  const ready = player.abilityCharge >= ability.chargeCost && player.abilityCooldownMs <= 0;

  return (
    <section className="hud-panel ability-dock interactive-panel" aria-label="Ability dock">
      <button className={ready ? "ability-primary is-ready" : "ability-primary"} disabled={!ready} onClick={() => onAbility(player.abilityType)} type="button">
        {abilityIcon(player.abilityType, 21, assetManifest)}
        <span>
          <strong>{ability.name}</strong>
          <small>{ready ? "Ready" : `${Math.round(player.abilityCharge)} charge`}</small>
        </span>
      </button>
      <div className="ability-cell">
        <span>Cooldown</span>
        <strong>{player.abilityCooldownMs > 0 ? formatTime(player.abilityCooldownMs) : "Online"}</strong>
      </div>
      <div className="ability-cell ability-charge-cell">
        <span>Charge</span>
        <strong>{Math.round(player.abilityCharge)}</strong>
        <i style={{ transform: `scaleX(${chargeRatio})` }} />
      </div>
      <div className="ability-cell">
        <span>Fire</span>
        <strong>{player.fireCooldownMs > 0 ? `${(player.fireCooldownMs / 1000).toFixed(1)}s` : "Hot"}</strong>
      </div>
    </section>
  );
}

function CompactHudBar({
  outsideSafeZone,
  player,
  scoreboardExpanded,
  snapshot,
  onToggleScoreboard
}: {
  outsideSafeZone: boolean;
  player: ClientPlayer | null;
  scoreboardExpanded: boolean;
  snapshot: ClientSnapshot;
  onToggleScoreboard: () => void;
}) {
  if (!player) return null;
  const ammo = player.ammo > 0 ? player.ammo : WEAPON_CONFIG[player.weaponType].category === "rapid" ? 60 : 24;
  return (
    <section className="compact-hud hud-panel interactive-panel" aria-label="Compact mobile HUD">
      <div className="compact-chip is-health">
        <small>HP</small>
        <strong>{Math.round(player.health)}</strong>
      </div>
      <div className="compact-chip is-armor">
        <small>AR</small>
        <strong>{Math.round(player.armor)}</strong>
      </div>
      <div className="compact-chip is-ammo">
        <small>Ammo</small>
        <strong>{ammo}</strong>
      </div>
      {outsideSafeZone ? (
        <div className="compact-chip is-warning">
          <small>Zone</small>
          <strong>{Math.max(1, Math.round(snapshot.zone.damagePerSecond))}/s</strong>
        </div>
      ) : null}
      <button className={scoreboardExpanded ? "compact-chip is-score is-open" : "compact-chip is-score"} onClick={onToggleScoreboard} type="button">
        <small>Players</small>
        <strong>{snapshot.alivePlayers || snapshot.players.length}</strong>
        {scoreboardExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </section>
  );
}

function ScoreboardPanel({
  expanded,
  snapshot
}: {
  expanded: boolean;
  snapshot: ClientSnapshot;
}) {
  const players = sortPlayersByStanding(snapshot.players);
  return (
    <aside className={expanded ? "hud-panel scoreboard-panel is-open" : "hud-panel scoreboard-panel"} aria-label="Players">
      <div className="panel-heading">
        <span>Standings</span>
        <span>{snapshot.alivePlayers || snapshot.players.length} Active</span>
      </div>
      <ul className="scoreboard-list">
        {players.map((player, index) => (
          <li className={player.isSelf ? "scoreboard-row is-self" : "scoreboard-row"} key={player.sessionId}>
            <span className="scoreboard-rank">
              {player.placement > 0 ? formatPlacement(player.placement) : player.isAlive ? `#${index + 1}` : "OUT"}
            </span>
            <span className="scoreboard-name">{player.name}</span>
            <span className="scoreboard-stat">{player.kills}K</span>
            <span className="scoreboard-stat">{Math.round(player.damageDealt)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ZoneWarningBanner({ snapshot }: { snapshot: ClientSnapshot }) {
  return (
    <section className="zone-warning-banner hud-panel" role="alert">
      <span>Safe Zone Breach</span>
      <strong>Drive back inside the ring</strong>
      <b>{Math.max(1, Math.round(snapshot.zone.damagePerSecond))} dmg/s</b>
    </section>
  );
}

function ResultsOverlay({
  connectionStatus,
  onLeave,
  onQuickPlay,
  onRematch,
  snapshot
}: {
  connectionStatus: ConnectionStatus;
  onLeave: () => void;
  onQuickPlay: () => void;
  onRematch: () => void;
  snapshot: ClientSnapshot;
}) {
  const standings = sortPlayersByStanding(snapshot.players);
  const self = snapshot.self;
  const winner = standings[0];

  return (
    <section className="match-overlay is-results interactive-panel" aria-label="Match results">
      <div className="overlay-card">
        <div className="panel-heading">
          <span>Match Complete</span>
          <span>{snapshot.roomCode}</span>
        </div>
        <div className="results-hero">
          <span className="results-kicker">{winner ? "Winner" : "Standings"}</span>
          <strong>{winner?.name ?? "Room Closed"}</strong>
          <p>
            {winner
              ? `${winner.kills} kills · ${Math.round(winner.damageDealt)} damage`
              : "The room ended before a winner snapshot arrived."}
          </p>
        </div>
        {self ? (
          <div className="results-summary-grid">
            <div>
              <small>Placement</small>
              <strong>{formatPlacement(self.placement || standings.findIndex((player) => player.sessionId === self.sessionId) + 1)}</strong>
            </div>
            <div>
              <small>Kills</small>
              <strong>{self.kills}</strong>
            </div>
            <div>
              <small>Damage</small>
              <strong>{Math.round(self.damageDealt)}</strong>
            </div>
            <div>
              <small>Survival</small>
              <strong>{formatTime(self.survivalTimeMs)}</strong>
            </div>
          </div>
        ) : null}
        <div className="results-actions">
          <button
            className={self?.isReady ? "secondary-button is-active" : "primary-button"}
            disabled={connectionStatus !== "connected"}
            onClick={onRematch}
            type="button"
          >
            <Play size={17} />
            {self?.isReady ? "Rematch Ready" : "Play Again"}
          </button>
          <button className="secondary-button" onClick={onQuickPlay} type="button">
            <RefreshCcw size={17} />
            Fresh Room
          </button>
          <button className="secondary-button" onClick={onLeave} type="button">
            <LogOut size={17} />
            Leave
          </button>
        </div>
        <div className="results-table">
          {standings.map((player, index) => (
            <div className={player.isSelf ? "results-row is-self" : "results-row"} key={player.sessionId}>
              <span>{player.placement > 0 ? formatPlacement(player.placement) : formatPlacement(index + 1)}</span>
              <strong>{player.name}</strong>
              <span>{player.kills}K</span>
              <span>{Math.round(player.damageDealt)} DMG</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SpectatorOverlay({
  now,
  onDismiss,
  onLeave,
  onQuickPlay,
  snapshot
}: {
  now: number;
  onDismiss: () => void;
  onLeave: () => void;
  onQuickPlay: () => void;
  snapshot: ClientSnapshot;
}) {
  const self = snapshot.self;
  if (!self) return null;
  const respawnTimer = self.respawnAt > now ? formatTime(self.respawnAt - now) : null;

  return (
    <section className="match-overlay is-spectator interactive-panel" aria-label="Spectator status">
      <div className="overlay-card overlay-card-compact">
        <div className="panel-heading">
          <span>Spectator Feed</span>
          <span>{snapshot.alivePlayers} alive</span>
        </div>
        <div className="results-hero is-compact">
          <span className="results-kicker">{self.placement > 0 ? formatPlacement(self.placement) : "Eliminated"}</span>
          <strong>{respawnTimer ? `Respawn in ${respawnTimer}` : "You are spectating"}</strong>
          <p>{self.kills} kills · {Math.round(self.damageDealt)} damage · {Math.round(self.damageTaken)} taken</p>
        </div>
        <div className="results-actions">
          <button className="primary-button" onClick={onDismiss} type="button">
            <Eye size={17} />
            Continue Spectating
          </button>
          <button className="secondary-button" onClick={onQuickPlay} type="button">
            <RefreshCcw size={17} />
            New Match
          </button>
          <button className="secondary-button" onClick={onLeave} type="button">
            <LogOut size={17} />
            Leave
          </button>
        </div>
      </div>
    </section>
  );
}

function ConnectionOverlay({
  connectionStatus,
  message,
  onLeave,
  onReconnect,
  roomCode
}: {
  connectionStatus: ConnectionStatus;
  message: string;
  onLeave: () => void;
  onReconnect: () => void;
  roomCode: string;
}) {
  return (
    <section className="match-overlay is-connection interactive-panel" aria-label="Connection status">
      <div className="overlay-card overlay-card-compact">
        <div className="panel-heading">
          <span>{connectionStatus === "offline" ? "Room Offline" : "Link Error"}</span>
          <span>{roomCode}</span>
        </div>
        <div className="results-hero is-compact">
          <span className="results-kicker">Connection Lost</span>
          <strong>{connectionStatus === "offline" ? "Room disconnected" : "Unable to talk to the server"}</strong>
          <p>{message || "Try reconnecting to continue spectating or rejoin the room."}</p>
        </div>
        <div className="results-actions">
          <button className="primary-button" onClick={onReconnect} type="button">
            <RefreshCcw size={17} />
            Reconnect
          </button>
          <button className="secondary-button" onClick={onLeave} type="button">
            <LogOut size={17} />
            Leave to Menu
          </button>
        </div>
      </div>
    </section>
  );
}

function MobileControls({
  assetManifest,
  joystickKnob,
  player,
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
  assetManifest: Alpha7AssetManifest | null;
  joystickKnob: { x: number; y: number };
  player: ClientPlayer | null;
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
  const ability = player ? ABILITY_CONFIG[player.abilityType] : null;
  const abilityReady =
    Boolean(player && ability && player.abilityCharge >= ability.chargeCost && player.abilityCooldownMs <= 0);
  const chargeTarget = ability ? Math.max(ability.chargeCost, 100) : 100;
  const chargeRatio = player ? clamp(player.abilityCharge / chargeTarget, 0, 1) : 0;
  const abilityButtonStyle = {
    "--ability-charge": `${Math.round(chargeRatio * 100)}%`
  } as CSSProperties;

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
      <button
        aria-label={ability ? `${ability.name} ${abilityReady ? "ready" : "charging"}` : "Ability"}
        className={abilityReady ? "mobile-ability-button is-ready" : "mobile-ability-button"}
        disabled={!abilityReady}
        onClick={onAbility}
        style={abilityButtonStyle}
        type="button"
      >
        {player ? abilityIcon(player.abilityType, 22, assetManifest) : <Zap size={22} />}
        <small>{ability ? ability.name.replace(" ", "\n") : "Ability"}</small>
      </button>
    </div>
  );
}

function EditorMapPreview({
  arena,
  layers,
  selectedTank
}: {
  arena: ArenaConfig;
  layers: Record<EditorLayerKey, boolean>;
  selectedTank: TankArchetypeId;
}) {
  const rectStyle = (x: number, y: number, width: number, height: number) => ({
    left: `${(x * 100) / arena.width}%`,
    top: `${(y * 100) / arena.height}%`,
    width: `${(width * 100) / arena.width}%`,
    height: `${(height * 100) / arena.height}%`
  });
  const pointStyle = (x: number, y: number) => ({
    left: `${(x * 100) / arena.width}%`,
    top: `${(y * 100) / arena.height}%`
  });
  const zoneStyle = (x: number, y: number, radius: number) => ({
    left: `${(x * 100) / arena.width}%`,
    top: `${(y * 100) / arena.height}%`,
    width: `${(radius * 2 * 100) / arena.width}%`,
    height: `${(radius * 2 * 100) / arena.height}%`
  });
  const previewSpawn = arena.spawnPoints[0];

  return (
    <div className="editor-map-stage">
      <div className="editor-map-grid" />
      {layers.zones
        ? [...arena.zonePhases].reverse().map((phase) => (
            <span
              className={`editor-zone-ring is-${phase.matchState}`}
              key={phase.index}
              style={zoneStyle(phase.x, phase.y, phase.radius)}
            />
          ))
        : null}
      {layers.walls
        ? arena.wallRects.map((wall) => (
            <span
              className="editor-wall"
              key={wall.id}
              style={rectStyle(wall.x, wall.y, wall.width, wall.height)}
            />
          ))
        : null}
      {layers.spawns
        ? arena.spawnPoints.map((spawn) => (
            <span className="editor-spawn" key={spawn.id} style={pointStyle(spawn.x, spawn.y)}>
              <b>{spawn.playerSlot + 1}</b>
            </span>
          ))
        : null}
      {layers.pickups
        ? arena.pickupPlacements.map((pickup) => (
            <span
              className={`editor-pickup is-${PICKUP_CONFIG[pickup.pickupType].effect}`}
              key={pickup.id}
              style={pointStyle(pickup.x, pickup.y)}
            >
              <b>{PICKUP_CONFIG[pickup.pickupType].name.slice(0, 2).toUpperCase()}</b>
            </span>
          ))
        : null}
      {previewSpawn ? (
        <span className={`editor-preview-tank is-${selectedTank}`} style={pointStyle(previewSpawn.x, previewSpawn.y)} />
      ) : null}
      {layers.safeZones ? (
        <>
          <span className="editor-mobile-safe-zone is-minimap">Minimap</span>
          <span className="editor-mobile-safe-zone is-stick">Move</span>
          <span className="editor-mobile-safe-zone is-aim">Aim</span>
          <span className="editor-mobile-safe-zone is-fire">Fire</span>
          <span className="editor-mobile-safe-zone is-ability">Ability</span>
          <span className="editor-mobile-safe-bar">Compact HUD / Scoreboard</span>
          <span className="editor-mobile-safe-strip">Weapon</span>
        </>
      ) : null}
    </div>
  );
}

function ArenaEditor({
  onBack,
  selectedTank,
  setSelectedTank
}: {
  onBack: () => void;
  selectedTank: TankArchetypeId;
  setSelectedTank: (value: TankArchetypeId) => void;
}) {
  const [seed, setSeed] = useState("A7-SANDBOX");
  const [playerCount, setPlayerCount] = useState(8);
  const [feedback, setFeedback] = useState("");
  const [layers, setLayers] = useState<Record<EditorLayerKey, boolean>>({
    walls: true,
    spawns: true,
    pickups: true,
    zones: true,
    safeZones: true
  });

  const arena = useMemo(() => generateArenaConfig({ playerCount, seed: seed.trim() || "A7-SANDBOX" }), [playerCount, seed]);
  const configJson = useMemo(() => JSON.stringify(arena, null, 2), [arena]);
  const selectedTankConfig = TANK_ARCHETYPE_CONFIG[selectedTank];
  const finalZone = arena.zonePhases[arena.zonePhases.length - 1];

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(""), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const toggleLayer = useCallback((key: EditorLayerKey) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const copyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setFeedback("Config copied");
    } catch {
      setFeedback("Clipboard unavailable");
    }
  }, [configJson]);

  const downloadConfig = useCallback(() => {
    const blob = new Blob([configJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(seed.trim() || "alpha7-arena").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback("Config exported");
  }, [configJson, seed]);

  return (
    <main className="editor-shell">
      <section className="editor-sidebar hud-panel interactive-panel">
        <div className="editor-toolbar">
          <button className="secondary-button" onClick={onBack} type="button">
            <ArrowLeft size={17} />
            Back
          </button>
          <span className="editor-toolbar-label">Sandbox</span>
        </div>
        <div className="panel-heading">
          <span>Procedural Arena Editor</span>
          <span>Shared generator</span>
        </div>
        <div className="editor-controls">
          <label>
            Seed
            <div className="editor-inline-control">
              <input onChange={(event) => setSeed(event.target.value)} spellCheck={false} value={seed} />
              <button className="secondary-button" onClick={() => setSeed(createSeed())} type="button">
                <RefreshCcw size={17} />
                Reroll
              </button>
            </div>
          </label>
          <label>
            Simulated players
            <div className="editor-player-row">
              <input
                max={16}
                min={1}
                onChange={(event) => setPlayerCount(clamp(Number(event.target.value) || 1, 1, 16))}
                type="range"
                value={playerCount}
              />
              <input
                max={16}
                min={1}
                onChange={(event) => setPlayerCount(clamp(Number(event.target.value) || 1, 1, 16))}
                type="number"
                value={playerCount}
              />
            </div>
          </label>
        </div>
        <div className="editor-actions">
          <button className="primary-button" onClick={copyConfig} type="button">
            <Copy size={17} />
            Copy JSON
          </button>
          <button className="secondary-button" onClick={downloadConfig} type="button">
            <Download size={17} />
            Export
          </button>
        </div>
        {feedback ? <p className="network-message">{feedback}</p> : null}
        <div className="editor-layer-toggle-grid">
          {editorLayerOrder.map((key) => (
            <button
              className={layers[key] ? "layer-toggle is-active" : "layer-toggle"}
              key={key}
              onClick={() => toggleLayer(key)}
              type="button"
            >
              {editorLayerLabels[key]}
            </button>
          ))}
        </div>
        <div className="editor-metrics-grid">
          <div>
            <small>Size</small>
            <strong>{arena.width} × {arena.height}</strong>
          </div>
          <div>
            <small>Walls</small>
            <strong>{arena.wallRects.length}</strong>
          </div>
          <div>
            <small>Spawns</small>
            <strong>{arena.spawnPoints.length}</strong>
          </div>
          <div>
            <small>Pickups</small>
            <strong>{arena.pickupPlacements.length}</strong>
          </div>
          <div>
            <small>Final zone</small>
            <strong>{Math.round(finalZone?.targetRadius ?? 0)}</strong>
          </div>
          <div>
            <small>Grid</small>
            <strong>{arena.grid.columns} × {arena.grid.rows}</strong>
          </div>
        </div>
      </section>

      <section className="editor-main">
        <section className="editor-preview-panel hud-panel">
          <div className="panel-heading">
            <span>Map preview</span>
            <span>{arena.seed}</span>
          </div>
          <EditorMapPreview arena={arena} layers={layers} selectedTank={selectedTank} />
        </section>

        <section className="editor-preview-panel hud-panel interactive-panel">
          <div className="panel-heading">
            <span>Tank skin preview</span>
            <span>{selectedTankConfig.role}</span>
          </div>
          <div className={`editor-skin-preview is-${selectedTank}`}>
            <span className="editor-skin-hull" />
            <span className="editor-skin-turret" />
            <span className="editor-skin-barrel" />
            <div className="editor-skin-copy">
              <strong>{selectedTankConfig.name}</strong>
              <small>{selectedTankConfig.description}</small>
            </div>
          </div>
          <div className="editor-tank-grid">
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
      </section>
    </main>
  );
}

export function App() {
  const endpoint = useMemo(() => endpointFromEnv(), []);
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());
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
  const [scoreboardExpanded, setScoreboardExpanded] = useState(false);
  const [spectatorOverlayDismissed, setSpectatorOverlayDismissed] = useState(false);
  const [queuedJoinMode, setQueuedJoinMode] = useState<JoinMode | null>(null);
  const [assetManifest, setAssetManifest] = useState<Alpha7AssetManifest | null>(null);

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
  const lastJoinModeRef = useRef<JoinMode>("quick");
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientStartedRef = useRef(false);

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
  const selfPlayer = displaySnapshot.self;
  const outsideSafeZone =
    Boolean(
      selfPlayer &&
        selfPlayer.isAlive &&
        !selfPlayer.isSpectator &&
        route === "arena" &&
        isOutsideSafeZone(displaySnapshot, localPoseRef.current)
    );
  const canControlLocalPlayer = Boolean(
    route === "arena" &&
      snapshot &&
      connectionStatus === "connected" &&
      snapshot.self &&
      snapshot.self.isAlive &&
      !snapshot.self.isSpectator &&
      isActiveMatchState(snapshot.matchState)
  );
  const showResults = Boolean(snapshot && snapshot.matchState === "finished");
  const showConnectionOverlay = Boolean(snapshot && (connectionStatus === "offline" || connectionStatus === "error"));
  const showSpectatorOverlay = Boolean(
    snapshot &&
      !showResults &&
      !showConnectionOverlay &&
      snapshot.self &&
      (!snapshot.self.isAlive || snapshot.self.isSpectator) &&
      !spectatorOverlayDismissed &&
      active
  );

  const unlockAmbientAudio = useCallback(() => {
    if (ambientStartedRef.current) return;
    const audio = ambientAudioRef.current;
    if (!audio) return;
    audio.volume = 0.26;
    audio.loop = true;
    void audio
      .play()
      .then(() => {
        ambientStartedRef.current = true;
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const onPopState = (): void => setRoute(routeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!queuedJoinMode || connectionStatus !== "idle") return;
    const mode = queuedJoinMode;
    setQueuedJoinMode(null);
    void joinRoom(mode);
  }, [connectionStatus, queuedJoinMode]);

  useEffect(() => {
    if (route !== "editor") return;
    if (!roomRef.current) return;
    roomTokenRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    setSnapshot(null);
    setConnectionStatus("idle");
    void room.leave(false);
  }, [route]);

  useEffect(() => {
    if (!snapshot || snapshot.matchState === "finished" || snapshot.self?.isAlive) {
      setSpectatorOverlayDismissed(false);
    }
  }, [snapshot?.matchId, snapshot?.matchState, snapshot?.self?.isAlive]);

  useEffect(() => {
    if (route === "editor") {
      setScoreboardExpanded(false);
    }
  }, [route]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFirstGesture = (): void => unlockAmbientAudio();
    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [unlockAmbientAudio]);

  useEffect(() => {
    let mounted = true;
    loadAlpha7AssetManifest()
      .then((manifest) => {
        if (mounted) setAssetManifest(manifest);
      })
      .catch(() => {
        if (mounted) setAssetManifest(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const navigateToRoute = useCallback((next: AppRoute) => {
    const nextPath = next === "editor" ? "/editor" : "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setRoute(next);
  }, []);

  const recomputeMove = useCallback(() => {
    const combined = normalizeVector(
      keyboardMoveRef.current.x + joystickMoveRef.current.x,
      keyboardMoveRef.current.y + joystickMoveRef.current.y
    );
    inputRef.current.moveX = combined.x;
    inputRef.current.moveY = combined.y;
  }, []);

  useEffect(() => {
    if (canControlLocalPlayer) return;
    inputRef.current.fire = false;
    inputRef.current.ability = false;
    keyboardMoveRef.current = { x: 0, y: 0 };
    joystickMoveRef.current = { x: 0, y: 0 };
    pressedKeysRef.current.clear();
    setJoystickKnob({ x: 0, y: 0 });
    recomputeMove();
  }, [canControlLocalPlayer, recomputeMove]);

  const sendInputIntent = useCallback(() => {
    const room = roomRef.current;
    const currentSnapshot = snapshotRef.current;
    if (
      !room ||
      !currentSnapshot ||
      !currentSnapshot.self?.isAlive ||
      currentSnapshot.self.isSpectator ||
      !isActiveMatchState(currentSnapshot.matchState)
    ) {
      return;
    }

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
    if (!canControlLocalPlayer) return;
    const time = performance.now();
    if (time - fireThrottleRef.current < 120) return;
    fireThrottleRef.current = time;
    setFireSignal((value) => value + 1);

    const room = roomRef.current;
    const currentSnapshot = snapshotRef.current;
    if (!room || !currentSnapshot) return;
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
  }, [canControlLocalPlayer]);

  const triggerAbility = useCallback(
    (abilityType?: ClientPlayer["abilityType"]) => {
      if (!canControlLocalPlayer) return;
      setAbilitySignal((value) => value + 1);
      inputRef.current.ability = true;
      window.setTimeout(() => {
        inputRef.current.ability = false;
      }, 140);

      const room = roomRef.current;
      const currentSnapshot = snapshotRef.current;
      const self = currentSnapshot?.self;
      if (!room || !currentSnapshot || !self) return;
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
    },
    [canControlLocalPlayer]
  );

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
    });
    room.onError((code, message) => {
      if (roomTokenRef.current !== token) return;
      setConnectionStatus("error");
      setNetworkMessage(message ?? `Room error ${code}`);
    });
    room.onLeave((code) => {
      if (roomTokenRef.current !== token) return;
      roomRef.current = null;
      setConnectionStatus(code === 1000 ? "idle" : "offline");
      setNetworkMessage(code === 1000 ? "Left room" : `Disconnected (${code})`);
      if (code === 1000) setSnapshot(null);
    });
  }, []);

  const joinRoom = useCallback(
    async (mode: JoinMode) => {
      if (route === "editor") return;
      if (connectionStatus === "connecting") return;
      lastJoinModeRef.current = mode;
      setConnectionStatus("connecting");
      setNetworkMessage("");
      setScoreboardExpanded(false);

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
    [connectionStatus, endpoint, joinCode, playerName, route, selectedTank, setupRoom]
  );

  const leaveRoom = useCallback(() => {
    roomTokenRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    setSnapshot(null);
    setConnectionStatus("idle");
    setNetworkMessage("Left room");
    setScoreboardExpanded(false);
    if (room) void room.leave(false);
  }, []);

  const queueFreshQuickPlay = useCallback(() => {
    if (roomRef.current) {
      setQueuedJoinMode("quick");
      leaveRoom();
      return;
    }
    setSnapshot(null);
    setConnectionStatus("idle");
    setNetworkMessage("");
    void joinRoom("quick");
  }, [joinRoom, leaveRoom]);

  const reconnectRoom = useCallback(() => {
    void joinRoom(lastJoinModeRef.current);
  }, [joinRoom]);

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

  const requestRematch = useCallback(() => {
    const room = roomRef.current;
    const currentSnapshot = snapshotRef.current;
    const self = currentSnapshot?.self;
    if (!room || !currentSnapshot || !self) return;
    const payload: RematchMessagePayload = {
      ready: !self.isReady,
      previousMatchId: currentSnapshot.matchId
    };
    try {
      room.send(CLIENT_MESSAGE_TYPES.REMATCH, payload);
      setNetworkMessage(self.isReady ? "Rematch ready cleared" : "Rematch ready sent");
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "Rematch send failed");
    }
  }, []);

  const copyRoomCode = useCallback(async () => {
    const code = snapshotRef.current?.roomCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNetworkMessage("Room code copied");
    } catch {
      setNetworkMessage(`Room code: ${code}`);
    }
  }, []);

  const updateAimScreen = useCallback((clientX: number, clientY: number) => {
    inputRef.current.aimScreenX = clientX;
    inputRef.current.aimScreenY = clientY;
  }, []);

  useEffect(() => {
    if (route !== "arena") return undefined;

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
      const currentSnapshot = snapshotRef.current;
      const key = event.key.toLowerCase();
      if (!currentSnapshot || !currentSnapshot.self?.isAlive || currentSnapshot.self.isSpectator) return;
      if (!isActiveMatchState(currentSnapshot.matchState) || connectionStatus !== "connected") return;

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
  }, [connectionStatus, recomputeMove, route, triggerAbility, triggerFire]);

  useEffect(() => {
    window.advanceTime = (ms: number) => {
      window.__alpha7ArenaAdvance?.(ms);
    };
    window.render_game_to_text = () => {
      const currentSnapshot = snapshotRef.current ?? displaySnapshot;
      const arena = window.__alpha7ArenaState?.();
      return JSON.stringify({
        route,
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
  }, [connectionStatus, displaySnapshot, route, screenMode]);

  useEffect(() => {
    return () => {
      roomTokenRef.current += 1;
      const room = roomRef.current;
      if (room) void room.leave(false);
    };
  }, []);

  const handleShellPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (route !== "arena") return;
      if (event.pointerType === "mouse") updateAimScreen(event.clientX, event.clientY);
    },
    [route, updateAimScreen]
  );

  const handleShellPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!canControlLocalPlayer || event.pointerType !== "mouse" || isInteractiveTarget(event.target)) return;
      updateAimScreen(event.clientX, event.clientY);
      inputRef.current.fire = true;
      triggerFire();
    },
    [canControlLocalPlayer, triggerFire, updateAimScreen]
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
      if (!canControlLocalPlayer) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateJoystickFromPointer(event);
    },
    [canControlLocalPlayer, updateJoystickFromPointer]
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
      if (!canControlLocalPlayer) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateAimScreen(event.clientX, event.clientY);
      inputRef.current.fire = true;
      triggerFire();
    },
    [canControlLocalPlayer, triggerFire, updateAimScreen]
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
      if (!canControlLocalPlayer) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateAimScreen(event.clientX, event.clientY);
      inputRef.current.fire = true;
      triggerFire();
    },
    [canControlLocalPlayer, triggerFire, updateAimScreen]
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

  if (route === "editor") {
    return (
      <ArenaEditor
        onBack={() => navigateToRoute("arena")}
        selectedTank={selectedTank}
        setSelectedTank={setSelectedTank}
      />
    );
  }

  const shellClass = `game-shell mode-${screenMode}${active ? " is-active-match" : ""}${outsideSafeZone ? " is-zone-breach" : ""}`;

  return (
    <main
      className={shellClass}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handleShellPointerDown}
      onPointerMove={handleShellPointerMove}
    >
      <audio
        aria-hidden="true"
        loop
        preload="auto"
        ref={ambientAudioRef}
        src={assetManifest?.audio?.ambientMusic?.wav ?? "/assets/audio/ambient-music.wav"}
      />
      <ArenaRenderer
        assetManifest={assetManifest}
        abilitySignal={abilitySignal}
        fireSignal={fireSignal}
        inputRef={inputRef}
        onLocalPose={handleLocalPose}
        snapshot={displaySnapshot}
      />

      {outsideSafeZone ? <div className="zone-danger-vignette" /> : null}

      <div className="hud-layer" aria-label="Game HUD">
        <MatchHeader now={now} outsideSafeZone={outsideSafeZone} snapshot={displaySnapshot} />
        <MiniMap localPose={localPoseRef.current} outsideSafeZone={outsideSafeZone} snapshot={displaySnapshot} />
        <TankStatusCard player={selfPlayer} />
        <WeaponStrip player={selfPlayer} />
        <AbilityDock assetManifest={assetManifest} onAbility={triggerAbility} player={selfPlayer} />
        {snapshot ? <ScoreboardPanel expanded={scoreboardExpanded} snapshot={snapshot} /> : null}
        {outsideSafeZone && snapshot ? <ZoneWarningBanner snapshot={snapshot} /> : null}
        {snapshot ? (
          <CompactHudBar
            outsideSafeZone={outsideSafeZone}
            player={selfPlayer}
            scoreboardExpanded={scoreboardExpanded}
            snapshot={snapshot}
            onToggleScoreboard={() => setScoreboardExpanded((value) => !value)}
          />
        ) : null}
      </div>

      {screenMode === "menu" ? (
        <MenuPanel
          connectionStatus={connectionStatus}
          endpoint={endpoint}
          joinCode={joinCode}
          networkMessage={networkMessage}
          onJoin={joinRoom}
          onOpenEditor={() => navigateToRoute("editor")}
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
          onCopyCode={() => {
            void copyRoomCode();
          }}
          onLeave={leaveRoom}
          onReady={toggleReady}
          onStart={startMatch}
          snapshot={snapshot}
        />
      ) : null}

      {canControlLocalPlayer ? (
        <MobileControls
          assetManifest={assetManifest}
          joystickKnob={joystickKnob}
          player={selfPlayer}
          onAbility={() => triggerAbility(selfPlayer?.abilityType)}
          onAimPointerDown={handleAimPointerDown}
          onAimPointerMove={handleAimPointerMove}
          onAimPointerUp={handleAimPointerUp}
          onFireDown={handleFireDown}
          onFireUp={handleFireUp}
          onStickPointerDown={handleStickPointerDown}
          onStickPointerMove={updateJoystickFromPointer}
          onStickPointerUp={handleStickPointerUp}
        />
      ) : null}

      {showSpectatorOverlay && snapshot ? (
        <SpectatorOverlay
          now={now}
          onDismiss={() => setSpectatorOverlayDismissed(true)}
          onLeave={leaveRoom}
          onQuickPlay={queueFreshQuickPlay}
          snapshot={snapshot}
        />
      ) : null}

      {showResults && snapshot ? (
        <ResultsOverlay
          connectionStatus={connectionStatus}
          onLeave={leaveRoom}
          onQuickPlay={queueFreshQuickPlay}
          onRematch={requestRematch}
          snapshot={snapshot}
        />
      ) : null}

      {showConnectionOverlay && snapshot ? (
        <ConnectionOverlay
          connectionStatus={connectionStatus}
          message={networkMessage}
          onLeave={leaveRoom}
          onReconnect={reconnectRoom}
          roomCode={snapshot.roomCode}
        />
      ) : null}
    </main>
  );
}
