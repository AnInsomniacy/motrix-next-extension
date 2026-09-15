import { createApp } from 'vue';
import { storage } from '#imports';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@/assets/styles/globals.css';
import { bootstrapStoredTheme } from '@/shared/theme';
import App from './App.vue';

const prefs = await bootstrapStoredTheme(storage);
createApp(App, { prefs }).mount('#app');
