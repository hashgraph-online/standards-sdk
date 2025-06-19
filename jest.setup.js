// Use Node.js's native Web Crypto API
const { webcrypto } = require('crypto');

// Define it on all possible global objects
const globalObjects = [global, globalThis];

if (typeof window === 'undefined') {
  global.window = {};
}
globalObjects.push(global.window);

// Apply crypto to all global objects
globalObjects.forEach(obj => {
  if (obj) {
    Object.defineProperty(obj, 'crypto', {
      value: webcrypto,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
});

// Ensure subtle is available
if (!global.crypto.subtle) {
  throw new Error('Crypto subtle API not available after polyfill');
}

if (typeof self === 'undefined') {
  global.self = global;
}
if (self && !self.crypto) {
  self.crypto = webcrypto;
}

console.log('✅ Native Web Crypto API set up successfully for Jest environment'); 