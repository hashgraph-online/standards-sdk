# HCS-12 HashLinks Demo

This directory contains a complete demonstration of the HCS-12 HashLinks standard, showing how blocks bind to WASM-based actions.

## Structure

```
hcs-12/
├── rust-wasm/           # The WASM module source (Rust)
│   ├── src/lib.rs      # Counter module implementation
│   ├── Cargo.toml      # Rust dependencies
│   └── build.sh        # Build script
├── hcs12-demo.ts       # CLI demo - builds WASM, extracts INFO, deploys to Hedera
└── web-demo.html       # Browser demo - shows action binding in practice
```

## The WASM Module

The counter module in `rust-wasm/src/lib.rs` implements the HCS-12 standard:
- Exports an `INFO` method that returns module metadata
- Exports `POST` and `GET` methods for action execution
- Provides increment, decrement, and reset actions

## Running the Demo

### Prerequisites

1. Install Rust and wasm-pack:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   cargo install wasm-pack
   ```

2. Set Hedera credentials:
   ```bash
   export HEDERA_ACCOUNT_ID="0.0.xxxxx"
   export HEDERA_PRIVATE_KEY="your-private-key"
   ```

### CLI Demo

```bash
# Run the complete demo
npm run demo:hcs12

# Or directly
npx tsx demo/hcs-12/hcs12-demo.ts
```

This will:
1. Build the WASM module
2. Extract INFO from the WASM (per HCS-12 standard)
3. Inscribe the WASM via HCS-1
4. Register the action with the INFO hash
5. Create and register blocks
6. Create and register an assembly using the new incremental approach

### Web Demo

```bash
# Build the WASM for web
cd demo/hcs-12/rust-wasm
./build.sh

# Serve the web demo
npx http-server demo/hcs-12 -p 8080
```

Then open http://localhost:8080/web-demo.html

## Key Points

1. **Single WASM Source**: All demos use the same WASM module from `rust-wasm/`
2. **Standard Compliance**: The WASM module exports INFO, GET, and POST per HCS-12
3. **INFO Hash**: The hash in action registration comes from calling the WASM's INFO method
4. **Incremental Assembly**: Uses the new approach with register, add-action, add-block operations