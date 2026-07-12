// videojs-ima and videojs-contrib-ads ship no TypeScript declarations. Both are
// imported purely for their side effect of registering a Video.js plugin;
// components/players/VideoJsPlayer.tsx calls the resulting `player.ima(...)`
// through a small local type instead of importing typed exports from here.
declare module "videojs-ima";
declare module "videojs-contrib-ads";
