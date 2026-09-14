<script setup lang="ts">
import logo from '@/assets/rayburst-connect.svg';
withDefaults(defineProps<{ size?: number }>(), { size: 22 });
</script>

<template>
  <img :src="logo" :width="size" :height="size" alt="" aria-hidden="true" />
</template>
