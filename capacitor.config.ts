import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fitbuilder.app",
  appName: "Gym Log",
  // Vite emits the production web build here; `cap sync` copies it into
  // the native projects. Run `npm run build` before any sync.
  webDir: "dist",
  backgroundColor: "#0b0c0e",
};

export default config;
