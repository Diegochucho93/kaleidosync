const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string;
console.log("🎵 Spotify REDIRECT_URI:", REDIRECT_URI);

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

const TOKEN_KEY = "spotify_token";
const VERIFIER_KEY = "spotify_code_verifier";

export interface SpotifyToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateVerifier(): string {
  return base64url(randomBytes(96));
}

async function generateChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64url(hash);
}

export async function redirectToSpotifyAuth(): Promise<void> {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<SpotifyToken> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("No code verifier found — restart auth flow");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await response.json();
  sessionStorage.removeItem(VERIFIER_KEY);

  const token: SpotifyToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  storeToken(token);
  return token;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyToken> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await response.json();

  const token: SpotifyToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  storeToken(token);
  return token;
}

export function storeToken(token: SpotifyToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function getStoredToken(): SpotifyToken | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifyToken;
  } catch {
    return null;
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isTokenExpired(token: SpotifyToken): boolean {
  return Date.now() >= token.expires_at - 60_000;
}

export async function getValidToken(): Promise<string | null> {
  let token = getStoredToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    try {
      token = await refreshAccessToken(token.refresh_token);
    } catch {
      clearToken();
      return null;
    }
  }

  return token.access_token;
}
