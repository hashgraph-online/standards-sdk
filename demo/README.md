# Inscribe Demo

This demo showcases the inscription API of the Standards SDK.

## Setup

1. Copy `.env.example` to `.env` and fill in your API key, account ID, and private key:

```bash
cp .env.example .env
```

2. Edit the `.env` file with your credentials:

```
API_KEY=your_api_key_here
ACCOUNT_ID=0.0.12345
PRIVATE_KEY=your_private_key_here
NETWORK=testnet
```

## Running the Demo

Run the demo using the following command from the root of the project:

```bash
npm run demo
```

## What the Demo Does

The demo performs the following operations:

1. Text Inscription - Inscribes a simple text message and retrieves the confirmed data
2. URL Inscription - Inscribes a URL to the Hedera logo and retrieves the confirmed data
3. Buffer Inscription - Creates a file and inscribes it from a buffer, retrieving the confirmed data
4. Hashinal Inscription from URL - Creates a Hashinal NFT using the Hedera logo URL and retrieves the confirmed data
5. Hashinal Inscription from Buffer - Creates a Hashinal NFT using a file buffer and retrieves the confirmed data
6. Hashinal Inscription from Text - Creates a Hashinal NFT using text content and retrieves the confirmed data
7. Retrieves an inscription manually to demonstrate the separate retrieval function

All inscriptions are performed using the unified `inscribe` function with `waitForConfirmation: true`, which automatically waits for the inscription to be confirmed and returns the complete inscription data. This demonstrates how a single API can handle different types of content with different modes and provide immediate access to the inscribed data.

The demo shows that any content type (text, URL, file, buffer) can be inscribed as a regular file inscription or as a Hashinal NFT by simply setting the `mode` option, and the response will include both the transaction result and the retrieved inscription data.
