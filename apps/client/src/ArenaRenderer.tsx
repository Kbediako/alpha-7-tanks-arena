import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ABILITY_CONFIG,
  PICKUP_CONFIG,
  TANK_ARCHETYPE_CONFIG,
  WEAPON_CONFIG,
  type TankArchetypeId
} from "@alpha7/shared";
import type {
  ArenaMapConfig,
  ArenaWall,
  ClientPickup,
  ClientPlayer,
  ClientSnapshot,
  InputFrame
} from "./clientState";
import type { Alpha7AssetManifest } from "./assets";

export interface LocalPose {
  x: number;
  y: number;
  rotation: number;
  turretRotation: number;
}

interface ArenaRendererProps {
  assetManifest: Alpha7AssetManifest | null;
  snapshot: ClientSnapshot;
  inputRef: { current: InputFrame };
  fireSignal: number;
  abilitySignal: number;
  onLocalPose: (pose: LocalPose) => void;
}

interface ArenaDebugState {
  map: string;
  source: ArenaMapConfig["source"];
  localPose: LocalPose;
  visiblePlayers: Array<{ id: string; x: number; y: number; health: number; isSelf: boolean }>;
}

declare global {
  interface Window {
    __alpha7ArenaAdvance?: (ms: number) => void;
    __alpha7ArenaState?: () => ArenaDebugState;
  }
}

interface TankParts {
  group: THREE.Group;
  turret: THREE.Group;
  statusRail: THREE.Group;
  healthFill: THREE.Mesh;
  armorFill: THREE.Mesh;
  target: LocalPose;
  current: LocalPose;
  isSelf: boolean;
  archetypeId: TankArchetypeId;
}

interface Particle {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  kind: "shot" | "pulse";
  baseScale: number;
}

interface PickupVisual {
  group: THREE.Group;
  bobOffset: number;
  spinSpeed: number;
  pickupType: ClientPickup["pickupType"];
}

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  raycaster: THREE.Raycaster;
  groundPlane: THREE.Plane;
  wallLayer: THREE.Group;
  tankLayer: THREE.Group;
  projectileLayer: THREE.Group;
  serverProjectileLayer: THREE.Group;
  pickupLayer: THREE.Group;
  zoneRing: THREE.Mesh;
  targetZoneRing: THREE.Mesh;
  tankMeshes: Map<string, TankParts>;
  pickupMeshes: Map<string, PickupVisual>;
  particles: Particle[];
  mapKey: string;
  lastTime: number;
  rafId: number;
}

const COLORS = {
  ground: 0x787167,
  groundDark: 0x5f5a52,
  wall: 0x6f675e,
  wallSide: 0x4d4943,
  line: 0xb7b0a6,
  white: 0xf7f3ed,
  ink: 0x47423d,
  accent: 0xf06b2b,
  accentHot: 0xff6a2b,
  blue: 0x5c7c8c,
  success: 0x88a06a,
  warning: 0xf0b45b,
  danger: 0xd75845
} as const;

const TANK_RADIUS = 34;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerpAngle = (from: number, to: number, amount: number): number => {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
};

const mapKey = (map: ArenaMapConfig, assetManifest?: Alpha7AssetManifest | null): string =>
  `${map.source}:${map.id}:${map.width}:${map.height}:${map.walls.length}:${
    assetManifest?.maps?.wallConcrete?.texture ?? "wall-procedural"
  }:${assetManifest?.maps?.floorConcrete?.texture ?? "floor-procedural"}`;

const hasServerPose = (player: ClientPlayer): boolean =>
  Math.abs(player.x) > 1 ||
  Math.abs(player.y) > 1 ||
  Math.abs(player.velocityX) > 0.01 ||
  Math.abs(player.velocityY) > 0.01;

const canDriveLocalTank = (snapshot: ClientSnapshot): boolean =>
  snapshot.roomId === "local" ||
  ((snapshot.matchState === "running" ||
    snapshot.matchState === "danger" ||
    snapshot.matchState === "final_zone") &&
    Boolean(snapshot.self?.isAlive && !snapshot.self.isSpectator));

const spawnForIndex = (map: ArenaMapConfig, index: number): { x: number; y: number } => {
  const spawn = map.spawns[index % Math.max(1, map.spawns.length)];
  return spawn ? { x: spawn.x, y: spawn.y } : { x: 0, y: 0 };
};

const worldToThree = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x, 0, y);

const cameraCenter = (value: number, mapSize: number, viewSize: number): number =>
  viewSize >= mapSize ? mapSize / 2 : clamp(value, viewSize / 2, mapSize - viewSize / 2);

const canCreateWebGLContext = (): boolean => {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
};

const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else if (material) {
      material.dispose();
    }
  });
};

const createZoneRing = (color: number, opacity: number, inner = 0.92, outer = 1): THREE.Mesh => {
  const geometry = new THREE.RingGeometry(inner, outer, 96);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 3;
  ring.visible = false;
  return ring;
};

const applyOptionalTexture = (material: THREE.MeshStandardMaterial, texturePath?: string | null): void => {
  if (!texturePath) return;

  new THREE.TextureLoader().load(
    texturePath,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    },
    undefined,
    () => undefined
  );
};

const createWallMesh = (wall: ArenaWall, assetManifest?: Alpha7AssetManifest | null): THREE.Mesh => {
  const geometry = new THREE.BoxGeometry(wall.width, wall.depth, wall.height);
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 0.86,
    metalness: 0.02
  });
  applyOptionalTexture(material, assetManifest?.maps?.wallConcrete?.texture);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wall.x, wall.depth / 2, wall.y);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
};

const createGround = (map: ArenaMapConfig, assetManifest?: Alpha7AssetManifest | null): THREE.Group => {
  const group = new THREE.Group();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.ground,
    roughness: 0.92,
    metalness: 0
  });
  applyOptionalTexture(floorMaterial, assetManifest?.maps?.floorConcrete?.texture);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.height, 1, 1), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(map.width / 2, 0, map.height / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const grid = new THREE.GridHelper(
    Math.max(map.width, map.height),
    Math.max(8, Math.round(Math.max(map.width, map.height) / 120)),
    COLORS.line,
    COLORS.groundDark
  );
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.2;
  grid.position.set(map.width / 2, 1.2, map.height / 2);
  group.add(grid);

  return group;
};

const pickupColor = (pickupType: ClientPickup["pickupType"]): number => {
  switch (PICKUP_CONFIG[pickupType].effect) {
    case "repair":
      return COLORS.success;
    case "armor":
      return COLORS.blue;
    case "ammo":
      return COLORS.accent;
    case "speed":
      return COLORS.warning;
    case "ability":
      return COLORS.white;
    case "smoke":
      return COLORS.ink;
    default:
      return COLORS.danger;
  }
};

const createPickupMesh = (pickup: ClientPickup): PickupVisual => {
  const color = pickupColor(pickup.pickupType);
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(10, pickup.radius * 0.55), 3.5, 10, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(Math.max(8, pickup.radius * 0.38), 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color).multiplyScalar(0.18),
      roughness: 0.4,
      metalness: 0.15
    })
  );
  core.position.y = 18;
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 8, 28, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 })
  );
  glow.position.y = 14;
  group.add(glow);

  return {
    group,
    bobOffset: Math.random() * Math.PI * 2,
    spinSpeed: 0.6 + Math.random() * 0.55,
    pickupType: pickup.pickupType
  };
};

const createTankMesh = (player: ClientPlayer): TankParts => {
  const isSelf = player.isSelf;
  const config = TANK_ARCHETYPE_CONFIG[player.archetypeId];
  const group = new THREE.Group();
  const hullColor = isSelf ? COLORS.white : COLORS.ink;
  const turretColor = isSelf ? COLORS.ink : COLORS.accent;
  const trackColor = isSelf ? COLORS.groundDark : COLORS.wallSide;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(68, 20, 44),
    new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.72, metalness: 0.04 })
  );
  body.position.y = 18;
  group.add(body);

  const leftTrack = new THREE.Mesh(
    new THREE.BoxGeometry(66, 11, 9),
    new THREE.MeshStandardMaterial({ color: trackColor, roughness: 0.9 })
  );
  leftTrack.position.set(0, 10, -26);
  group.add(leftTrack);

  const rightTrack = leftTrack.clone();
  rightTrack.position.z = 26;
  group.add(rightTrack);

  const turret = new THREE.Group();
  turret.position.y = 32;
  const turretBase = new THREE.Mesh(
    new THREE.BoxGeometry(34, 14, 28),
    new THREE.MeshStandardMaterial({ color: turretColor, roughness: 0.68 })
  );
  turret.add(turretBase);

  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(58, 5, 5),
    new THREE.MeshStandardMaterial({ color: turretColor, roughness: 0.62, metalness: 0.08 })
  );
  barrel.position.x = 42;
  turret.add(barrel);
  const muzzle = new THREE.Mesh(
    new THREE.BoxGeometry(8, 7, 7),
    new THREE.MeshStandardMaterial({ color: isSelf ? COLORS.accent : COLORS.accentHot, roughness: 0.42 })
  );
  muzzle.position.x = 74;
  turret.add(muzzle);
  group.add(turret);

  const statusRail = new THREE.Group();
  statusRail.position.set(0, 4, 54);
  const statusBg = new THREE.Mesh(
    new THREE.BoxGeometry(80, 2, 15),
    new THREE.MeshBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.46 })
  );
  statusRail.add(statusBg);
  const healthFill = new THREE.Mesh(
    new THREE.BoxGeometry(72, 3, 5),
    new THREE.MeshBasicMaterial({ color: isSelf ? COLORS.white : COLORS.accent })
  );
  healthFill.position.set(0, 1.4, -3.2);
  statusRail.add(healthFill);
  const armorFill = new THREE.Mesh(
    new THREE.BoxGeometry(72, 2, 3),
    new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.88 })
  );
  armorFill.position.set(0, 1.4, 4.2);
  statusRail.add(armorFill);
  group.add(statusRail);

  const pose = {
    x: player.x,
    y: player.y,
    rotation: player.rotation,
    turretRotation: player.turretRotation
  };

  group.userData.tankName = `${config.name} ${player.name}`;
  return {
    group,
    turret,
    statusRail,
    healthFill,
    armorFill,
    target: { ...pose },
    current: { ...pose },
    isSelf,
    archetypeId: player.archetypeId
  };
};

const updateCamera = (
  runtime: Runtime,
  canvas: HTMLCanvasElement,
  map: ArenaMapConfig,
  focus?: Pick<LocalPose, "x" | "y">
): void => {
  const rect = canvas.getBoundingClientRect();
  const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
  const height = Math.max(map.height * 1.06, aspect < 0.75 ? 1450 : 1080);
  const width = height * aspect;
  const centerX = focus ? cameraCenter(focus.x, map.width, width) : map.width / 2;
  const centerY = focus ? cameraCenter(focus.y, map.height, height) : map.height / 2;
  runtime.camera.left = (-height * aspect) / 2;
  runtime.camera.right = (height * aspect) / 2;
  runtime.camera.top = height / 2;
  runtime.camera.bottom = -height / 2;
  runtime.camera.near = 1;
  runtime.camera.far = 4000;
  runtime.camera.position.set(centerX, 1180, centerY + 1080);
  runtime.camera.lookAt(centerX, 0, centerY);
  runtime.camera.updateProjectionMatrix();
  runtime.renderer.setSize(rect.width, rect.height, false);
  runtime.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
};

const rebuildMap = (
  runtime: Runtime,
  snapshot: ClientSnapshot,
  assetManifest?: Alpha7AssetManifest | null
): void => {
  const map = snapshot.map;
  runtime.mapKey = mapKey(map, assetManifest);

  while (runtime.wallLayer.children.length > 0) {
    const child = runtime.wallLayer.children[0];
    if (!child) break;
    runtime.wallLayer.remove(child);
    disposeObject(child);
  }

  const ground = createGround(map, assetManifest);
  runtime.wallLayer.add(ground);
  for (const wall of map.walls) {
    runtime.wallLayer.add(createWallMesh(wall, assetManifest));
  }
};

const collidesWithWall = (x: number, y: number, map: ArenaMapConfig): boolean => {
  if (x < TANK_RADIUS || x > map.width - TANK_RADIUS || y < TANK_RADIUS || y > map.height - TANK_RADIUS) {
    return true;
  }

  for (const wall of map.walls) {
    const hit =
      Math.abs(x - wall.x) < wall.width / 2 + TANK_RADIUS &&
      Math.abs(y - wall.y) < wall.height / 2 + TANK_RADIUS;
    if (hit) return true;
  }
  return false;
};

const applyLocalMovement = (
  pose: LocalPose,
  input: InputFrame,
  map: ArenaMapConfig,
  archetypeId: TankArchetypeId,
  dt: number
): void => {
  const moveLength = Math.hypot(input.moveX, input.moveY);
  if (moveLength < 0.04) return;

  const config = TANK_ARCHETYPE_CONFIG[archetypeId];
  const speed = config.speed * (dt / 1000);
  const moveX = (input.moveX / moveLength) * speed;
  const moveY = (input.moveY / moveLength) * speed;
  const nextX = pose.x + moveX;
  const nextY = pose.y + moveY;

  if (!collidesWithWall(nextX, pose.y, map)) pose.x = nextX;
  if (!collidesWithWall(pose.x, nextY, map)) pose.y = nextY;
  pose.rotation = Math.atan2(input.moveY, input.moveX);
};

const screenToWorld = (
  runtime: Runtime,
  canvas: HTMLCanvasElement,
  screenX: number,
  screenY: number
): THREE.Vector3 | null => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((screenX - rect.left) / rect.width) * 2 - 1;
  const y = -(((screenY - rect.top) / rect.height) * 2 - 1);
  runtime.raycaster.setFromCamera(new THREE.Vector2(x, y), runtime.camera);
  const target = new THREE.Vector3();
  return runtime.raycaster.ray.intersectPlane(runtime.groundPlane, target) ?? null;
};

const updateAimFromScreen = (
  runtime: Runtime,
  canvas: HTMLCanvasElement,
  input: InputFrame,
  localPose: LocalPose
): void => {
  const rect = canvas.getBoundingClientRect();
  const screenX = input.aimScreenX || rect.left + rect.width / 2 + 180;
  const screenY = input.aimScreenY || rect.top + rect.height / 2;
  const world = screenToWorld(runtime, canvas, screenX, screenY);
  if (!world) return;

  input.aimWorldX = world.x;
  input.aimWorldY = world.z;
  const dx = input.aimWorldX - localPose.x;
  const dy = input.aimWorldY - localPose.y;
  const length = Math.hypot(dx, dy);
  if (length > 0.001) {
    input.aimDirX = dx / length;
    input.aimDirY = dy / length;
  }
  localPose.turretRotation = Math.atan2(input.aimDirY, input.aimDirX);
};

const updateTankTargets = (
  runtime: Runtime,
  snapshot: ClientSnapshot,
  localPose: LocalPose
): void => {
  const seen = new Set<string>();

  snapshot.players.forEach((player, index) => {
    let parts = runtime.tankMeshes.get(player.sessionId);
    if (!parts || parts.isSelf !== player.isSelf || parts.archetypeId !== player.archetypeId) {
      if (parts) {
        runtime.tankLayer.remove(parts.group);
        disposeObject(parts.group);
      }
      parts = createTankMesh(player);
      runtime.tankMeshes.set(player.sessionId, parts);
      runtime.tankLayer.add(parts.group);
    }

    const spawn = spawnForIndex(snapshot.map, index);
    const serverHasPose = hasServerPose(player);
    const x = player.isSelf ? localPose.x : serverHasPose ? player.x : spawn.x;
    const y = player.isSelf ? localPose.y : serverHasPose ? player.y : spawn.y;
    const rotation = player.isSelf
      ? localPose.rotation
      : serverHasPose
        ? player.rotation
        : Math.atan2(-spawn.y, -spawn.x);
    const turretRotation = player.isSelf
      ? localPose.turretRotation
      : serverHasPose
        ? player.turretRotation
        : rotation;

    parts.target = { x, y, rotation, turretRotation };
    const healthRatio = clamp(player.health / Math.max(1, player.maxHealth), 0, 1);
    const armorRatio = clamp(player.armor / Math.max(1, player.maxArmor || 1), 0, 1);
    parts.healthFill.scale.x = Math.max(0.04, healthRatio);
    parts.healthFill.position.x = -36 + 36 * healthRatio;
    parts.armorFill.scale.x = Math.max(0.04, armorRatio);
    parts.armorFill.position.x = -36 + 36 * armorRatio;
    parts.group.visible = player.isConnected && !player.isSpectator;
    seen.add(player.sessionId);
  });

  for (const [id, parts] of runtime.tankMeshes) {
    if (seen.has(id)) continue;
    runtime.tankLayer.remove(parts.group);
    disposeObject(parts.group);
    runtime.tankMeshes.delete(id);
  }
};

const renderTanks = (runtime: Runtime, dt: number): void => {
  const amount = clamp(dt / 90, 0.12, 0.48);
  for (const parts of runtime.tankMeshes.values()) {
    parts.current.x += (parts.target.x - parts.current.x) * amount;
    parts.current.y += (parts.target.y - parts.current.y) * amount;
    parts.current.rotation = lerpAngle(parts.current.rotation, parts.target.rotation, amount);
    parts.current.turretRotation = lerpAngle(parts.current.turretRotation, parts.target.turretRotation, amount);

    parts.group.position.copy(worldToThree(parts.current.x, parts.current.y));
    parts.group.rotation.y = -parts.current.rotation;
    parts.turret.rotation.y = -(parts.current.turretRotation - parts.current.rotation);
    parts.statusRail.rotation.y = parts.current.rotation;
  }
};

const updateZone = (runtime: Runtime, snapshot: ClientSnapshot, time: number): void => {
  const radius = snapshot.zone.radius || snapshot.zone.targetRadius;
  runtime.zoneRing.visible = radius > 8;
  runtime.targetZoneRing.visible = snapshot.zone.targetRadius > 8;

  const zoneMaterial = runtime.zoneRing.material as THREE.MeshBasicMaterial;
  const targetMaterial = runtime.targetZoneRing.material as THREE.MeshBasicMaterial;
  const hotPhase = snapshot.matchState === "danger" || snapshot.matchState === "final_zone";
  zoneMaterial.color.set(hotPhase ? COLORS.danger : COLORS.warning);
  zoneMaterial.opacity = (hotPhase ? 0.56 : 0.38) + Math.sin(time / 210) * 0.04;
  targetMaterial.opacity = 0.18 + Math.sin(time / 280) * 0.03;
  if (runtime.targetZoneRing.visible) {
    runtime.targetZoneRing.position.set(snapshot.zone.targetX, 2, snapshot.zone.targetY);
    runtime.targetZoneRing.scale.set(snapshot.zone.targetRadius, snapshot.zone.targetRadius, snapshot.zone.targetRadius);
  }

  if (!runtime.zoneRing.visible) return;
  runtime.zoneRing.position.set(snapshot.zone.x, 4, snapshot.zone.y);
  runtime.zoneRing.scale.set(radius, radius, radius);
};

const updatePickups = (runtime: Runtime, snapshot: ClientSnapshot, time: number): void => {
  const activeIds = new Set<string>();
  const bobTime = time / 340;

  for (const pickup of snapshot.pickups.filter((item) => item.isActive).slice(0, 28)) {
    let visual = runtime.pickupMeshes.get(pickup.id);
    if (!visual || visual.pickupType !== pickup.pickupType) {
      if (visual) {
        runtime.pickupLayer.remove(visual.group);
        disposeObject(visual.group);
      }
      visual = createPickupMesh(pickup);
      runtime.pickupMeshes.set(pickup.id, visual);
      runtime.pickupLayer.add(visual.group);
    }

    visual.group.position.set(pickup.x, 10 + Math.sin(bobTime + visual.bobOffset) * 5.5, pickup.y);
    visual.group.rotation.y = bobTime * visual.spinSpeed;
    activeIds.add(pickup.id);
  }

  for (const [id, visual] of runtime.pickupMeshes) {
    if (activeIds.has(id)) continue;
    runtime.pickupLayer.remove(visual.group);
    disposeObject(visual.group);
    runtime.pickupMeshes.delete(id);
  }
};

const createShotParticle = (
  pose: LocalPose,
  input: InputFrame,
  weaponType: ClientPlayer["weaponType"] = "cannon"
): Particle => {
  const weapon = WEAPON_CONFIG[weaponType];
  const color =
    weaponType === "machine_gun"
      ? COLORS.white
      : weaponType === "explosive"
        ? COLORS.warning
        : weaponType === "light_cannon"
          ? COLORS.blue
          : COLORS.accentHot;
  const geometry = new THREE.SphereGeometry(weaponType === "machine_gun" ? 7 : 10, 12, 8);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(geometry, material);
  const dirX = input.aimDirX || Math.cos(pose.turretRotation);
  const dirY = input.aimDirY || Math.sin(pose.turretRotation);
  mesh.position.set(pose.x + dirX * 48, 24, pose.y + dirY * 48);
  return {
    mesh,
    velocity: new THREE.Vector3(dirX * weapon.projectileSpeed * 1.1, 0, dirY * weapon.projectileSpeed * 1.1),
    life: 0,
    maxLife: weaponType === "machine_gun" ? 240 : weaponType === "explosive" ? 760 : 520,
    kind: "shot",
    baseScale: weaponType === "explosive" ? 1.35 : weaponType === "machine_gun" ? 0.72 : 1
  };
};

const createAbilityParticle = (
  pose: LocalPose,
  abilityType: ClientPlayer["abilityType"] = "smoke"
): Particle => {
  const ability = ABILITY_CONFIG[abilityType];
  const effectColor =
    abilityType === "repair"
      ? COLORS.success
      : abilityType === "shield_pulse"
        ? COLORS.blue
        : abilityType === "speed_burst"
          ? COLORS.warning
          : abilityType === "barrage"
            ? COLORS.accentHot
            : COLORS.ink;
  const radius = Math.max(64, ability.radius || (abilityType === "speed_burst" ? 110 : 88));
  const geometry = new THREE.RingGeometry(radius * 0.92, radius, 64);
  const material = new THREE.MeshBasicMaterial({
    color: effectColor,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pose.x, 6, pose.y);
  return {
    mesh,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0,
    maxLife: 680,
    kind: "pulse",
    baseScale: 1
  };
};

const updateParticles = (runtime: Runtime, dt: number): void => {
  for (let index = runtime.particles.length - 1; index >= 0; index -= 1) {
    const particle = runtime.particles[index];
    if (!particle) continue;
    particle.life += dt;
    const t = clamp(particle.life / particle.maxLife, 0, 1);
    particle.mesh.position.addScaledVector(particle.velocity, dt / 1000);
    if (particle.kind === "pulse") {
      const material = (particle.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.58 * (1 - t);
      particle.mesh.scale.setScalar(particle.baseScale + t * 2.4);
    } else {
      const material = (particle.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.95 * (1 - t);
      particle.mesh.scale.setScalar(particle.baseScale * (1 + t * 0.3));
    }
    if (particle.life >= particle.maxLife) {
      runtime.projectileLayer.remove(particle.mesh);
      disposeObject(particle.mesh);
      runtime.particles.splice(index, 1);
    }
  }
};

const updateServerProjectiles = (runtime: Runtime, snapshot: ClientSnapshot): void => {
  while (runtime.serverProjectileLayer.children.length > 0) {
    const child = runtime.serverProjectileLayer.children[0];
    if (!child) break;
    runtime.serverProjectileLayer.remove(child);
    disposeObject(child);
  }

  for (const projectile of snapshot.projectiles.slice(0, 32)) {
    const weapon = WEAPON_CONFIG[projectile.weaponType];
    const color =
      projectile.weaponType === "machine_gun"
        ? COLORS.white
        : projectile.weaponType === "explosive"
          ? COLORS.warning
          : projectile.weaponType === "light_cannon"
            ? COLORS.blue
            : COLORS.accentHot;
    const group = new THREE.Group();
    group.position.set(projectile.x, 18, projectile.y);
    group.rotation.y = -Math.atan2(projectile.velocityY, projectile.velocityX);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(4, projectile.radius), 10, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96 })
    );
    group.add(shell);

    const trailLength = clamp(weapon.projectileSpeed / 18, 18, projectile.weaponType === "explosive" ? 58 : 44);
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(trailLength, projectile.radius * 0.9, projectile.radius * 0.9),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 })
    );
    trail.position.x = -trailLength * 0.58;
    group.add(trail);

    if (projectile.weaponType === "explosive") {
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(projectile.radius * 1.25, projectile.radius * 1.8, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -6;
      group.add(halo);
    }

    runtime.serverProjectileLayer.add(group);
  }
};

export function ArenaRenderer({
  assetManifest,
  snapshot,
  inputRef,
  fireSignal,
  abilitySignal,
  onLocalPose
}: ArenaRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef(snapshot);
  const runtimeRef = useRef<Runtime | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const localPoseRef = useRef<LocalPose>({
    x: snapshot.self?.x ?? 0,
    y: snapshot.self?.y ?? 0,
    rotation: 0,
    turretRotation: 0
  });

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!canCreateWebGLContext()) {
      setWebglUnavailable(true);
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(COLORS.ground, 1);
    setWebglUnavailable(false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.ground);
    scene.fog = new THREE.Fog(COLORS.ground, 1700, 3100);

    const camera = new THREE.OrthographicCamera(-900, 900, 600, -600, 1, 4000);
    const ambient = new THREE.AmbientLight(0xf7f3ed, 1.85);
    const keyLight = new THREE.DirectionalLight(0xf7f3ed, 2.1);
    keyLight.position.set(-620, 1040, 820);
    scene.add(ambient, keyLight);

    const wallLayer = new THREE.Group();
    const tankLayer = new THREE.Group();
    const projectileLayer = new THREE.Group();
    const serverProjectileLayer = new THREE.Group();
    const pickupLayer = new THREE.Group();
    const zoneRing = createZoneRing(COLORS.warning, 0.42);
    const targetZoneRing = createZoneRing(COLORS.white, 0.22, 0.97, 1);
    scene.add(wallLayer, targetZoneRing, zoneRing, pickupLayer, tankLayer, serverProjectileLayer, projectileLayer);

    const runtime: Runtime = {
      renderer,
      scene,
      camera,
      raycaster: new THREE.Raycaster(),
      groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      wallLayer,
      tankLayer,
      projectileLayer,
      serverProjectileLayer,
      pickupLayer,
      zoneRing,
      targetZoneRing,
      tankMeshes: new Map(),
      pickupMeshes: new Map(),
      particles: [],
      mapKey: "",
      lastTime: performance.now(),
      rafId: 0
    };
    runtimeRef.current = runtime;

    const initialSelf = snapshotRef.current.self;
    const firstSpawn = spawnForIndex(snapshotRef.current.map, 0);
    const shouldUseSelfPose =
      initialSelf && (snapshotRef.current.roomId === "local" || hasServerPose(initialSelf));
    localPoseRef.current.x = shouldUseSelfPose ? initialSelf.x : firstSpawn.x;
    localPoseRef.current.y = shouldUseSelfPose ? initialSelf.y : firstSpawn.y;

    const resizeObserver = new ResizeObserver(() => {
      updateCamera(runtime, canvas, snapshotRef.current.map, localPoseRef.current);
    });
    resizeObserver.observe(canvas);
    updateCamera(runtime, canvas, snapshotRef.current.map, localPoseRef.current);

    const step = (dt: number): void => {
      const currentSnapshot = snapshotRef.current;
      if (runtime.mapKey !== mapKey(currentSnapshot.map, assetManifest)) {
        rebuildMap(runtime, currentSnapshot, assetManifest);
      }

      const input = inputRef.current;
      const self = currentSnapshot.self;
      const allowLocalMovement = canDriveLocalTank(currentSnapshot);
      if (self && hasServerPose(self) && (!allowLocalMovement || Math.hypot(input.moveX, input.moveY) < 0.04)) {
        localPoseRef.current.x += (self.x - localPoseRef.current.x) * 0.08;
        localPoseRef.current.y += (self.y - localPoseRef.current.y) * 0.08;
        localPoseRef.current.rotation = lerpAngle(localPoseRef.current.rotation, self.rotation, 0.08);
      }

      if (allowLocalMovement) {
        applyLocalMovement(
          localPoseRef.current,
          input,
          currentSnapshot.map,
          currentSnapshot.self?.archetypeId ?? "atlas",
          dt
        );
      }
      updateCamera(runtime, canvas, currentSnapshot.map, localPoseRef.current);
      updateAimFromScreen(runtime, canvas, input, localPoseRef.current);
      updateTankTargets(runtime, currentSnapshot, localPoseRef.current);
      renderTanks(runtime, dt);
      updateZone(runtime, currentSnapshot, runtime.lastTime);
      updatePickups(runtime, currentSnapshot, runtime.lastTime);
      updateServerProjectiles(runtime, currentSnapshot);
      updateParticles(runtime, dt);
      onLocalPose({ ...localPoseRef.current });
      renderer.render(scene, camera);
    };

    const loop = (time: number): void => {
      const dt = clamp(time - runtime.lastTime, 0, 64);
      runtime.lastTime = time;
      step(dt);
      runtime.rafId = window.requestAnimationFrame(loop);
    };

    window.__alpha7ArenaAdvance = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let index = 0; index < steps; index += 1) step(1000 / 60);
    };
    window.__alpha7ArenaState = () => ({
      map: snapshotRef.current.map.id,
      source: snapshotRef.current.map.source,
      localPose: { ...localPoseRef.current },
      visiblePlayers: Array.from(runtime.tankMeshes.entries()).map(([id, parts]) => ({
        id,
        x: Math.round(parts.current.x),
        y: Math.round(parts.current.y),
        health: snapshotRef.current.players.find((player) => player.sessionId === id)?.health ?? 0,
        isSelf: parts.isSelf
      }))
    });

    runtime.rafId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(runtime.rafId);
      resizeObserver.disconnect();
      if (window.__alpha7ArenaAdvance) delete window.__alpha7ArenaAdvance;
      if (window.__alpha7ArenaState) delete window.__alpha7ArenaState;
      renderer.dispose();
      disposeObject(scene);
      runtimeRef.current = null;
    };
  }, [assetManifest, inputRef, onLocalPose]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || fireSignal === 0) return;
    const particle = createShotParticle(localPoseRef.current, inputRef.current);
    runtime.particles.push(particle);
    runtime.projectileLayer.add(particle.mesh);
  }, [fireSignal, inputRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || abilitySignal === 0) return;
    const particle = createAbilityParticle(localPoseRef.current);
    runtime.particles.push(particle);
    runtime.projectileLayer.add(particle.mesh);
  }, [abilitySignal]);

  return (
    <>
      <canvas aria-label="Alpha-7 3D arena" className="game-canvas" ref={canvasRef} />
      {webglUnavailable ? (
        <div className="webgl-fallback hud-panel" role="status">
          <strong>3D renderer unavailable</strong>
          <span>Lobby controls remain active.</span>
        </div>
      ) : null}
    </>
  );
}
