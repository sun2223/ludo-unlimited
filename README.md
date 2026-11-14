# Ludo Unlimited

An original browser Ludo table for 2–4 friends. Private room codes, guest nicknames, server-authoritative gameplay, live text chat, reconnects, and unlimited rematches. The board, color palette, interface, and icons are original code; no Ludo King assets, branding, or code are used. Voice chat is intentionally not implemented.

## Quick start

Requires Node.js 22.14+ and npm. Run commands from this directory. On Windows PowerShell use `npm.cmd` if script execution policy blocks `npm`.

```sh
npm install
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` in a Unix shell), then:

```sh
npm run dev
```

Open **http://localhost:5173**. Create a room, share its code, and have a second person join from their own browser. The host starts once 2–4 players are connected.

The example enables **explicit development memory mode** (`ALLOW_MEMORY_STORE=true`): everything works locally, but rooms disappear when the API stops. This is never allowed when `NODE_ENV=production`.

## PostgreSQL

Use a local PostgreSQL installation, a managed PostgreSQL instance, or the supplied development Compose service:

```sh
docker compose up -d postgres
```

In `.env`, set `ALLOW_MEMORY_STORE=false` and `DATABASE_URL` to your connection string. The Compose development default matches `.env.example`. Then:

```sh
npm run db:migrate
npm run dev
```

Migrations are explicit and idempotent. The database user needs permission to create the table for migration and read/write access for runtime. Room snapshots include token positions, turn/phase, guest identity hashes, match count, and the last 100 chat messages. A single atomic snapshot write commits each accepted action; a failed write does not publish the action. Back up the database. There is no automatic room expiry or daily game quota.

## Architecture

```text
frontend/src/
  components/    Original SVG board, controls, room and landing views
  network/       Socket.IO transport, acknowledgements, rejoin lifecycle
  chat/          Text chat UI, independent of game controls
backend/src/
  rooms/         Room lifecycle, serialized mutations, guest authentication
  network/       Separate room, game and text-chat event registration
  chat/          Message validation, retention and throttling
  storage/       PostgreSQL pg Pool repository; opt-in dev memory repository
shared/          Pure, immutable JavaScript rules engine and board geometry
database/        SQL schema and migration entry point
tests/           Isolated-browser and real PostgreSQL integration tests
scripts/         Test runners that keep downloads/data inside ignored .cache/
```

The client submits only intents. The server uses `crypto.randomInt(1, 7)` for dice, checks player/turn/phase, validates legal moves, commits the result, then broadcasts it. A match number and game version reject duplicate/stale actions. Each room has a promise queue to serialize simultaneous joins, game actions, and chat writes. Room entry is also serialized per socket.

Guest sessions use random 256-bit bearer credentials. Only their SHA-256 hashes are stored in PostgreSQL; raw credentials are returned only to the joining socket. Other players receive public player information, never credential hashes. Browser local storage retains the credential so refreshes, closed tabs, and network interruptions can resume the same seat. Clearing site data or changing browsers loses access to that guest seat. Do not share your browser's stored credential. An invite code grants a new lobby seat, not an existing player's identity.

Presence is separate from persisted game state and derived from connected sockets. An offline host delegates host controls to the first connected player; the original host regains them on return. A match seat stays reserved. After 60 seconds offline, the current host may skip that player's turn without removing their tokens. No bot takes over. Before a match, leaving removes the seat; after it starts, leaving keeps it available for rejoin using the same code and browser. All seated players must reconnect to begin a rematch. The first player rotates each round.

Chat and transport have separate modules and event names. Future WebRTC signaling can be added in another authenticated module without putting media behavior into the rules engine. No microphone permissions or voice controls are present.

## Rules used

Ludo has regional variants; this implementation uses the rules shown in **How to play**:

- Four tokens per player; six releases a token onto its safe starting square.
- Follow the outer track into your own lane. An exact roll is needed to reach home.
- A six, capture, or token reaching home grants another roll. Three consecutive sixes forfeit the remaining turn; earlier moves in that turn stay in place.
- Starting squares and four marked stars are safe and allow mixed colors to share a square.
- Land on a single opponent on an unsafe square to send it to its yard.
- Two or more tokens of one color on an unsafe square form a blockade. Any token, including the same color, cannot land on or pass it. A token in a blockade can move out. Safe squares never form blockades.
- No legal move passes the turn (a six still grants its extra roll). First to finish all four tokens wins; a finished room can rematch without a quota.

## Verification

```sh
npm test                       # Engine + real Socket.IO clients, no database required
npm run test:db                # Isolated real PostgreSQL binaries + pg Pool, no Docker required
npm run test:browser:install   # Download Playwright Chromium under .cache/browsers
npm run test:browser           # Two isolated browser contexts, desktop + mobile
npm run build                 # Vite production build
npm run format                # Format project sources
```

The database test starts an isolated PostgreSQL cluster bound to loopback, checks persistence across API restart and the single-writer lock, and stops it afterward. Test data is kept under `.cache/pg-test-*` for inspection; it never targets your configured application database. On Linux, PostgreSQL must run as a normal non-root user. No system user is automatically created.

Browser tests cover private room create/join, matching state in isolated sessions, cross-session chat, a real server roll and token move, offline/rejoin, retained chat, invalid room feedback, rules dialog, and mobile horizontal overflow. Tests retain failure traces and produce screenshots under `test-results/`. Socket tests cover capacity, invalid credentials, unauthorized turns, stale actions, rematches, and disconnections. The engine also runs a deterministic complete-match simulation.

Passing local browser tests verifies separate browser sessions on this computer. It does **not** verify different geographic networks, a deployed TLS/proxy configuration, or production load. Complete the internet smoke test below after deploying.

## Deploy for friends in different locations

The complete application needs a **persistent Node.js server** with WebSocket support and PostgreSQL. A static-only host cannot run this backend. The Sites Cloudflare Worker runtime is incompatible with this Express/Socket.IO/TCP PostgreSQL architecture, so this repository is prepared for a Node host or VPS instead.

1. Deploy this repository to one Node service. Install with `npm ci` and build with `npm run build`. Keep all three npm workspaces available.
2. Provision PostgreSQL and set `DATABASE_URL` as a secret. Use the provider's TLS settings (for example a connection string with `sslmode=verify-full` and a trusted CA when required); do not disable certificate verification.
3. Set `NODE_ENV=production`, `ALLOW_MEMORY_STORE=false`, `HOST=0.0.0.0`, `PORT` to the host's assigned port, and `APP_ORIGIN=https://your-real-domain.example`. Use exact origins, comma-separated if needed, with no trailing slash.
4. Run `npm run db:migrate` once as a release step, then `npm start`. Express serves `frontend/dist` and Socket.IO from the same origin; no frontend API URL needs to be compiled in.
5. Route HTTPS traffic to that service, including `/socket.io/`. Enable WebSocket upgrades and HTTP long-polling. If using Nginx, set HTTP/1.1, forward `Upgrade`/`Connection`, and use a read timeout greater than 60 seconds. Set proxy IP trust only for a proxy you control.
6. Use a health check at `/api/health`, database backups, and a restart policy. Keep the process alive; hosts that sleep disconnect rooms until they wake. After restart, PostgreSQL and guest credentials restore the match.

**Run one backend process/replica.** A PostgreSQL advisory lock prevents a second writer against the same database. Do not use PM2 cluster mode or autoscaling replicas for this version. Multi-node support requires distributed room ownership/locking and a Socket.IO adapter; adding an adapter alone is insufficient. If the database writer connection is lost, actions fail closed; restart the service after connectivity returns.

There is no match count, energy, payment, or daily rematch restriction. Connection, payload, and message throttles protect the service from rapid requests; hosting capacity is still finite. Rooms are invitation-based, not searchable. The code is a bearer invite: keep it among your friends. Production guest play uses HTTPS so credentials and room traffic are encrypted in transit.

### Internet smoke test

Use the real HTTPS URL in two independent browser sessions on different networks (for example desktop Wi-Fi and a friend's phone on mobile data). Create/join by code, chat in both directions, start, roll and move, verify the same positions, switch a phone offline/online, reload and rejoin, finish a game, and rematch. Repeat with four players. Check proxy/WebSocket logs if a session cannot connect. Record the result before claiming internet play is verified.

## Animation, sound and visual presentation

The rules and Socket.IO event names are unchanged. Each accepted roll/move/skip now includes a small `lastEvent` record in the committed room snapshot: match/version identity, server timestamp, acting player, and for moves the validated start/end progress and captured tokens. Public snapshots also carry `serverTime`. Older snapshots without this optional metadata still render correctly.

`shared/animation.js` owns the tunable timings: **180 ms per cell**, 140 ms final landing, and 480 ms dice roll. `movementPath()` maps each progress step through the existing engine geometry, including corners and home lanes; leaving the yard is one entry hop. No game rules or server turns wait on animation timers.

`frontend/src/animation/PresentationController.js` serializes visual transitions separately from authoritative state. It deduplicates acknowledgements by version, queues new transitions, skips expired events, and cancels animation on disconnect, visibility changes, version gaps, refresh and room changes. Rejoining takes the latest snapshot directly. Reduced motion applies the committed result without hops, tumbling or confetti. Interaction locks cover both board tokens and the large mobile move controls.

`frontend/src/audio/SoundManager.js` generates original Web Audio chimes for dice, each step, sixes, captures, turn changes, wins, and incoming live chat. There are no recorded assets to download or license. The header's Sound settings control mute and volume, saved in this browser. Audio unlocks on a user gesture; autoplay denial or unavailable audio remains silent without blocking play. Hidden tabs and restored chat history do not replay sounds.

The animated SVG board, glossy token faces, dice, player highlights, and confetti are original code. Chat stays in a separate responsive panel.

Focused browser fixtures live only in `tests/browser/fixtures/server.js`, bind to loopback, and require a test header. They are not imported by production or copied into the Docker image. They seed exact positions/dice so hop counts, capture/win boundaries, live celebrations, refresh and rematches can be tested deterministically. Run `npm run test:browser -- --grep presentation` for those scenarios.
