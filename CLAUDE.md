# CLAUDE.md

# Kaleidosync — AI Agent Rules File
# ⚠️ This project is owned and built entirely by requiteslopez
# Read this at the start of every session. No exceptions.

---

## What this project is

Kaleidosync is a web-based music visualization platform that synchronizes animated, shader-based visual effects with real-time audio playback. It renders fragment shaders driven by audio analysis data (beats, segments, loudness, frequency spectrum) from multiple audio sources.

**Frontend:** Vue 3 (TypeScript, Composition API, SCSS)
**Build Tool:** Vite 6
**3D Graphics:** TresJS (Three.js wrapper for Vue)
**State Management:** Pinia
**Audio Sources:** Spotify Web Playback SDK, Audius API, Radio Paradise, KEXP
**UI Framework:** @wearesage/vue (custom Sage framework — treat as a black box unless modifying it directly)
**Real-time:** Socket.IO (for shared studies/gist content)
**Auth:** Spotify OAuth PKCE flow — no traditional login/sessions/JWT
**Deployment:** Node.js static server (production), Vite dev server (local)

**Repo structure:** Single frontend-focused project
```
kaleidosync-master/
  src/
    main.ts                    ← App entry point
    App.vue                    ← Root component
    pages/                     ← Route-based pages (visualizer, design, settings, etc.)
    components/                ← Reusable Vue components (Renderer.vue is the core)
    stores/                    ← Pinia stores (spotify.ts)
    lib/                       ← Utility libs (spotify-player.ts, spotify-pkce.ts)
    routes.generated.ts        ← Auto-generated routes (do not hand-edit)
  public/                      ← Static assets
  index.html                   ← HTML entry point
  vite.config.ts               ← Vite config
  .env / .env.example          ← Environment variables
  CLAUDE.md                    ← this file
  PLAN.md                      ← project planning notes
```

**This project runs locally on one Mac with local HTTPS (localhost.pem).**
Run git commands from the repo root.

---

## Non-negotiable rules

### Git — do this before every task
```
git status                              # confirm you're on the right branch
git pull                                # get latest
git checkout -b feature/your-task-name  # new branch for every task
```

Never work directly on main. Never. If you're on main, stop and ask.

### Commit small, commit often
After every meaningful change that works, commit:
```
git add -A
git commit -m "feat: description of exactly what changed"
```

Do not batch 10 changes into one commit. One logical change = one commit.

### Never modify these files without explicit instruction
- `.env` / `.env.local` — API keys and config live here, do not touch
- `VITE_OPENROUTER_API_KEY` / `VITE_REOWN_PROJECT_ID` — never log, never expose client-side beyond what Vite already does, never hardcode
- `src/routes.generated.ts` — auto-generated, do not hand-edit
- `localhost.pem` / `localhost-key.pem` — local HTTPS certs, do not modify
- Any shader compilation logic in `Renderer.vue` — affects all visualizations, confirm before changing
- `vite.config.ts` — build config, confirm before changing

---

## Discovery — FIRST THING every session

Before writing ANY code, run this:
```bash
# 1. Check source structure
ls src/pages/
ls src/components/
ls src/stores/
ls src/lib/

# 2. Check config
cat package.json | head -30
cat .env 2>/dev/null || echo "No .env file — copy from .env.example"
cat .env.example

# 3. Check overall source files
find src -type f \( -name "*.ts" -o -name "*.vue" \) | grep -v node_modules | sort

# 4. Check for any recent changes
git log --oneline -10
```

Report what you find BEFORE proposing any changes. Do not skip this.

---

## Security rules — always enforced

1. **API keys are environment variables only.** `VITE_OPENROUTER_API_KEY`, `VITE_REOWN_PROJECT_ID`, and any other credentials must never be hardcoded in source files or committed to version control.

2. **VITE_ prefix exposes vars to the browser bundle.** Any `VITE_*` variable is visible in the built JS. Do not put server-only secrets under the `VITE_` prefix. If a key must be truly secret, it belongs in a backend proxy — not in Vite env vars.

3. **Spotify OAuth tokens.** Access tokens live in memory (Pinia store) and are refreshed via PKCE flow. Do not persist them to localStorage, cookies, or any other storage without explicit instruction.

4. **No backend auth to build.** Kaleidosync uses Spotify's OAuth as its only identity layer. Do not introduce new auth systems, JWT, sessions, or login flows unless explicitly instructed.

5. **Third-party API calls from the client.** Spotify API, Audius API, and OpenRouter are called from the frontend. Do not log full API responses that may contain user PII or tokens.

---

## Error handling rules — always enforced

1. **Never show a blank screen.** Every error must render a user-facing message or gracefully degrade. No raw stack traces in the UI.

2. **Shader compilation errors** must be caught and displayed in the design interface — never crash the renderer silently.

3. **Spotify SDK failures** must degrade gracefully:
   - Player not ready → show "Connecting to Spotify..." state, not a broken UI
   - Auth failure / token expiry → redirect to login flow cleanly
   - Track analysis unavailable → visualizer continues with silence/defaults

4. **Audio source switching** must not crash if a source fails to load. Fall back to a neutral state.

5. **Socket.IO disconnects** (for studies/gist content) must not break the main visualizer. Treat the realtime connection as enhancement-only.

6. **Async data fetching** must use try/catch. Show user-friendly errors — not broken component states.

---

## Architecture rules

### What exists — don't rebuild it

| Layer | Path | Purpose |
|-------|------|---------|
| Entry | `src/main.ts` | App bootstrap — uses @wearesage/vue createApp |
| Root | `src/App.vue` | Renders AppRouterView, Renderer, Toast, Popover |
| Pages | `src/pages/` | Route-based views (visualizer, design, settings, audius, studies, etc.) |
| Core Renderer | `src/components/Renderer.vue` | WebGL/TresJS canvas — the visualization engine |
| Audio Sources | `src/components/AudioSources.vue` | Audio source selector UI |
| Spotify Store | `src/stores/spotify.ts` | Auth state, player state, audio analysis (Pinia) |
| Spotify Player | `src/lib/spotify-player.ts` | Spotify Web Playback SDK wrapper |
| Spotify Auth | `src/lib/spotify-pkce.ts` | OAuth PKCE flow |
| Routes | `src/routes.generated.ts` | Auto-generated — do not edit |

### Data flow — how audio drives visuals

```
User authenticates via Spotify OAuth (PKCE)
    → spotify-pkce.ts handles the OAuth flow
    → Token stored in Pinia (useSpotify store)
    → spotify-player.ts initializes Web Playback SDK
    → Player polls track state and audio analysis from Spotify API
    → Pinia store exposes: volume, stream (frequency), beats, segments, etc.
    → Renderer.vue reads store state
    → Uniforms (volume, stream, time) passed to fragment shaders
    → Three.js/TresJS renders the visualization frame
```

### Shader system

- Fragment shaders are stored as sketch code in state
- Compiled and passed to the WebGL pipeline at runtime
- Uniforms available to shaders: `volume`, `stream`, `time`
- Shader errors are caught — display in `/design` route
- Do not inline shader logic outside `Renderer.vue` and the design page

### Adding new pages / routes
Add a `.vue` file to `src/pages/`. The router auto-generates from file names — do NOT manually edit `routes.generated.ts`. Follow the existing naming conventions (`audius.users.[id].vue` for dynamic routes).

### Adding new components
Put in `src/components/`. Follow Vue 3 Composition API with `<script setup lang="ts">`. Keep components focused — pass data as props or read from Pinia stores.

### Modifying audio analysis / visualizer state
Changes to `src/stores/spotify.ts` affect all visualizer behavior. Read the full store before modifying. Confirm before changing uniform names or analysis data shapes — shaders depend on these.

---

## Tech stack details

### Frontend (Vue 3 / Vite)
```
src/
  main.ts               ← entry point
  App.vue               ← root component
  pages/
    index.vue           ← homepage
    visualizer.vue      ← main visualizer
    design.vue          ← shader editor / customization
    settings.vue        ← user settings
    audius.vue          ← Audius library
    callback.vue        ← Spotify OAuth callback
    studies.vue         ← preset studies list
    studies.[id].vue    ← single study view
    g.[id].vue          ← shared gist view
  components/
    Renderer.vue        ← WebGL canvas (TresJS/Three.js)
    AudioSources.vue    ← audio source selector
    Menu.vue            ← main nav menu
    HomepageHero.vue    ← landing hero
    AppRouterView.vue   ← route view wrapper
  stores/
    spotify.ts          ← Pinia store: auth, player, audio analysis
  lib/
    spotify-player.ts   ← Spotify Web Playback SDK
    spotify-pkce.ts     ← OAuth PKCE
  routes.generated.ts   ← auto-generated, do not edit
```

### Environment variables
```
VITE_DEFAULT_AUTHENTICATED_VIEW=/visualizer   # post-login redirect
VITE_REOWN_PROJECT_ID=                        # Web3/Reown integration
VITE_OPENROUTER_API_KEY=                      # AI/LLM integration (if used)
VITE_S3_BUCKET=                               # Asset storage
VITE_SOCKET_URL=                              # Socket.IO server
VITE_API_BASE_URL=                            # Backend API base URL
```

### Running locally
```bash
# Install dependencies
npm install

# Development (HTTPS on localhost:5173)
npm run dev

# Production build
npm run build

# Preview built app
npm run preview

# Production server
npm start
```

Local dev uses self-signed HTTPS certs (`localhost.pem` / `localhost-key.pem`).
Spotify OAuth requires HTTPS — this is why local HTTPS is configured.

---

## What we are NOT building (scope guard)

Do not add these unless explicitly told to:
- Native mobile app
- Backend API server (this is a frontend-only project unless adding one is explicitly scoped)
- New auth system beyond Spotify OAuth PKCE
- Social features (comments, public profiles, follower graphs)
- Payment processing or subscriptions
- Calendar or scheduling features
- Email or push notifications
- Real-time collaboration beyond the existing Socket.IO studies system
- Docker / containerization (not needed for local dev)

---

## Small bets — how to work

Every task should take under 30 minutes to implement and verify.
If a task seems like it will touch more than 3 files, stop and ask for it to be broken down.
If you're 20 minutes in and something isn't working, say so — don't keep digging.

**Blast radius check before every task:**
- Which files does this change?
- Does it touch shader uniform names or audio analysis data shapes?
- Does it change the Pinia store interface?
- Does it affect the OAuth or token flow?
- Does it touch `Renderer.vue` core rendering logic?
- Does it change the route structure?
- If yes to 2 or more: confirm before proceeding.

---

## Context window management

When you notice yourself:
- Re-reading the same files repeatedly
- Unsure what you changed earlier in the session
- Getting inconsistent results on the same code

Stop. Commit what works. Start a new session with this file loaded.

Use `/compact` at 50% context usage. Use `/clear` when switching between unrelated tasks.
Do not try to power through a degraded context window. The cost is bugs you won't notice until the visualizer breaks at runtime.

---

## Before marking any task done, verify:

- [ ] The project builds with no errors (`npm run build`)
- [ ] The feature works in the browser (not just in theory)
- [ ] Shader compilation errors are handled gracefully
- [ ] No new `console.log` statements left in
- [ ] No hardcoded API keys or secrets
- [ ] Error states are handled and show user-friendly messages
- [ ] Committed on a feature branch, not main
- [ ] `.env` file is NOT committed (check .gitignore)

---

## Key files to read for context

| When working on... | Read first... |
|---|---|
| Visualization / shaders | `src/components/Renderer.vue`, `src/pages/design.vue` |
| Audio analysis / Spotify | `src/stores/spotify.ts`, `src/lib/spotify-player.ts` |
| OAuth / authentication | `src/lib/spotify-pkce.ts`, `src/pages/callback.vue` |
| Page layout / navigation | `src/App.vue`, `src/components/Menu.vue` |
| New pages / routes | `src/routes.generated.ts` (read only), `src/pages/` |
| Audio sources (Audius etc.) | `src/components/AudioSources.vue`, `src/pages/audius.vue` |
| Studies / shared content | `src/pages/studies.vue`, `src/pages/g.[id].vue` |
| Build / environment | `vite.config.ts`, `.env.example` |

---

## ⚠️ This is Kaleidosync.
## Built solo. Full stack owned here — visualization, audio integration, shader system.
## This file is the source of truth for how we build this project.
## If an instruction in chat conflicts with this file, this file wins.
## Ask for clarification before proceeding.
