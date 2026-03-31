<template>
  <transition name="view">
    <component v-if="currentComponent && !loading" :is="currentComponent" :key="currentPath" />
    <div v-else-if="loading" class="loading" />
    <div v-else class="not-found">
      <h1>404</h1>
      <p>{{ currentPath }}</p>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted } from "vue";
import { matchRoute } from "../routes.generated";

// We read path directly from window — not from the broken sage-router computed.
// Navigation (push/replace) calls history.pushState which doesn't fire popstate,
// so we also patch those to fire a custom event.
const currentPath = ref(window.location.pathname + window.location.search);
const currentComponent = shallowRef<any>(null);
const loading = ref(false);

async function loadRoute(path: string) {
  const pathname = path.split("?")[0];
  const matched = matchRoute(pathname);
  if (!matched) {
    currentComponent.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const mod = await matched.component();
    currentComponent.value = mod?.default || mod;
  } catch (e) {
    console.error("Failed to load route component:", e);
    currentComponent.value = null;
  } finally {
    loading.value = false;
  }
}

// Patch pushState / replaceState to fire a custom event so we can react to
// programmatic navigation (history.pushState doesn't trigger popstate).
const _push = history.pushState.bind(history);
const _replace = history.replaceState.bind(history);

history.pushState = function (...args) {
  _push(...args);
  window.dispatchEvent(new Event("locationchange"));
};

history.replaceState = function (...args) {
  _replace(...args);
  window.dispatchEvent(new Event("locationchange"));
};

function syncPath() {
  currentPath.value = window.location.pathname + window.location.search;
}

window.addEventListener("popstate", syncPath);
window.addEventListener("locationchange", syncPath);

watch(currentPath, (path) => loadRoute(path), { immediate: true });
</script>

<style scoped>
.loading,
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  flex-direction: column;
  gap: 1rem;
  font-family: monospace;
  color: #e7e7e7;
}
</style>
