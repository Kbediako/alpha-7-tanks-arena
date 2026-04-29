---
version: "alpha"
name: "Alpha-7 Tanks Arena"
description: "Minimal industrial design system for a fullscreen real-time multiplayer tank battler. Gameplay fills the viewport; HUD and menu components float over the arena."
colors:
  bg-canvas: "#D7D1C7"
  bg-canvas-dim: "#8F887E"
  arena-ground: "#787167"
  arena-ground-dark: "#5F5A52"
  arena-shadow: "#2F2E2A"
  panel: "#EBE5DD"
  panel-muted: "#C9C1B6"
  panel-dark: "#5A554F"
  ink: "#47423D"
  ink-muted: "#7C756E"
  line: "#B7B0A6"
  line-soft: "#CDC5B9"
  white: "#F7F3ED"
  accent: "#F06B2B"
  accent-hot: "#FF6A2B"
  ally: "#F7F3ED"
  enemy: "#F06B2B"
  team-blue: "#5C7C8C"
  success: "#88A06A"
  warning: "#F0B45B"
  danger: "#D75845"
typography:
  display-lg:
    fontFamily: "Rajdhani"
    fontSize: "36px"
    fontWeight: "600"
    lineHeight: "40px"
    letterSpacing: "0.04em"
  display-md:
    fontFamily: "Rajdhani"
    fontSize: "28px"
    fontWeight: "600"
    lineHeight: "32px"
    letterSpacing: "0.05em"
  heading-sm:
    fontFamily: "Rajdhani"
    fontSize: "18px"
    fontWeight: "600"
    lineHeight: "22px"
    letterSpacing: "0.08em"
  body-md:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "20px"
    letterSpacing: "0em"
  body-sm:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "16px"
    letterSpacing: "0.01em"
  label-md:
    fontFamily: "IBM Plex Mono"
    fontSize: "12px"
    fontWeight: "500"
    lineHeight: "16px"
    letterSpacing: "0.04em"
  label-sm:
    fontFamily: "IBM Plex Mono"
    fontSize: "10px"
    fontWeight: "500"
    lineHeight: "14px"
    letterSpacing: "0.06em"
  data-lg:
    fontFamily: "IBM Plex Mono"
    fontSize: "32px"
    fontWeight: "500"
    lineHeight: "36px"
    letterSpacing: "0.02em"
  data-md:
    fontFamily: "IBM Plex Mono"
    fontSize: "18px"
    fontWeight: "500"
    lineHeight: "22px"
    letterSpacing: "0.02em"
rounded:
  none: "0px"
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "24px"
  pill: "999px"
spacing:
  none: "0px"
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  xxxl: "64px"
components:
  screen-root:
    backgroundColor: "{colors.bg-canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.none}"
    width: "100vw"
    height: "100vh"
  gameplay-canvas:
    backgroundColor: "{colors.arena-ground}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "{spacing.none}"
    width: "100%"
    height: "100%"
  floating-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  minimap-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    width: "224px"
    height: "224px"
  hud-header:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    width: "520px"
    height: "80px"
  scoreboard-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    width: "260px"
    height: "308px"
  scoreboard-row-active:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    height: "36px"
  tank-status-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    width: "276px"
    height: "260px"
  weapon-strip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    width: "460px"
    height: "64px"
  ability-dock:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.none}"
    width: "176px"
    height: "176px"
  primary-button:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: "44px"
  secondary-button:
    backgroundColor: "{colors.panel-muted}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: "44px"
  icon-button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    width: "44px"
    height: "44px"
  accent-badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs}"
    height: "20px"
---

# Alpha-7 Tanks Arena Design System

This `DESIGN.md` is the visual source of truth for implementing the minimal industrial tank-game redesign. Codex should treat the YAML front matter above as the normative token layer and the markdown guidance below as the rationale and implementation layer.

## Overview

Alpha-7 Tanks Arena is a fullscreen multiplayer tank battler with a calm, premium, hardware-inspired interface. The battlefield must feel like the product, not a backdrop behind heavy menus. The main game area always fills the viewport; HUD, menus, minimap, scoreboard, weapon readouts, and utility controls float above gameplay as light, translucent instruments.

The visual direction is minimal, functional, and readable. Think compact industrial hardware, soft concrete materiality, precise micro-labels, thin rules, small orange accents, and purposeful negative space. Do not use decorative sci-fi chrome, neon gradients, cartoon panels, glossy glassmorphism, or brand logos. Orange is functional: enemy, threat, active state, objective, key action, and urgent count.

Primary goals:

1. Preserve gameplay visibility at all times.
2. Make critical state readable at a glance.
3. Keep all overlays light, modular, and aligned to an 8-point grid.
4. Use a quiet neutral arena so tanks, reticles, projectiles, objectives, and damage states remain obvious.
5. Make every component look like it belongs to the same tactile hardware system.

Implementation default: render the game as a fullscreen canvas/WebGL scene, then render HUD as DOM or engine-native overlay layers with `pointer-events: none` by default. Only interactive menu controls should opt into pointer events.

## Colors

Use a warm concrete-and-slate palette with one high-salience orange accent. Prefer desaturated surfaces and high-contrast labels. Avoid saturated secondary colors except team spawn blue, success green, warning amber, and danger red when they communicate explicit gameplay meaning.

### Core palette

- `bg-canvas` `#D7D1C7`: warm matte base for documentation, menus, loading, and neutral UI backdrops.
- `arena-ground` `#787167`: default concrete battlefield surface.
- `arena-ground-dark` `#5F5A52`: shadowed terrain, bunker interiors, heavy wall sides.
- `panel` `#EBE5DD`: light floating HUD surfaces.
- `panel-muted` `#C9C1B6`: inactive UI, tab bases, secondary controls.
- `ink` `#47423D`: primary UI text and line icons.
- `ink-muted` `#7C756E`: secondary labels, disabled labels, metadata.
- `line` `#B7B0A6`: borders, dividers, grid rules, callout lines.
- `line-soft` `#CDC5B9`: low-emphasis rules and minimap grid lines.
- `white` `#F7F3ED`: ally markers, active text on dark surfaces, friendly health bars.
- `accent` `#F06B2B`: enemy markers, active UI, selected states, objectives, important counts.
- `accent-hot` `#FF6A2B`: muzzle flashes, active projectile core, urgent alerts.

### Color behavior

- Neutral UI should be beige, grey, translucent, or off-white.
- Orange should appear in small amounts. Use it for threat, active state, selected player, locked target, objective markers, ammo warning, damage sparks, and primary action.
- Friendly player markers use off-white. Enemy player markers use orange.
- Team spawn blue may appear only in map/spawn contexts. Keep it muted.
- Do not make the entire player tank orange unless it is an enemy, highlighted hero asset, or selected team variant.
- Do not use orange for decorative separators or random flourishes. Orange must mean something.

### CSS variables

Use these names as the implementation bridge:

```css
:root {
  --color-bg-canvas: #D7D1C7;
  --color-bg-canvas-dim: #8F887E;
  --color-arena-ground: #787167;
  --color-arena-ground-dark: #5F5A52;
  --color-arena-shadow: #2F2E2A;
  --color-panel: #EBE5DD;
  --color-panel-muted: #C9C1B6;
  --color-panel-dark: #5A554F;
  --color-ink: #47423D;
  --color-ink-muted: #7C756E;
  --color-line: #B7B0A6;
  --color-line-soft: #CDC5B9;
  --color-white: #F7F3ED;
  --color-accent: #F06B2B;
  --color-accent-hot: #FF6A2B;
  --color-ally: #F7F3ED;
  --color-enemy: #F06B2B;
  --color-team-blue: #5C7C8C;
  --color-success: #88A06A;
  --color-warning: #F0B45B;
  --color-danger: #D75845;
}
```

For translucent panels, use alpha in implementation rather than adding alpha tokens:

```css
--panel-glass: rgba(235, 229, 221, 0.72);
--panel-glass-strong: rgba(235, 229, 221, 0.86);
--panel-border: rgba(183, 176, 166, 0.58);
--shadow-soft: rgba(47, 46, 42, 0.18);
```

## Typography

Use a functional, condensed display face for headings and a readable interface sans for body text. Recommended open fonts:

- Display and large labels: `Rajdhani`, fallback `Inter`, `Arial Narrow`, `sans-serif`.
- Body UI: `Inter`, fallback `system-ui`, `sans-serif`.
- Data, labels, coordinates, ammo, room codes: `IBM Plex Mono`, fallback `ui-monospace`, `SFMono-Regular`, `Menlo`, `monospace`.

### Type roles

- `display-lg`: result screens, design-system headings, match outcome. Use all caps.
- `display-md`: major HUD readouts such as match time when not using `data-lg`.
- `heading-sm`: panel headings like `PLAYERS`, `MAP`, `LOADOUT`, `ABILITIES`.
- `body-md`: menu copy, instructions, compact descriptions.
- `body-sm`: scoreboard row names, equipment labels, tooltips.
- `label-md`: compact HUD metadata, key labels, weapon names.
- `label-sm`: minimap controls, micro labels, coordinate snippets.
- `data-lg`: timer, victory score, large ammo count.
- `data-md`: player score, ammo count, health numeric value.

### Type rules

- Prefer uppercase for headings, labels, room names, mode names, and control labels.
- Keep player names title case for personality and scanability: `Nova`, `Atlas`, `Quill`, `Rook`.
- Use monospaced numerals for timer, score, ammo, ping, health, and coordinates.
- Keep letter spacing subtle. Do not exceed `0.10em` except for tiny uppercase labels.
- Use a maximum of three text sizes in active HUD at once: micro label, body, data.
- Never put critical text directly over high-contrast explosions or muzzle flashes without a panel, stroke, or blur layer behind it.

## Layout

The gameplay scene is fullscreen at all times. UI overlays must float over it, with clear safe margins and no permanent central obstruction.

### Canvas and overlay structure

Recommended web structure:

```html
<div class="game-shell">
  <canvas class="game-canvas"></canvas>
  <div class="hud-layer" aria-label="Game HUD">
    <section class="hud-panel minimap-panel"></section>
    <section class="hud-panel match-header"></section>
    <section class="hud-panel scoreboard-panel"></section>
    <section class="hud-panel tank-status-card"></section>
    <section class="hud-panel weapon-strip"></section>
    <section class="hud-panel ability-dock"></section>
  </div>
</div>
```

Recommended CSS baseline:

```css
.game-shell {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--color-arena-ground);
  color: var(--color-ink);
  font-family: Inter, system-ui, sans-serif;
}

.game-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.hud-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.hud-panel {
  pointer-events: auto;
  background: rgba(235, 229, 221, 0.72);
  border: 1px solid rgba(183, 176, 166, 0.58);
  border-radius: 14px;
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 60px rgba(47, 46, 42, 0.16);
}
```

### Desktop HUD placement

Use an 8-point grid. Default safe margin is `24px` on desktop.

- Minimap: top-left, `24px` from top and left, `224px × 224px`.
- Match header: top-center, `24px` from top, `520px × 80px`, horizontally centered.
- Scoreboard: top-right, `24px` from top and right, `260px × 308px`.
- Tank status card: bottom-left, `24px` from bottom and left, `276px × 260px`.
- Weapon strip: bottom-center, `24px` from bottom, `460px × 64px`, horizontally centered.
- Ability dock: bottom-right, `24px` from bottom and right, `176px × 176px`.

The center of the screen must remain free for combat. Avoid persistent panels in the central 40% of the viewport, except brief contextual prompts or target reticles.

### Responsive behavior

- Desktop/laptop: use full HUD with minimap, scoreboard, tank card, weapon strip, and ability dock.
- Tablet/small landscape: reduce safe margin to `16px`; collapse scoreboard to top-three rows plus expand button; keep weapon strip centered.
- Mobile: use compact HUD. Minimap becomes `144px × 144px`; scoreboard becomes a modal or horizontal top pill; tank status card collapses into health/ammo chips; ability dock becomes a bottom-right radial or 2x2 dock.
- Never crop the gameplay canvas to make room for UI. UI always floats.

### Alignment rules

- Every panel edge, row, icon, and callout snaps to the 8px grid.
- Internal panel padding is `16px` by default.
- Tiny controls may use `8px` gutters.
- Preserve `24px` clear space between independent panels on desktop.
- Align numeric columns right. Align labels left. Center the match timer.

## Elevation & Depth

Depth should create hierarchy without spectacle. The UI floats like thin translucent hardware over a matte battlefield.

### Layer order

1. Gameplay background and terrain.
2. Tanks, props, projectiles, explosions, track marks.
3. In-world labels and health bars.
4. Reticles and target indicators.
5. HUD panels.
6. Menu modals, if any.
7. Critical alerts, toasts, and match result overlays.

### Panel elevation

- HUD panels: light blur `8–12px`, border `1px`, shadow low opacity, large blur.
- Modal panels: blur `14–18px`, opacity `0.88–0.94`, stronger border.
- Tooltips: no heavy shadow; use a small tinted capsule or line label.
- In-world labels: no panel unless readability fails. Use one thin health line plus label.

### Shadows and materials

Arena objects use soft, directional shadows. Concrete blocks should feel physical but subdued. Avoid high-frequency texture detail; it competes with tanks and UI. Use ambient occlusion in corners and at wall bases. Explosions and muzzle flashes can break the quiet palette briefly, but the world should return to calm quickly.

## Shapes

The shape language is geometric, compact, and tactile.

### Radius scale

- `0px`: gameplay map blocks, walls, bunker geometry.
- `4px`: tiny badges, ammo dots container edges, micro buttons.
- `8px`: buttons, chips, list rows, icon buttons.
- `14px`: default HUD panels, minimap, cards.
- `24px`: large menu panels and special containers.
- `999px`: pills, toggle tracks, tags, capsules.

### Lines and borders

- Standard border: `1px`.
- Active or focus outline: `1px` orange.
- Divider line: `1px` with `line` at 40–60% opacity.
- Avoid thick borders. The UI should look etched, not boxed in.

### Icon style

- Use simple geometric line icons.
- Stroke width: `1.5px` standard, `2px` for selected/active icons.
- Icons should be readable at `16px`, `20px`, and `24px`.
- Use consistent optical weight. Do not mix filled icon sets with outline icon sets except for badges/dots.
- Core icons: map, players, cannon, machine gun, smoke, barrage, repair, target, objective, shield, warning, respawn.

### Dot indicators

Dots are central to the system. Use them for health pips, ammo charge, cooldown segments, stat ratings, and low-ammo warnings.

- Dot size: `6px` default, `4px` micro, `8px` large.
- Dot spacing: `6px` default.
- Filled neutral: `white` or `ink` depending on surface.
- Empty: `line` at low opacity.
- Warning/active: `accent`.

## Components

All components should be reusable, state-aware, and anchored to game information. Do not create one-off decorative panels.

### Floating panel primitive

Use this as the base for HUD panels:

```css
.hud-panel {
  background: rgba(235, 229, 221, 0.72);
  border: 1px solid rgba(183, 176, 166, 0.58);
  border-radius: 14px;
  color: var(--color-ink);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 60px rgba(47, 46, 42, 0.16);
}
```

Panel states:

- Default: translucent, low shadow, low border contrast.
- Hover: slightly stronger border, subtle orange focus line if interactive.
- Active/selected: white or brighter panel background, orange key data.
- Disabled: reduce opacity to 40–50%, remove orange, do not blur more.
- Alert: use orange badge or thin orange line, not full orange fill.

### Minimap panel

Purpose: orientation, player positions, objectives, and spatial awareness.

Placement: top-left. Default size: `224px × 224px` desktop.

Content:

- Header left: `MAP`.
- Header right: zoom scale, e.g. `1.2x`.
- Grid lines: `line-soft`, low opacity.
- Player self: off-white triangular marker.
- Allies: off-white dots or triangles.
- Enemies: orange triangles only when visible/known.
- Objective: orange star or diamond.
- Spawn: muted team rings.
- Bottom-left: key label button `M`.
- Bottom-right: minimize button `–`.

Rules:

- Keep map detail low. Blocks should read as silhouettes.
- Do not render full terrain texture in minimap.
- Use rotation only if the game camera rotates; otherwise keep north-up.
- Minimap can expand on hover or key press, but expanded map must not stay in center during combat.

### Match header / timer

Purpose: match context and score pressure.

Placement: top-center. Default size: `520px × 80px`.

Content:

- Left: room name, e.g. `ROOM ALPHA-7`.
- Center: timer, e.g. `04:32`.
- Right: mode, e.g. `DEATHMATCH`.
- Lower row: ally score left, score bar center, enemy score right.
- Score bar: ally side off-white; enemy/leading pressure side orange.

Rules:

- Timer uses monospaced numerals.
- Header should never be wider than needed.
- Orange score bar should be thin and calm, not a progress-gradient effect.
- If match state changes, animate with a `120–180ms` fade/slide, not a bounce.

### Player scoreboard

Purpose: quick ranking, team occupancy, and player identification.

Placement: top-right. Default size: `260px × 308px`.

Content:

- Header: `PLAYERS` and count, e.g. `8/8`.
- Rows: rank, status dot, player name, score.
- Active leader: orange name and score.
- Local player: off-white dot and slightly brighter row.
- Dead/disconnected: muted row, no orange unless selected.

Rules:

- Use fixed-width numeric columns.
- Keep names left aligned and scores right aligned.
- Show maximum 8 players in default panel. Collapse or scroll only when necessary.
- Avoid row backgrounds unless active, hover, or local player state requires them.

### Tank status / loadout card

Purpose: local player vehicle status.

Placement: bottom-left. Default size: `276px × 260px`.

Content:

- Vehicle name left: `ATLAS`.
- Model right: `M1A2` or game-specific variant.
- Health pips plus numeric HP, e.g. `72 / 100`.
- Line-art tank diagram for damage read.
- Loadout slots: `1 CANNON`, `2 MG`.
- Ammo/cooldown dots per weapon.

Rules:

- Tank diagram should be simple outline, not a detailed render.
- Health pips are primary; numeric HP is secondary.
- Use orange only for low health, active weapon, or cooldown alert.
- Loadout rows must be tappable/clickable if weapon switching is supported.

### Weapon strip

Purpose: immediate combat ammo and active weapon state.

Placement: bottom-center. Default size: `460px × 64px`.

Content:

- Primary weapon icon and label.
- Ammo/cooldown dots.
- Large ammo count, e.g. `15`.
- Secondary weapon label and ammo dots.
- Infinity symbol for unlimited machine-gun ammo when applicable.

Rules:

- This is the most important lower HUD element; it can be slightly brighter than side panels.
- Use `data-md` or `data-lg` for ammo count.
- Orange ammo count means active, low, or tactically important.
- Do not add decorative weapon art inside the strip.

### Ability / utility dock

Purpose: compact tactical actions.

Placement: bottom-right. Default size: `176px × 176px`, 2x2 grid.

Example abilities:

- `T`: smoke deploy.
- `R`: smoke screen / cover cloud.
- `F`: barrage / area suppression.
- `G`: repair / utility tool.

Content per cell:

- Key label in top-left.
- Icon centered.
- Count bottom-right if consumable.
- Small orange dot for cooldown/ready/attention.

Rules:

- Use the same icon line weight throughout.
- Use a single orange count or dot per cell.
- Active cooldown should dim the icon and animate the cell fill subtly.
- Avoid large radial glows.

### Buttons, toggles, tabs, chips

Buttons:

- Primary: orange fill, off-white text. Use sparingly for deploy, confirm, continue.
- Secondary: muted panel fill, ink text. Use for cancel, back, options.
- Ghost: transparent with thin border. Use for low-priority actions.

Toggles:

- Off: muted track, light knob.
- Hover: orange outline.
- On: orange track, light knob.
- Disabled: grey track and muted knob.

Tabs:

- Default: transparent or muted surface.
- Active: orange underline or thin top border. Do not fill entire tab orange.

Stat chips:

- Use icon + label + number.
- Use compact rounded rectangles.
- Examples: `ACCURACY 72%`, `DAMAGE 1,240`, `ARMOR 900`, `SPEED 48 KM/H`, `RESPAWN 00:18`.

### Reticles and crosshairs

Reticles live in gameplay space, not inside panels.

- Default cannon reticle: orange segmented circle only when aiming/firing.
- Precision MG reticle: off-white crosshair.
- Target locked: orange circle with center dot.
- Focus/scan: off-white bracket corners.
- Ability area: orange dashed ring.

Rules:

- Reticles should be thin, geometric, and small.
- Reticle orange means active threat or active targeting.
- Do not use heavy animated pulse unless lock-on or objective capture requires it.

### In-world labels

Use labels above tanks only when helpful.

- Player name: uppercase small label, off-white or orange.
- Health bar: one thin line below name.
- Local player: off-white label.
- Enemy: orange label only if identified as enemy.
- Low health: health bar may shift orange/red, but name should remain readable.

Avoid large nameplates, rectangular label panels, or busy outlines around tanks.

### Map and arena modules

Arena modules must be readable from both the main camera and minimap.

Core map pieces:

- Wall `1x1`, `1x2`, `1x3`, `1x4`.
- Low wall `1x2`, `1x3`, `1x4`.
- Inner corner, outer corner, T-junction, cross.
- Pillar `1x1`, `1x2`, `1x3`.
- Block `2x2`, `2x4`.
- Small/medium/large bunker.
- Ramp `2x2`, `2x4`, `2x6`, ramp corner.
- Cover objects: crate, concrete block, barrier, debris pile.
- Interactive objects: power-up crate, destroyable barrel.
- Decals: explosion scorch, tire tracks, shell trail, smoke residue.
- Objectives: star pad, capture ring, neutral marker.
- Spawns: off-white and orange/blue rings or triangles.

Arena rules:

- Grid unit: 2 meters.
- Major structures align to grid.
- Use clean silhouettes and consistent heights for fair cover reads.
- Mix high cover and low cover deliberately.
- Leave firing corridors, flank routes, and reset loops visible.
- Avoid cluttered prop fields that hide tanks or shells.

### Tank visual system

Tanks should be compact, modular, and silhouette-readable. They can have detail, but the detail must not defeat top-down recognition.

Hero variants:

- `Nova`: assault. Orange/rust accent, high burst damage, frontline role.
- `Atlas`: balanced. Off-white/grey body, reliable baseline.
- `Quill`: skirmisher. Darker low-profile body, high mobility.
- `Rook`: support. Heavier green-grey body, repair/control utility.

Tank rules:

- Use broad, simple silhouettes: turret, hull, barrel, tracks.
- Keep top-view readable at small scale.
- Add team decals, numbers, and symbols on sides/top surfaces.
- Use orange/white markings for teams and player identity.
- Use damage states: pristine, light damage, moderate damage, heavy damage, destroyed.
- Use track marks and smoke trails to add motion history without cluttering the HUD.

### Effects and combat feedback

Effects should be punchy but brief.

- Muzzle flash: orange-hot core, 80–140ms, small smoke puff.
- Projectile trail: thin orange tracer plus optional grey smoke.
- Impact: small sparks and dust burst first, then scorch decal.
- Explosion: orange fire core, dark smoke plume, debris ring.
- Smoke ability: large grey plume, low saturation, clearly blocks vision.
- Destroyed tank: darkened hull, small ember points, smoke column.

Rules:

- Effects should not permanently obscure UI panels.
- Explosions may briefly exceed palette saturation; they should fade to smoke/decal.
- Do not use neon particle fields or overly colorful VFX.

## Do's and Don'ts

### Do

- Keep the game canvas fullscreen.
- Float HUD panels over the game area with translucent surfaces.
- Keep overlays near edges and corners.
- Reserve orange for meaning: enemy, threat, objective, active state, primary action, urgent count.
- Use off-white for ally, local, and neutral high-priority information.
- Use thin borders, light blur, and soft shadows.
- Use monospaced numbers for timer, ammo, score, and health.
- Align all HUD components to an 8-point grid.
- Prioritize tank silhouettes, reticles, projectiles, health, ammo, and objectives over decorative map detail.
- Build components from tokens and reuse them across menus and HUD.

### Don't

- Do not place persistent panels in the center combat area.
- Do not use thick frames around the game canvas.
- Do not crop the gameplay area to make room for menus.
- Do not overuse orange or use it as generic decoration.
- Do not add busy sci-fi chrome, neon gradients, heavy glows, or glossy UI surfaces.
- Do not use dense terrain textures that make tanks hard to read.
- Do not use full-opacity menu blocks during active gameplay unless the game is paused.
- Do not create new colors for one-off components.
- Do not mix multiple icon styles.
- Do not hide critical health/ammo/objective information behind hover-only UI.

### Codex implementation checklist

When implementing or refactoring UI, Codex should:

1. Create a single token file or CSS variable module from the YAML values.
2. Use `game-shell`, `game-canvas`, and `hud-layer` as the high-level layout structure for web clients.
3. Implement `.hud-panel` once and derive minimap, scoreboard, tank card, weapon strip, and ability dock from it.
4. Keep all HUD placements tokenized with safe-margin variables.
5. Use the component names in the YAML front matter as canonical class/component names.
6. Keep animation subtle: opacity, translate, and thin-line progress only.
7. Test HUD readability over explosions, smoke, dark terrain, and bright concrete.
8. Confirm the center play area remains unobstructed at desktop, tablet, and mobile breakpoints.
9. Add keyboard hints directly inside ability cells and weapon slots.
10. Preserve the minimal industrial visual identity even when adding new features.

### Suggested class names

```txt
.game-shell
.game-canvas
.hud-layer
.hud-panel
.minimap-panel
.match-header
.scoreboard-panel
.scoreboard-row
.scoreboard-row--active
.tank-status-card
.weapon-strip
.ability-dock
.ability-cell
.ammo-dots
.health-pips
.reticle
.reticle--target
.inworld-label
.map-objective
.map-spawn
```

### Suggested asset naming

```txt
ui/icon-map.svg
ui/icon-players.svg
ui/icon-cannon.svg
ui/icon-mg.svg
ui/icon-smoke.svg
ui/icon-barrage.svg
ui/icon-repair.svg
ui/icon-target.svg
ui/icon-objective.svg
ui/icon-shield.svg
ui/icon-warning.svg

map/wall-1x1.glb
map/wall-1x2.glb
map/corner-inner.glb
map/pillar-1x1.glb
map/bunker-small.glb
map/ramp-2x4.glb
map/crate-powerup.glb
map/decal-scorch.png
map/decal-trackmarks.png

tank/nova.glb
tank/atlas.glb
tank/quill.glb
tank/rook.glb
fx/muzzle-flash.png
fx/projectile-trail.png
fx/explosion-smoke.png
```

### Final intent

The finished game should feel like a quiet, high-end instrument panel laid over a tactical concrete arena. It should be readable before it is decorative, minimal before it is flashy, and spatially respectful of the player’s focus.
