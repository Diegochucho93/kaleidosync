<template>
  <div class="callback">
    <p v-if="error">{{ error }}</p>
    <p v-else>Connecting to Spotify...</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "@wearesage/vue";
import { exchangeCodeForToken } from "../lib/spotify-pkce";

const router = useRouter();
const error = ref("");

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const err = params.get("error");

  if (err) {
    error.value = `Spotify auth denied: ${err}`;
    return;
  }

  if (!code) {
    error.value = "No auth code received";
    return;
  }

  try {
    await exchangeCodeForToken(code);
    router.replace("/visualizer?spotify=connected");
  } catch (e: any) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.callback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  font-family: monospace;
  color: #e7e7e7;
}
</style>
