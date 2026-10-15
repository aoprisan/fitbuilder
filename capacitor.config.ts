import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fitbuilder.app",
  appName: "Gym Log",
  // Vite emits the production web build here; `cap sync` copies it into
  // the native projects. Run `npm run build` before any sync.
  webDir: "dist",
  backgroundColor: "#0b0c0e",
  plugins: {
    // Rest-over alert (src/notify.ts). Android needs a monochrome status-bar
    // icon (res/drawable/ic_stat_timer.xml); iOS shows the banner even while
    // the app is in the foreground.
    LocalNotifications: {
      smallIcon: "ic_stat_timer",
      iconColor: "#d6422b",
      presentationOptions: ["sound", "banner", "list"],
    },
  },
};

export default config;
