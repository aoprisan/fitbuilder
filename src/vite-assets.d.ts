// Vite's `?url` import suffix resolves an asset to its emitted URL string.
// We use it to hand pdf.js the URL of its bundled worker module.
declare module "*?url" {
  const src: string;
  export default src;
}

// ISO timestamp injected by Vite's `define` at build/dev-server start.
declare const __BUILD_TIME__: string;

// Minimal typing for the `import.meta.env` vars we read (the project sets
// tsconfig `types: []`, so Vite's own client types aren't pulled in). Only the
// build-time analytics config is declared — everything else stays off-limits.
interface ImportMetaEnv {
  /** Plausible site domain; leaving it unset disables analytics entirely. */
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  /** Override the Plausible events endpoint (e.g. a self-hosted Umami/Plausible). */
  readonly VITE_PLAUSIBLE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
