# Phase 1 – Architecture Mapping

## Module Graph Snapshot
The current RequireJS client is organized around a small number of core entry points that we will have to preserve (or recreate) when tearing out AMD. The table below captures the highest-leverage modules we will need when packaging a single-file build.

| Category | Module | Key dependencies | Notes |
| --- | --- | --- | --- |
| Bootstrapping | `client/js/main.js` | `jquery`, `app` | Wires DOM events for the intro UI and instantiates the `App` controller when the document is ready.【F:client/js/main.js†L2-L157】 |
| Bootstrapping | `client/js/app.js` | `jquery`, `storage` | Owns the landing UI flow, localStorage-backed save slots, and the call into `game.run` once server options are selected.【F:client/js/app.js†L2-L200】 |
| Core loop | `client/js/game.js` | Rendering, entities, networking modules | Houses renderer setup, map loading, entity lifecycle, achievement logic, and every network callback `GameClient` exposes.【F:client/js/game.js†L1-L1559】 |
| Rendering | `client/js/renderer.js` | `camera`, `item`, `character`, `player`, `timer` | Maintains the canvas contexts, camera transforms, and dirty-rect drawing for both player-controlled and remote entities.【F:client/js/renderer.js†L1-L400】 |
| World data | `client/js/map.js` | `jquery`, `area` | Loads client-side world JSON, exposes collision helpers, zone membership, and door metadata that the game loop consumes.【F:client/js/map.js†L1-L320】 |
| Entities | `client/js/entity.js` + subclasses | Shared `character`, `mob`, `npc`, `player`, `item`, `chest` | Implements the sprite-driven state machines and provides event hooks such as `onStep`, `onDeath`, and `onLoot` that the game registers during handshake.【F:client/js/entity.js†L1-L360】【F:client/js/mob.js†L1-L200】【F:client/js/player.js†L1-L260】 |
| Assets | `client/js/sprites.js` & `sprite.js` | AMD `text!` loaders for JSON atlases | `sprites.js` pulls every sprite atlas into memory, while `sprite.js` builds animation frames and hurt/loot variants that `Game` assigns per entity.【F:client/js/sprites.js†L1-L130】【F:client/js/sprite.js†L1-L240】 |
| Networking | `client/js/gameclient.js` | `player`, `entityfactory`, `lib/bison` | Wraps WebSocket transport, message decoding, and a matrix of callbacks for entity, combat, loot, and chat updates.【F:client/js/gameclient.js†L1-L540】 |
| Audio | `client/js/audio.js` | `area` | Declares positional music areas and effect playback hooks that `Game` triggers when zones or combat state change.【F:client/js/audio.js†L1-L200】 |
| Persistence | `client/js/storage.js` | Browser `localStorage` | Manages persistent player records, kill counters, and achievement unlock state, which must survive in the single-file build.【F:client/js/storage.js†L1-L340】 |

## Multiplayer Integration Points
A precise list of network touch points will let us slot a deterministic “local server” behind the existing interfaces.

- **Connection & dispatch** – `Game.connect` instantiates `GameClient`, optionally hits the dispatcher, and establishes the WebSocket link before kicking off the hello handshake.【F:client/js/game.js†L713-L748】  The dispatcher path relies on `GameClient.connect`’s two-mode WebSocket handler that either resolves a downstream host or enters normal game messaging.【F:client/js/gameclient.js†L47-L108】
- **Entity discovery** – Upon connection, the client requests the active entity list and issues `sendWho` for unknown IDs, relying on `GameClient.receiveList` and spawn callbacks to populate the local entity grids.【F:client/js/game.js†L750-L807】【F:client/js/gameclient.js†L195-L239】
- **Player handshake** – `onWelcome` finalizes the player ID/name, restores persistent cosmetics, registers all local player event hooks, and primes achievements before the loop starts.【F:client/js/game.js†L768-L938】
- **Outgoing commands** – Movement, targeting, loot, aggression, teleport, chat, zoning, checkpoint checks, and combat hits all flow through dedicated `GameClient.send*` helpers that wrap `sendMessage` with the appropriate packet IDs.【F:client/js/game.js†L801-L941】【F:client/js/game.js†L1511-L2150】【F:client/js/gameclient.js†L110-L538】
- **Incoming world state** – Spawn/despawn events hydrate `EntityFactory` records, while move, attack, loot, damage, equipment, and teleport messages update in-memory entities and trigger audio/achievement side effects.【F:client/js/game.js†L1058-L1560】【F:client/js/gameclient.js†L164-L361】
- **Meta channels** – Population counts, disconnect notifications, and chat bubble routing round out the callback set and map directly to UI elements controlled by `App` and `InfoManager`.【F:client/js/game.js†L1468-L1560】【F:client/js/gameclient.js†L146-L361】

These surfaces represent the contract our single-player simulation must emulate—both in shape (message arrays) and timing (callbacks invoked during the render/update loop).

## Server Gameplay Boundaries to Mirror
To retain BrowserQuest’s pacing and loot economy offline, we have to replicate the core of the Node-based world simulator inside the client.

- **`WorldServer` lifecycle** – Initializes collections for players, mobs, chest areas, queues, and tick rates, then wires event handlers for player connect/enter/exit, mob aggression, and regeneration pulses.【F:server/js/worldserver.js†L22-L146】  Its `run` method loads `world_server.json`, seeds mob and chest areas, spawns static entities, and processes outgoing queues at 50 updates per second.【F:server/js/worldserver.js†L148-L214】
- **Area controllers** – `MobArea` spawns mobs of a given type inside rectangular regions, reattaching world callbacks and scheduling respawns when the area empties.【F:server/js/mobarea.js†L6-L46】  `ChestArea` tracks rectangular trigger zones and chest spawn positions for reward drops.【F:server/js/chestarea.js†L6-L24】
- **Message serialization** – `server/js/message.js` defines the exact array payloads for every action (`SPAWN`, `MOVE`, `ATTACK`, `DROP`, `CHAT`, etc.), providing the schema our local simulation must keep to preserve compatibility with existing handlers.【F:server/js/message.js†L13-L200】
