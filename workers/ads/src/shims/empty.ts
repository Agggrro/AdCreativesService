// `server-only` and `client-only` are markers Next resolves at build time; they
// keep server code out of a client bundle. A Worker has no client bundle, so
// here — as in scripts/app-imports-hook.mjs — they are empty modules.
export {};
