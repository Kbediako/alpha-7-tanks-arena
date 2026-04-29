# Third-Party Notices

## Reference Implementation

- Colyseus realtime tanks demo: https://github.com/colyseus/realtime-tanks-demo
- Local reference checkout available at `/Users/kbediako/Code/realtime-tanks-demo`.
- Permission was provided in the project brief to inspect it as a reference foundation.
- This repository is a fresh implementation. The reference repository is not forked, not added as a git remote, and not edited.

## Runtime Libraries

- Colyseus and related packages are used for multiplayer rooms and schema synchronization.
- three.js is used for browser 3D rendering.
- React and Vite are used for the browser application shell.

## Fonts

The visual direction specifies Rajdhani, Inter, and IBM Plex Mono. The client imports them from Google Fonts initially and provides CSS fallbacks. Font replacement paths are documented in the README as the asset pipeline matures.

## Assets

Initial gameplay uses procedural placeholder meshes and SVG/CSS UI symbols. Generated or replacement assets belong under `apps/client/public/assets/` and should be added to `apps/client/public/assets/manifest.json`.

Current authored placeholders:

- `apps/client/public/assets/ui/icons/reticle.svg`
- `apps/client/public/assets/ui/icons/repair.svg`
- `apps/client/public/assets/ui/icons/shield.svg`
- `apps/client/public/assets/audio/ambient-music.wav` copied from the user-provided local source `/Users/kbediako/Downloads/Sounds/ambient-music.wav` for this project.

These SVG placeholders were created directly for this project and are intentionally simple replacement targets. No generated bitmap assets or external model files are required by the current playable slice.
