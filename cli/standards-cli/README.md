# Standards SDK CLI

An interactive Pastel/Ink experience for Hashgraph Online’s Standards SDK. The CLI helps you:

- browse and run every demo with keyboard navigation and rich metadata
- auto-load credentials from `.env`, `TESTNET_/MAINNET_` overrides, and persisted config
- verify or install Cloudflare tooling for registry broker demos
- fall back to scripted commands for CI or automation

## Quick start

From the repository root the helper script installs dependencies on demand:

```bash
pnpm run cli
```

That launches the dashboard. Use the arrow keys/Enter to:

1. **Run a demo** – dry-run or execute with environment validation.
2. **View configuration** – inspect redacted credentials and active network.
3. **Agent utilities** – run Cloudflare checks, installs, or tunnel dry-runs.

> Non-interactive environments (e.g. CI) show guidance with equivalent commands.

### Scripted usage

```bash
# list demos (human readable)
pnpm run cli -- demo list

# list demos as JSON
pnpm run cli -- demo list --json

# inspect a demo definition
pnpm run cli -- demo info hcs-10:create-registry

# execute with env preview only (does not run the demo)
pnpm run cli -- demo run registry-broker --dry-run --print-env

# forward extra flags to the demo via -- separator
pnpm run cli -- demo run registry-broker -- --profile=mcp
```

## Environment configuration

Credentials are resolved in this order and merged automatically:

1. CLI config file (`~/.config/standards-sdk-cli/config.json` on macOS/Linux).
2. `.env.local` / `.env` from the repository root.
3. Process environment (`HEDERA_ACCOUNT_ID`, `TESTNET_HEDERA_PRIVATE_KEY`, `HEDERA_OPERATOR_*`, etc.).

Persist defaults with the `config` command:

```bash
pnpm run cli -- config \
  --network testnet \
  --account-id 0.0.xxxxxx \
  --private-key 302e... \
  --registry-base-url https://registry.hashgraphonline.com/api/v1 \
  --prefer-cloudflared true
```

Useful flags:

- `--reset` – restore defaults
- `--autoTopUp false` / `--historyAutoTopUp false` – toggle registry auto top-ups
- `--env KEY=VALUE` (repeatable) – inject bespoke variables for specific demos

Configuration changes take effect immediately for both interactive and scripted runs.

## Agent utilities

Bundled helpers streamline Cloudflare setup:

```bash
pnpm run cli -- agent check             # detect existing cloudflared
pnpm run cli -- agent check --install   # install/update bundled binary
pnpm run cli -- agent tunnel --dry-run --port 8787
pnpm run cli -- agent tunnel --port 8787  # live tunnel (Ctrl+C to exit)
```

The CLI records the detected binary path in `CLOUDFLARED_BIN` so subsequent runs reuse it automatically.

## Development notes

- Commands live in `cli/standards-cli/source/commands/**`.
- Shared helpers (config, demos, environment, cloudflared) live in `cli/standards-cli/source/lib/**`.
- For hot iteration use `pnpm --dir cli/standards-cli start -- <subcommand>` or `pnpm --dir cli/standards-cli dev`.
- Ensure `pnpm run cli:build` passes before committing.
