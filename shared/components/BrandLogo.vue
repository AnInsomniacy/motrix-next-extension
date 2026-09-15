<script setup lang="ts">
import { browser } from 'wxt/browser';
const source = browser.runtime.getURL('/icon/icon.svg');
</script>

<template>
  <img :src="source" alt="Rayburst Connect" width="32" height="32" />
</template>
