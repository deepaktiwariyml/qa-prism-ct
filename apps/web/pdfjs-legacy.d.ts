// pdf.js "legacy" build ships extra polyfills (e.g. Uint8Array.prototype.toHex)
// needed by older Chromium (Electron). It has no type declarations of its own,
// so declare it and cast to the main pdfjs-dist types at the call site.
declare module 'pdfjs-dist/legacy/build/pdf.mjs';
