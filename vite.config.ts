import { defineConfig } from "vite";

// Relative base so the build works whether served from a domain root,
// a sub-path, or `vite preview`.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
