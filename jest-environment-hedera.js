const { TestEnvironment } = require('jest-environment-node');

class HederaTestEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    
    // Add window object with minimal implementation
    this.global.window = {
      location: {
        href: 'http://localhost',
        origin: 'http://localhost'
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      postMessage: () => {},
    };
    
    // Add other browser globals that might be needed
    this.global.self = this.global.window;
    this.global.navigator = {
      userAgent: 'node.js'
    };
  }
}

module.exports = HederaTestEnvironment;