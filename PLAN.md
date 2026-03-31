# Kaleidosync Local-First Rebuild Plan

## Current State: What's Broken

### 1. Routing 404
- `SageRouterView` shows 404 at `/` on first load
- Root cause: timing race in `sage-router.ts` between `matchRoute` assignment and Vue computed evaluation
- Workaround in `main.ts` (`dispatchEvent(popstate)`) doesn't work because Vue skips reactive updates when the value hasn't changed

### 2. Heroku API (Dead)
- `https://kaleidosync-api-690ea0e25a5b.herokuapp.com` — Heroku free tier is gone, app is dead
- All three uses are broken:
  - `/api/spotify/auth` — OAuth redirect start
  - `/api/spotify/refresh` — Token refresh
  - `/api/spotify/now-playing` — Current track + Echo Nest audio analysis

### 3. Socket / WebSocket (Dead)
- `wss://kaleidosync-api-690ea0e25a5b.herokuapp.com` — same dead Heroku app
- Not actively used in the UI anyway (collaboration features not implemented)
- Safe to disable entirely

### 4. S3 Bucket (Unused)
- `https://s3.us-west-1.amazonaws.com/kaleidosync.com` — referenced in `.env` but never fetched
- Sketches/shaders are already bundled in TypeScript — no S3 dependency

### 5. Audius (Broken)
- All Audius API calls are proxied through the dead Heroku backend
- The Audius pages exist but will fail to load data

---

## What Already Works Locally (No Changes Needed)

- WebGL renderer / all visualizer shaders (bundled in code)
- Sketch selection, navigation, tweening
- Microphone input
- Local file upload (audio)
- Radio Paradise streams (direct browser fetch)
- KEXP stream (direct browser fetch)

---

## Goal

Make everything work locally, with Spotify as the primary connected audio source using:
1. **PKCE OAuth flow** — client-side only, no backend server needed
2. **Spotify Web Playback SDK** — plays music directly in the browser tab
3. **Spotify Web API** — fetches audio analysis (beats, segments, loudness) directly from Spotify

---

## Step-by-Step Plan

---

### Step 1 — Fix the Routing 404

**File:** `src/main.ts`

**Problem:** `window.dispatchEvent(new PopStateEvent("popstate"))` sets `currentPath.value` to the same value (`/`), so Vue's reactivity skips the update and the route stays unmatched.

**Fix:** Force re-evaluation by briefly navigating away then replacing back, OR directly invoke the router's internal reactive state reset.

Cleanest fix without touching `node_modules`:
- After `createApp`, use the router's `replace` with the current path via a microtask gap that lets Vue flush first:

```ts
// main.ts — replace hack with a proper post-mount re-navigation
const { app, router } = await createApp(App, { routes: generatedRoutes });
// Give Vue one tick to mount, then trigger route re-evaluation
await Promise.resolve();
const currentPath = window.location.pathname + window.location.search + window.location.hash;
router.replace(currentPath);
```

OR — even simpler — force the path to a different value momentarily so Vue's reactivity fires:

```ts
// The popstate listener sets currentPath.value. Vite/Vue won't fire if value is the same.
// Trick: set to empty string first, then back to actual path.
// We do this by calling the internal __SAGE_ROUTER__ directly after mount.
await Promise.resolve(); // let mount flush
const r = (window as any).__SAGE_ROUTER__;
r.replace('/__init__');
r.replace(window.location.pathname + window.location.search);
```

**Recommended approach:** Patch `sage-router.ts` in node_modules to add a `forceRefresh()` function that clears and resets `currentPath`. Since this is a local dev setup, node_modules edits are acceptable.

Specifically in `sage-router.ts`, add after `createSageRouter` sets the routes:
```ts
// Invalidate computed cache by forcing a path change
const saved = currentPath.value;
currentPath.value = '';
currentPath.value = saved;
```

---

### Step 2 — Set Up Spotify PKCE OAuth (Client-Side)

**Why PKCE:** No backend server needed. The browser handles the full OAuth flow.

**Prerequisites:**
- Spotify Developer account
- Create an app at https://developer.spotify.com/dashboard
- Add `http://localhost:5173/callback` as Redirect URI
- Note the **Client ID** (no client secret needed for PKCE)

**New env vars to add to `.env`:**
```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
```

**New file:** `src/lib/spotify-pkce.ts`
- `generateCodeVerifier()` — random 128-char string, stored in sessionStorage
- `generateCodeChallenge(verifier)` — SHA-256 hash, base64url encoded
- `buildAuthUrl()` — constructs Spotify auth URL with PKCE params
- `exchangeCodeForToken(code)` — POST to `https://accounts.spotify.com/api/token`
- `refreshAccessToken(refreshToken)` — refresh using stored refresh_token
- `getStoredToken()` / `storeToken()` — localStorage persistence

**Required OAuth scopes:**
```
streaming
user-read-email
user-read-private
user-read-playback-state
user-modify-playback-state
user-read-currently-playing
```

---

### Step 3 — Add `/callback` Route

**File:** `src/pages/callback.vue` (new file)
**Route:** Add to `src/routes.generated.ts`

The callback page:
- Reads `?code=` from URL
- Exchanges code for access token via `spotify-pkce.ts`
- Stores tokens in localStorage
- Redirects to `/visualizer`

---

### Step 4 — Implement Spotify Web Playback SDK

**Why:** The SDK creates a browser-based Spotify player. You get a `device_id` to transfer playback to, plus real-time events (`player_state_changed`) for position tracking.

**New file:** `src/lib/spotify-player.ts`
- Loads `https://sdk.scdn.co/spotify-player.js` dynamically
- Creates `Spotify.Player` with access token
- Exposes: `deviceId`, `currentState`, `connect()`, `disconnect()`
- Events: `ready`, `not_ready`, `player_state_changed`

**Integration with visualizer:**
- On `player_state_changed`: extract `position`, `duration`, `track_window.current_track`
- Use position + audio analysis data to drive visualizer timing

---

### Step 5 — Replace Spotify Store (Remove Backend Dependency)

**File to rewrite:** `node_modules/@wearesage/vue/src/stores/spotify.ts`

OR (better): Create a replacement composable `src/stores/spotify-local.ts` that the visualizer uses instead.

**Current flow (broken):**
```
click auth → /api/spotify/auth (Heroku) → callback → poll /api/spotify/now-playing
```

**New flow:**
```
click auth → PKCE buildAuthUrl() → /callback → exchangeCode → store tokens
→ Spotify Web Playback SDK (browser player)  
→ player_state_changed events → position tracking
→ Spotify Web API /audio-analysis/{trackId} → segment/beat data
→ useEchoNest() composable receives data → drives visualizer uniforms
```

**Key difference:** Instead of polling the backend for "now playing" every second, we:
1. Subscribe to `player_state_changed` (fires on every track/position change)
2. Fetch audio analysis once per track from `https://api.spotify.com/v1/audio-analysis/{id}`
3. Use track position from SDK state + audio analysis timing to calculate which segment/beat we're in

---

### Step 6 — Wire Up AudioSources to New Spotify Flow

**File:** `src/components/AudioSources.vue`

Currently the Spotify button redirects to the dead Heroku auth URL. Change it to call the new PKCE auth flow.

Also wire up the Web Playback SDK audio output to the existing `AudioAnalyser` / `useSources` pipeline so the visualizer responds to the actual music volume.

---

### Step 7 — Disable/Stub Audius Backend Routes

The Audius pages (`/audius`, `/audius/users/:id`, `/audius/playlists/:id`) currently call the dead Heroku backend.

Options:
1. **Remove the pages from navigation** (simplest)
2. **Call Audius API directly** — Audius has a public API (`https://discoveryprovider.audius.co`) with no auth needed for most endpoints
3. **Stub with empty data** — show "Audius unavailable" message

**Recommended:** Option 2 (direct Audius API) since the data structures are already defined. But this is a separate effort. For now, stub with a message.

---

### Step 8 — Update .env for Local Mode

```env
# Spotify (PKCE - no backend needed)
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback

# Remove/disable backend
# VITE_API_BASE_URL=http://localhost:2223
# VITE_SOCKET_URL=ws://localhost:2223

# Keep these but they're unused
VITE_S3_BUCKET=https://s3.us-west-1.amazonaws.com/kaleidosync.com
VITE_REOWN_PROJECT_ID=5be0f8470c97bc91724fc88b4c86f005
```

---

### Step 9 — Fix SCSS/Styling Issues (if any)

The app uses `@wearesage/sass` for SCSS mixins. These are bundled in node_modules and should work. Verify no broken mixin references.

---

## File Change Summary

| File | Action | Notes |
|------|--------|-------|
| `src/main.ts` | Fix routing init | Force route re-evaluation after mount |
| `src/routes.generated.ts` | Add `/callback` route | Spotify OAuth return |
| `src/pages/callback.vue` | New file | Handle Spotify callback |
| `src/lib/spotify-pkce.ts` | New file | PKCE OAuth helpers |
| `src/lib/spotify-player.ts` | New file | Web Playback SDK wrapper |
| `src/stores/spotify-local.ts` | New file | Replaces dead Heroku spotify store |
| `src/components/AudioSources.vue` | Modify | Wire new Spotify auth |
| `.env` | Update | Add Spotify client ID, disable backend |
| `node_modules/@wearesage/vue/src/router/sage-router.ts` | Patch | Fix routing race condition |

---

## Order of Work

1. **Fix routing** (Step 1) — unblocks everything, app loads
2. **Spotify PKCE setup** (Steps 2-3) — auth without backend
3. **Web Playback SDK** (Step 4) — browser-based playback
4. **New Spotify store** (Step 5) — remove Heroku dependency
5. **Wire AudioSources** (Step 6) — connect UI to new flow
6. **Stub Audius** (Step 7) — clean up dead routes
7. **Update .env** (Step 8) — finalize config

---

## What You Need Before We Start

- **Spotify Developer account** with an app created
- **Client ID** from https://developer.spotify.com/dashboard
- Add `http://localhost:5173/callback` to the app's Redirect URIs
- A **Spotify Premium account** (required for Web Playback SDK)
