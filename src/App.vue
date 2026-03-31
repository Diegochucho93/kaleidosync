<template>
  <AppRouterView />
  <Renderer />
  <Toast />
  <Popover />
</template>

<script lang="ts" setup>
import { Toast, Popover } from "@wearesage/vue";
import Renderer from "./components/Renderer.vue";
import AppRouterView from "./components/AppRouterView.vue";
</script>

<style lang="scss">
@import "@wearesage/vue/css";
@import "@wearesage/vue/styles/appkit-custom.css";
</style>
