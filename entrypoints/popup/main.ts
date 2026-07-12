import { createApp } from 'vue';
import '@/assets/styles/globals.css';
import { storage } from '#imports';
import { bootstrapStoredTheme } from '@/shared/theme';
import App from './App.vue';

await bootstrapStoredTheme(storage);
createApp(App).mount('#app');
