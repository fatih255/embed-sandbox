import { install } from './runtime';

// document.currentScript is only set while this file runs for the first time,
// so read it synchronously. It works for async, defer and injected scripts.
install(window, document.currentScript ?? document.querySelector('script[src$="/embed.js"]'));
