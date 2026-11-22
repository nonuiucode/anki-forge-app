import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.nonuiucode.ankiforge',
  appName: 'Anki Forge',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
