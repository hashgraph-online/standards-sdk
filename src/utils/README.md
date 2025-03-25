# Standards SDK Utilities

This directory contains shared utilities that can be used across all standards modules in the SDK.

## Logger

The `Logger` utility provides a standardized way to log messages with different severity levels throughout the standards-sdk. It supports configurable log levels, module prefixes, and timestamp formatting.

### Features

- Multiple log levels: debug, info, warn, error
- Module-specific prefixes
- Timestamp support
- Silent mode to disable all logging
- **Singleton implementation** for consistent logging throughout the application

### Usage

#### Recommended Usage (Singleton Pattern)

The Logger is implemented as a singleton, so you should use `Logger.getInstance()` to get the logger instance:

```typescript
import { Logger } from '../utils/logger';

// Get the logger instance with module context
const logger = Logger.getInstance({ module: 'MyModule' });

// Log messages at different levels
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');
```

#### Using with Data

```typescript
const logger = Logger.getInstance();
logger.info('Process completed', {
  duration: 120,
  recordsProcessed: 500,
});
```

#### Changing Log Level

```typescript
// Set to debug to see all messages
Logger.getInstance().setLogLevel('debug');

// Set to error to see only errors
Logger.getInstance().setLogLevel('error');

// You can also change the log level when getting the instance
Logger.getInstance({ level: 'debug' });
```

#### Context-Specific Logging

Even though there's a single logger instance, you can set different module contexts:

```typescript
// In component A
const loggerA = Logger.getInstance({ module: 'ComponentA' });
loggerA.info('Component A initialized'); // Logs: [ComponentA] [INFO] Component A initialized

// In component B
const loggerB = Logger.getInstance({ module: 'ComponentB' });
loggerB.info('Component B initialized'); // Logs: [ComponentB] [INFO] Component B initialized
```

### Integration with Standards

The logger is integrated as a singleton across various standards modules:

1. **EVMBridge** - Uses the singleton logger instance with module context 'EVMBridge'
2. **WasmBridge** - Uses the singleton logger instance with module context 'WasmBridge'
3. **RedisCache** - Uses the singleton logger instance with module context 'RedisCache'
4. **HCS-10** - Integrated with the singleton common logger

### Customizing Logger Behavior

```typescript
// Get the logger instance with custom options
const logger = Logger.getInstance({
  level: 'debug', // Show all log levels
  module: 'CustomModule', // Add a module prefix
  enableTimestamp: true, // Show timestamps
  silent: false, // Enable logging
});

// Change options after creation
logger.setSilent(true); // Temporarily disable logging
logger.setModule('NewModule'); // Change the module prefix
```
