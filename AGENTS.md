# HTML5Quest Repository Guide

## Project Overview
- **BrowserQuest clone**: This project is the open-sourced BrowserQuest HTML5 multiplayer game. The codebase is split between a RequireJS-driven browser client, a Node.js websocket server, and shared game definitions.
- **Top-level layout**:
  - `client/`: Browser assets (RequireJS modules, CSS, sprites, audio, HTML entry point) and build-time configuration.
  - `server/`: Node.js game server, configuration, and JSON map data consumed at runtime.
  - `shared/`: Modules shared between client and server (currently common game type enumerations).
  - `bin/`: Build tooling, including the RequireJS optimizer script (`r.js`) and a helper shell script.
  - `tools/maps/`: Offline TMX → JSON export pipeline used to regenerate map data for both client and server.

## Runtime & Build Dependencies
- **Node.js stack**: The server targets the Node.js 0.4 era APIs and depends on classic npm modules declared in `package.json` and `server/README.md` (`underscore`, `log`, `bison` for binary packets, `websocket`, `websocket-server`, `sanitizer`, plus optional `memcache` for metrics). Install them with `npm install` before running the server.
- **Client libraries**: Client-side modules are AMD files managed by RequireJS. Third-party utilities live in `client/js/lib/` (e.g., `require-jquery.js`, `underscore.min.js`, `log.js`, `modernizr.js`, `class.js` inheritance helper, `astar.js`, etc.).
- **Map tooling**: `tools/maps/` expects Python (with `lxml`) and Node.js; it converts Tiled (`.tmx`) maps into the JSON/JS bundles consumed in `client/maps/` and `server/maps/`.

## Build & Execution Flow
- **Server**:
  1. Copy `server/config_local.json-dist` to `server/config_local.json` and adjust websocket port, world counts, map path, and metrics settings as needed.
  2. Launch with `node server/js/main.js`. The entry point wires up the websocket server (`server/js/ws.js`), instantiates multiple `WorldServer` instances, and exposes a `/status` endpoint.
  3. Metrics support (Memcache-backed) is optional; when enabled the server periodically pulls population counts and updates each world (`server/js/main.js`, `server/js/metrics.js`).
- **Client**:
  1. For production, copy `client/config/config_build.json-dist` to `client/config/config_build.json` and edit websocket host/port.
  2. From the repo root run the optimizer: `cd bin && ./build.sh`. This script invokes RequireJS (`bin/r.js`) to bundle modules defined by `client/js/build.js`, prunes development-only assets, and emits `client-build/` alongside a `bin/build.txt` log. Deploy the generated `client-build/` directory.
  3. For development you can load `client/index.html`, which bootstraps `client/js/main.js` via RequireJS and fetches configuration (`client/js/config.js`).
- **Map updates**: Edit `tools/maps/tmx/map.tmx` in Tiled. Run `tools/maps/export.py client` and `tools/maps/export.py server` to refresh `client/maps/` and `server/maps/`. The exporter chains `tmx2json.py` and Node scripts to transform data.

## Code Structure Notes
- **Client gameplay** (`client/js/`):
  - `game.js`, `gameclient.js`, and `renderer.js` coordinate the main loop, networking, and canvas/WebGL rendering.
  - Entities and logic live in modules such as `entity.js`, `character.js`, `player.js`, `mob.js`, `npc.js`, `item.js`, with factory helpers (`entityfactory.js`) and managers (`infomanager.js`, `updater.js`).
  - UI orchestration is handled by `app.js` (intro/menu), `home.js`, `audio.js`, `bubble.js`, `text.js`, etc.
  - Networking uses `bison.js` and `gameclient.js` to decode messages defined in `shared/js/gametypes.js` and mirrored on the server (`server/js/message.js`).
- **Server gameplay** (`server/js/`):
  - `worldserver.js` owns each world instance, loading `server/maps/world_server.json` and instantiating entities (`player.js`, `mob.js`, `npc.js`, `chest.js`, etc.).
  - `message.js` serializes/deserializes the BISON packets exchanged with clients.
  - `mobarea.js`, `chestarea.js`, and `checkpoint.js` implement map-specific gameplay mechanics.
  - Utility modules include `utils.js`, `format.js`, `formulas.js`, and `properties.js` for tuning combat and drop tables.
  - Websocket plumbing is under `ws.js`, exposing callbacks consumed in `main.js`.
- **Shared module**: `shared/js/gametypes.js` enumerates packet types and gameplay constants. Keep client/server changes in sync.
- **Assets & Config**:
  - `client/css/`, `client/audio/`, `client/fonts/`, `client/img/`, and `client/sprites/` contain presentation assets referenced by client modules.
  - `client/maps/` and `server/maps/` store exported world data in JSON/JS form; keep them aligned with map edits.
  - `client/config/` houses environment-specific websocket settings, consumed by `client/js/config.js` through RequireJS build pragmas.

## Contribution Guidelines
- **Style**: Stick to the existing ES5 syntax—prototype-based classes via `Class.extend`, `var` declarations, and AMD `define`/`require` on the client; CommonJS `require`/`module.exports` on the server. Avoid modern syntax (e.g., arrow functions, `let/const`) unless you confirm compatibility with the legacy runtimes (Node 0.4 era and older browsers).
- **Formatting**: Follow the prevailing indentation (4 spaces inside modules) and brace placement shown in existing files (e.g., `client/js/app.js`, `server/js/main.js`). Maintain trailing semicolons.
- **Coupled changes**: Whenever updating network message definitions or map formats, update both client and server modules plus `shared/js/gametypes.js` to keep protocols aligned.
- **Build/Test expectations**: There is no automated test suite. Before committing changes:
  - Run `npm install` if dependencies changed.
  - If client code, run `bin/build.sh` to ensure the optimizer succeeds.
  - If map files changed, re-run the exporter for both client and server and verify the game loads.
- **Configuration files**: Do not commit personal `config_local.json` or generated `client/config/config_build.json` values containing secrets or environment-specific details.

## Useful References
- `README.md`, `client/README.md`, and `server/README.md` outline official deployment documentation.
- `tools/maps/README.md` describes the TMX export pipeline and caveats.
- `bin/build.sh` documents the RequireJS build process and cleanup steps.
