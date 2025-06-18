// Polyfill for Web Crypto API in Node.js environment
const { Crypto } = require('@peculiar/webcrypto');

// Create a crypto instance
const crypto = new Crypto();

// Define it on all possible global objects
const globalObjects = [global, globalThis];

// Also create a window object if it doesn't exist
if (typeof window === 'undefined') {
  global.window = global;
}
globalObjects.push(global.window);

// Apply crypto to all global objects
globalObjects.forEach(obj => {
  if (obj) {
    Object.defineProperty(obj, 'crypto', {
      value: crypto,
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

// Additional fallback for modules that might check differently
if (typeof self === 'undefined') {
  global.self = global;
}
if (self && !self.crypto) {
  self.crypto = crypto;
}

console.log('✅ Web Crypto API polyfilled successfully');
console.log('   - global.crypto.subtle:', !!global.crypto?.subtle);
console.log('   - globalThis.crypto.subtle:', !!globalThis.crypto?.subtle);
console.log('   - window.crypto.subtle:', !!(global.window?.crypto?.subtle));
console.log('   - self.crypto.subtle:', !!(global.self?.crypto?.subtle)); 