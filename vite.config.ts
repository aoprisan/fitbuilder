import { defineConfig } from "vite";

// Relative base so the build works whether served from a domain root,
// a sub-path, or `vite preview`.
export default defineConfig({
  base: "./",
  define: {
    // Stamped at build/dev-server start so the running copy can show its vintage.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
