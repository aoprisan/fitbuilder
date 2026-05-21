// Vite's `?url` import suffix resolves an asset to its emitted URL string.
// We use it to hand pdf.js the URL of its bundled worker module.
declare module "*?url" {
  const src: string;
  export default src;
}
