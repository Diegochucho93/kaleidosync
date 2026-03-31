import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getStoredToken, clearToken, redirectToSpotifyAuth } from "../lib/spotify-pkce";
import {
  connectPlayer,
  disconnectPlayer,
  spotifyPlayerState,
  spotifyIsReady,
  spotifyIsConnected,
  fetchAudioAnalysis,
  getCurrentPosition,
} from "../lib/spotify-player";

export interface AudioAnalysis {
  segments: any[];
  beats: any[];
  bars: any[];
  sections: any[];
  tatums: any[];
}

export const useSpotify = defineStore("spotify-local", () => {
  const isAuthenticated = ref(!!getStoredToken());
  const isConnected = spotifyIsConnected;
  const isReady = spotifyIsReady;
  const playerState = spotifyPlayerState;

  const track = computed(() => playerState.value?.track ?? null);
  const paused = computed(() => playerState.value?.paused ?? true);

  const audioAnalysis = ref<AudioAnalysis | null>(null);
  let lastTrackId = "";

  // Fetch audio analysis whenever the track changes
  watch(track, async newTrack => {
    if (!newTrack || newTrack.id === lastTrackId) return;
    lastTrackId = newTrack.id;
    audioAnalysis.value = await fetchAudioAnalysis(newTrack.id);
  });

  // Get the current segment/beat for visualizer sync
  const currentSegment = computed(() => {
    if (!audioAnalysis.value?.segments.length) return null;
    const position = getCurrentPosition() / 1000; // ms → seconds
    return (
      audioAnalysis.value.segments.find(
        (s: any) => position >= s.start && position < s.start + s.duration
      ) ?? null
    );
  });

  const currentBeat = computed(() => {
    if (!audioAnalysis.value?.beats.length) return null;
    const position = getCurrentPosition() / 1000;
    return (
      audioAnalysis.value.beats.find(
        (b: any) => position >= b.start && position < b.start + b.duration
      ) ?? null
    );
  });

  // Loudness from current segment, normalized to 0–1
  const loudness = computed(() => {
    const seg = currentSegment.value;
    if (!seg) return 0;
    // Spotify loudness is in dB, roughly -60 to 0
    return Math.max(0, (seg.loudness_max + 60) / 60);
  });

  async function login(): Promise<void> {
    await redirectToSpotifyAuth();
  }

  async function connect(): Promise<void> {
    if (!isAuthenticated.value) return;
    await connectPlayer();
  }

  function logout(): void {
    disconnectPlayer();
    clearToken();
    isAuthenticated.value = false;
    audioAnalysis.value = null;
    lastTrackId = "";
  }

  function setAuthenticated(): void {
    isAuthenticated.value = true;
  }

  return {
    isAuthenticated,
    isConnected,
    isReady,
    playerState,
    track,
    paused,
    audioAnalysis,
    currentSegment,
    currentBeat,
    loudness,
    login,
    connect,
    logout,
    setAuthenticated,
  };
});
