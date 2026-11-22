import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.nonuiucode.ankiforge',
  appName: '玖记',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
