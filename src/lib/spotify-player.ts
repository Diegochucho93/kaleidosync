import { ref, readonly } from "vue";
import { getValidToken } from "./spotify-pkce";

declare global {
  interface Window {
    Spotify: typeof Spotify;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
}

export interface SpotifyPlayerState {
  track: SpotifyTrack | null;
  position: number;
  duration: number;
  paused: boolean;
  timestamp: number;
}

const deviceId = ref<string | null>(null);
const playerState = ref<SpotifyPlayerState | null>(null);
const isReady = ref(false);
const isConnected = ref(false);

let player: Spotify.Player | null = null;
let stateInterval: ReturnType<typeof setInterval> | null = null;

function mapState(state: Spotify.PlaybackState): SpotifyPlayerState {
  const track = state.track_window.current_track;
  return {
    track: {
      id: track.id ?? "",
      name: track.name,
      artists: track.artists,
      album: {
        name: track.album.name,
        images: track.album.images,
      },
      duration_ms: track.duration_ms,
    },
    position: state.position,
    duration: state.duration,
    paused: state.paused,
    timestamp: Date.now(),
  };
}

function loadSDK(): Promise<void> {
  return new Promise(resolve => {
    if (window.Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => resolve();

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.head.appendChild(script);
  });
}

export async function connectPlayer(): Promise<void> {
  await loadSDK();

  const token = await getValidToken();
  if (!token) throw new Error("No valid Spotify token");

  player = new window.Spotify.Player({
    name: "Kaleidosync",
    getOAuthToken: async (cb: (token: string) => void) => {
      const t = await getValidToken();
      if (t) cb(t);
    },
    volume: 0.8,
  });

  player.addListener("ready", ({ device_id }: { device_id: string }) => {
    deviceId.value = device_id;
    isReady.value = true;
    isConnected.value = true;
    transferPlayback(device_id);
  });

  player.addListener("not_ready", () => {
    isReady.value = false;
  });

  player.addListener("player_state_changed", (state: Spotify.PlaybackState) => {
    if (!state) return;
    playerState.value = mapState(state);
  });

  player.addListener("initialization_error", ({ message }: { message: string }) => {
    console.error("Spotify init error:", message);
  });

  player.addListener("authentication_error", ({ message }: { message: string }) => {
    console.error("Spotify auth error:", message);
  });

  player.addListener("account_error", ({ message }: { message: string }) => {
    console.error("Spotify account error:", message);
  });

  await player.connect();

  // Poll position every 500ms so we have smooth timing data for the visualizer
  stateInterval = setInterval(async () => {
    if (!player || !isReady.value) return;
    const state = await player.getCurrentState();
    if (state) playerState.value = mapState(state);
  }, 500);
}

export function disconnectPlayer(): void {
  if (stateInterval) clearInterval(stateInterval);
  player?.disconnect();
  player = null;
  isReady.value = false;
  isConnected.value = false;
  deviceId.value = null;
  playerState.value = null;
}

async function transferPlayback(id: string): Promise<void> {
  const token = await getValidToken();
  if (!token) return;

  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [id], play: false }),
  });
}

export async function fetchAudioAnalysis(trackId: string): Promise<any> {
  const token = await getValidToken();
  if (!token) return null;

  const res = await fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}

export function getCurrentPosition(): number {
  const state = playerState.value;
  if (!state || state.paused) return state?.position ?? 0;
  return state.position + (Date.now() - state.timestamp);
}

export const spotifyDeviceId = readonly(deviceId);
export const spotifyPlayerState = readonly(playerState);
export const spotifyIsReady = readonly(isReady);
export const spotifyIsConnected = readonly(isConnected);
