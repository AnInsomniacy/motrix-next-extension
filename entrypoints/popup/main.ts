import { createApp } from 'vue';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@/assets/styles/globals.css';
import { storage } from '#imports';
import { bootstrapStoredTheme } from '@/shared/theme';
import App from './App.vue';

const prefs = await bootstrapStoredTheme(storage);
createApp(App, { prefs }).mount('#app');
