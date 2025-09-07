# HCS-20 Demo Examples

This directory contains example implementations of the HCS-20 Auditable Points Standard.

## Examples

### 1. Deploy Points (SDK)
`deploy-points.ts` - Shows how to deploy new points with a private topic

```bash
# Set environment variables
export OPERATOR_ID="0.0.YOUR_ACCOUNT"
export OPERATOR_KEY="YOUR_PRIVATE_KEY"

# Run the example
npm run ts-node demo/hcs-20/deploy-points.ts
```

### 2. Mint, Transfer & Burn (SDK)
`mint-transfer-burn.ts` - Demonstrates the full lifecycle of points operations

```bash
npm run ts-node demo/hcs-20/mint-transfer-burn.ts
```

### 3. Browser Example
`browser-example.html` - Interactive web interface for HCS-20 operations

1. Build the SDK for browser use
2. Update the import path in the HTML file
3. Open in a web browser
4. Connect with HashPack wallet

## Key Concepts

### Private vs Public Topics
- **Private Topics**: Only authorized accounts can submit messages (has submit key)
- **Public Topics**: Anyone can submit, but payer must match sender for transfers/burns

### Points Operations
1. **Deploy**: Create new points with max supply and optional mint limit
2. **Mint**: Create new points up to max supply
3. **Transfer**: Move points between accounts
4. **Burn**: Destroy points, reducing total supply

### Registry
Topics can be registered in the HCS-20 registry (Topic: 0.0.4362300) for discoverability.

## Testing on Testnet

1. Get testnet HBAR from the [Hedera Portal](https://portal.hedera.com)
2. Use the examples with your testnet account
3. Monitor transactions on [HashScan](https://hashscan.io/testnet)

## Important Notes

- Points have no monetary value by design
- All transactions are publicly auditable on HCS
- State is calculated by processing all messages in order
- Mirror node indexing may have a slight delay