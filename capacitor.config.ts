/// <reference types="node" />

import type { CapacitorConfig } from '@capacitor/cli'

const serverUrl = process.env.FOLLOWAPP_NATIVE_SERVER_URL ?? 'https://followapp.chat'
const usesCleartextServer = serverUrl.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'com.pascalmurasira.followapp',
  appName: 'FollowApp',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: usesCleartextServer,
    iosScheme: usesCleartextServer ? 'http' : 'https',
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
}

export default config
