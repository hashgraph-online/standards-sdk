# Kiloscribe Inscription SDK

TypeScript/JavaScript SDK for inscribing files on the Hedera Hashgraph using Kiloscribe's inscription service.

## Table of Contents

- [Kiloscribe Inscription SDK](#kiloscribe-inscription-sdk)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
    - [For Node.js/Backend Projects](#for-nodejsbackend-projects)
    - [For Browser/Frontend Projects](#for-browserfrontend-projects)
  - [Getting Started](#getting-started)
    - [1. Set Up Your Environment](#1-set-up-your-environment)
    - [2. Choose Your Integration Method](#2-choose-your-integration-method)
      - [A. Browser Apps with WalletConnect (Recommended)](#a-browser-apps-with-walletconnect-recommended)
  - [B. Loading via HCS-3 Recursion](#b-loading-via-hcs-3-recursion)
      - [C. Node.js Apps with Private Key](#c-nodejs-apps-with-private-key)
  - [Creating Different Types of Inscriptions](#creating-different-types-of-inscriptions)
    - [1. Basic File Inscription](#1-basic-file-inscription)
    - [2. Hashinal NFT](#2-hashinal-nft)
    - [3. URL Inscription](#3-url-inscription)
  - [Querying Inscriptions](#querying-inscriptions)
    - [Get Inscriptions](#get-inscriptions)
    - [Get Holder Inscriptions](#get-holder-inscriptions)
  - [Checking Inscription Status](#checking-inscription-status)
    - [1. Simple Status Check](#1-simple-status-check)
    - [2. Wait for Completion](#2-wait-for-completion)
  - [Examples](#examples)
    - [Vanilla JavaScript Demo](#vanilla-javascript-demo)
  - [Try the Interactive Demo](#try-the-interactive-demo)
  - [File Support](#file-support)
    - [Size Limits](#size-limits)
    - [Supported Formats](#supported-formats)
  - [Common Issues](#common-issues)
    - [1. "Account ID not found"](#1-account-id-not-found)
    - [2. "Transaction failed"](#2-transaction-failed)
    - [3. "File too large"](#3-file-too-large)
    - [4. WalletConnect Issues](#4-walletconnect-issues)
  - [Error Handling](#error-handling)
  - [Support](#support)
  - [License](#license)

## Prerequisites

Before you start, you'll need:

1. **Hedera Account**:

   - Create a testnet account at [portal.hedera.com](https://portal.hedera.com)
   - Save your Account ID (e.g., `0.0.123456`)
   - Save your Private Key (DER Encoded)

2. **WalletConnect Project** (for browser apps):

   - Create an account at [cloud.walletconnect.com](https://cloud.walletconnect.com)
   - Create a new project
   - Save your Project ID

3. **Kiloscribe API Key**:

   - Get your API key from [kiloscribe.com/inscription-api](https://kiloscribe.com/inscription-api)

4. **Development Environment**:
   - Node.js 20 or later
   - npm or yarn

## Installation

### For Node.js/Backend Projects

```bash
# Install the SDK and its peer dependencies
npm install @kiloscribe/inscription-sdk @hashgraph/sdk
```

### For Browser/Frontend Projects

```bash
# Install the SDK and wallet connection dependencies
npm install @kiloscribe/inscription-sdk @hashgraphonline/hashinal-wc @hashgraph/sdk @hashgraph/hedera-wallet-connect
```

## Getting Started

**Topic Id** : **0.0.8084856**

### 1. Set Up Your Environment

Create a `.env` file in your project root:

```env
# Required for all projects
API_KEY=your_kiloscribe_api_key
HEDERA_NETWORK=testnet  # or mainnet

# For Node.js projects using private key
HEDERA_ACCOUNT_ID=0.0.123456
HEDERA_PRIVATE_KEY=302...

# For browser projects using WalletConnect
WALLETCONNECT_PROJECT_ID=your_project_id
```

### 2. Choose Your Integration Method

#### A. Browser Apps with WalletConnect (Recommended)

This method lets users connect their existing Hedera wallet (like HashPack):

1. Install dependencies:

```bash
npm install @kiloscribe/inscription-sdk @hashgraphonline/hashinal-wc @hashgraph/sdk
```

2. Create your app:

```typescript
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import { LedgerId } from '@hashgraph/sdk';

// Initialize SDKs
const wallet = new HashinalsWalletConnectSDK();
const sdk = new InscriptionSDK({
  apiKey: process.env.API_KEY,
  network: 'testnet',
});

// Connect wallet (shows QR code or deep links to wallet)
const { accountId } = await wallet.connectWallet(
  process.env.WALLETCONNECT_PROJECT_ID,
  {
    name: 'My dApp',
    description: 'Example dApp',
    url: window.location.origin,
    icons: ['https://my-dapp.com/icon.png'],
  },
  LedgerId.TESTNET
);

// Get signer for the connected account
const dAppSigner = wallet.dAppConnector.signers.find(
  (signer) => signer.getAccountId().toString() === accountId
)!;

// Create an inscription
const result = await sdk.inscribe(
  {
    file: {
      type: 'base64',
      base64: 'your_base64_data',
      fileName: 'example.png',
      mimeType: 'image/png',
    },
    holderId: accountId,
    mode: 'file', // or 'hashinal' for NFTs
    network: 'testnet',
    description: 'Example inscription',
  },
  dAppSigner
);

// Wait for inscription to complete
const complete = await sdk.waitForInscription(
  result.jobId,
  30, // max attempts
  4000, // interval in ms
  true // check for completion status
);

console.log('Inscription complete:', {
  topic_id: complete.topic_id,
  status: complete.status,
});
```

## B. Loading via HCS-3 Recursion

Load the SDK directly from the Hedera Hashgraph using HCS-3 recursion:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Inscription SDK Demo</title>

    <script
      data-hcs-config
      data-hcs-cdn-url="https://kiloscribe.com/api/inscription-cdn/"
      data-hcs-network="mainnet"
      data-hcs-debug="true"
      data-hcs-retry-attempts="5"
      data-hcs-retry-backoff="500"
    ></script>

    <script
      data-src="hcs://1/0.0.8084872"
      data-script-id="wallet-connect"
      data-load-order="1"
    ></script>

    <script
      data-src="hcs://1/0.0.8084856"
      data-script-id="inscription-sdk"
      data-load-order="2"
    ></script>

    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        margin: 0;
        padding: 20px;
        background: #f5f5f5;
      }

      .container {
        max-width: 800px;
        margin: 0 auto;
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        margin-bottom: 10px;
        margin-top: 10px;
      }

      h1 {
        color: #333;
        text-align: center;
      }

      .upload-section {
        display: flex;
        gap: 10px;
        margin: 20px 0;
      }

      button {
        background: #2563eb;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
      }

      button:disabled {
        background: #94a3b8;
        cursor: not-allowed;
      }

      button:hover:not(:disabled) {
        background: #1d4ed8;
      }

      .status {
        margin: 20px 0;
        padding: 10px;
        border-radius: 4px;
      }

      .status.error {
        background: #fee2e2;
        color: #b91c1c;
      }

      .status.success {
        background: #dcfce7;
        color: #15803d;
      }

      .preview {
        margin: 20px 0;
        text-align: center;
      }

      .preview img {
        max-width: 100%;
        max-height: 400px;
        border-radius: 4px;
      }
    </style>
  </head>
  <body>
    <h1>Inscription SDK Demo</h1>

    <div class="container">
      <button id="connectWallet">Connect Wallet</button>
      <button id="disconnectWallet" style="display: none">Disconnect</button>
      <div id="accountInfo"></div>
    </div>

    <div class="container">
      <h2>Create Inscription</h2>
      <input type="file" id="fileInput" accept="image/*" />
      <button id="inscribeBtn" disabled>Inscribe File</button>
      <div id="inscriptionStatus"></div>
    </div>

    <script>
      // Initialize after HCS loads
      window.HCSReady = async () => {
        const hbarSDK = window.HashgraphSDK;
        const ledger = hbarSDK.LedgerId.TESTNET;
        const PROJECT_ID = 'bfd9ad3ea26e2c73eb21e8f9c750c166'; // Get from WalletConnect Dashboard
        const APP_METADATA = {
          name: 'Inscription SDK Demo',
          description: 'Demo app showing inscription creation and querying',
          url: window.location.origin,
          icons: ['https://kiloscribe.com/icon.png'],
        };

        // Get SDK instances
        const wcSDK = window.HashinalsWalletConnectSDK;
        let inscriptionSDK;
        let currentAccountId;

        // UI elements
        const connectBtn = document.getElementById('connectWallet');
        const disconnectBtn = document.getElementById('disconnectWallet');
        const accountInfo = document.getElementById('accountInfo');
        const inscribeBtn = document.getElementById('inscribeBtn');
        const inscriptionStatus = document.getElementById('inscriptionStatus');
        const queryResults = document.getElementById('queryResults');

        // UI update helper
        function updateUI(accountId, balance) {
          currentAccountId = accountId;

          if (accountId) {
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'block';
            inscribeBtn.disabled = false;

            accountInfo.innerHTML = `
              Connected Account: ${accountId}<br>
              Balance: ${balance} HBAR
            `;

            // Initialize inscription SDK
            inscriptionSDK = new window.InscriptionSDK({
              apiKey: 'YOUR_API_KEY', // Get from Kiloscribe Dashboard
              network: 'testnet',
            });
          } else {
            connectBtn.style.display = 'block';
            disconnectBtn.style.display = 'none';
            inscribeBtn.disabled = true;
            accountInfo.innerHTML = '';
            currentAccountId = null;
          }
        }

        // Check for existing connection
        const accountResponse = await wcSDK.initAccount(
          PROJECT_ID,
          APP_METADATA,
          ledger
        );
        if (accountResponse && accountResponse.accountId) {
          updateUI(accountResponse.accountId, accountResponse.balance);
        }

        // Connect wallet
        connectBtn.addEventListener('click', async () => {
          try {
            const { accountId, balance } = await wcSDK.connectWallet(
              PROJECT_ID,
              APP_METADATA,
              ledger
            );
            updateUI(accountId, balance);
          } catch (error) {
            console.error('Connection failed:', error);
            alert('Failed to connect wallet');
          }
        });

        // Disconnect wallet
        disconnectBtn.addEventListener('click', async () => {
          try {
            await wcSDK.disconnectWallet();
            updateUI(null, null);
          } catch (error) {
            console.error('Disconnect failed:', error);
          }
        });

        // Handle file inscription
        inscribeBtn.addEventListener('click', async () => {
          const fileInput = document.getElementById('fileInput');
          const file = fileInput.files[0];
          if (!file) {
            alert('Please select a file first');
            return;
          }

          try {
            inscriptionStatus.textContent = 'Reading file...';

            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (e) => {
              const base64Data = e.target.result.split(',')[1];

              try {
                inscriptionStatus.textContent = 'Starting inscription...';

                const signer = wcSDK.dAppConnector.signers.find((signer) => {
                  return signer.getAccountId().toString() === currentAccountId;
                });

                // Start inscription
                const result = await inscriptionSDK.inscribe(
                  {
                    file: {
                      type: 'base64',
                      base64: base64Data,
                      fileName: file.name,
                    },
                    holderId: currentAccountId,
                    mode: 'hashinal',
                    metadataObject: {
                      name: 'Example NFT',
                      description: 'This is an example NFT',
                      attributes: [
                        {
                          trait_type: 'Example Trait',
                          value: 'Example Value',
                        },
                      ],
                    },
                  },
                  signer
                );

                inscriptionStatus.textContent = `Inscription started! Transaction ID: ${result.transactionId}`;

                // Poll for completion
                const checkStatus = async () => {
                  const status = await inscriptionSDK.retrieveInscription(
                    result.jobId
                  );
                  inscriptionStatus.textContent = `Status: ${status.status}`;

                  if (
                    status.status !== 'completed' &&
                    status.status !== 'failed'
                  ) {
                    setTimeout(checkStatus, 2000);
                  }
                };

                checkStatus();
              } catch (error) {
                inscriptionStatus.textContent = `Inscription failed: ${error.message}`;
              }
            };

            reader.readAsDataURL(file);
          } catch (error) {
            inscriptionStatus.textContent = `Error: ${error.message}`;
          }
        });
      };
    </script>
  </body>
</html>
```

#### C. Node.js Apps with Private Key

This method is for backend services or scripts:

1. Install dependencies:

```bash
npm install @kiloscribe/inscription-sdk @hashgraph/sdk
```

2. Create your script:

```typescript
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import * as fs from 'fs';

const sdk = new InscriptionSDK({
  apiKey: process.env.API_KEY,
  network: process.env.HEDERA_NETWORK,
});

// Read a file
const file = fs.readFileSync('path/to/file.png');
const base64 = file.toString('base64');

// Create an inscription
const result = await sdk.inscribeAndExecute(
  {
    file: {
      type: 'base64',
      base64,
      fileName: 'example.png',
      mimeType: 'image/png',
    },
    holderId: process.env.HEDERA_ACCOUNT_ID,
    mode: 'file',
    network: process.env.HEDERA_NETWORK,
    description: 'Example inscription',
  },
  {
    accountId: process.env.HEDERA_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY,
    network: process.env.HEDERA_NETWORK,
  }
);
```

## Creating Different Types of Inscriptions

### 1. Basic File Inscription

Upload any supported file type:

```typescript
// retrieve dAppConnector from hedera-wallet-connect

const dAppSigner = dAppConnector.signers.find((signer) => {
  return signer.getAccountId().toString() === accountId;
});
const result = await sdk.inscribe(
  {
    file: {
      type: 'base64',
      base64: 'your_base64_data',
      fileName: 'example.png',
      mimeType: 'image/png',
    },
    holderId: accountId,
    mode: 'file',
    network: 'testnet',
    description: 'My first inscription',
  },
  dAppSigner // or use inscribeAndExecute with private key
);
```

### 2. Hashinal NFT

Create an NFT with metadata:

```typescript
async function inscribeHashinal() {
  const sdk = new InscriptionSDK({
    apiKey: process.env.KILOSCRIBE_API_KEY,
    network: 'testnet',
  });

  const imagePath = join(__dirname, 'assets', 'example.webp');
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  try {
    const result = await sdk.inscribeAndExecute(
      {
        file: {
          type: 'base64',
          base64: base64Image,
          fileName: 'example.webp',
          mimeType: 'image/webp',
        },
        holderId: '0.0.123456',
        mode: 'hashinal',
        network: 'testnet',
        description: 'Example hashinal inscription',
        metadataObject: {
          name: 'Example NFT',
          description: 'This is an example NFT',
          attributes: [
            {
              trait_type: 'Example Trait',
              value: 'Example Value',
            },
          ],
        },
      },
      {
        accountId: '0.0.123456',
        privateKey: process.env.HEDERA_ACCOUNT_PRIVATE_KEY!,
        network: 'testnet',
      }
    );

    console.log('Inscription completed:', result);

    // You can also retrieve the inscription status
    const status = await sdk.retrieveInscription(result.jobId);
    console.log('Inscription status:', status);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

// Run the example
inscribeHashinal().catch(console.error);
```

### 3. URL Inscription

Inscribe a file from a URL:

```typescript
const result = await sdk.inscribe(
  {
    file: {
      type: 'url',
      url: 'https://example.com/image.png',
    },
    holderId: accountId,
    mode: 'file',
    network: 'testnet',
    description: 'URL inscription',
  },
  dAppSigner
);
```

## Querying Inscriptions

### Get Inscriptions

You can fetch inscriptions by their sequence numbers:

```typescript
// Get inscription details by sequence number
const inscriptions = await sdk.getInscriptionNumbers({
  inscriptionNumber: 1234, // Optional: specific inscription number
  sort: 'desc', // Optional: 'asc' or 'desc'
  limit: 10, // Optional: max results to return
});

console.log(inscriptions);
```

### Get Holder Inscriptions

You can fetch all inscriptions owned by a specific holder:

```typescript
// Get all inscriptions for a specific holder
const holderInscriptions = await sdk.getHolderInscriptions({
  holderId: '0.0.123456', // Required: Hedera account ID of the holder
  includeCollections: true, // Optional: Include collection inscriptions
});

console.log(`Found ${holderInscriptions.length} inscriptions`);

// Access individual inscription details
holderInscriptions.forEach((inscription) => {
  console.log(`ID: ${inscription.id}`);
  console.log(`Status: ${inscription.status}`);
  console.log(`File URL: ${inscription.fileUrl}`);
  console.log(`Topic ID: ${inscription.topic_id}`);
});
```

## Checking Inscription Status

The SDK provides two methods for checking inscription status:

### 1. Simple Status Check

```typescript
const status = await sdk.retrieveInscription(result.jobId);
console.log('Status:', status.status);
```

### 2. Wait for Completion

The `waitForInscription` method will poll until the inscription meets completion criteria:

```typescript
const complete = await sdk.waitForInscription(
  result.jobId,
  30, // max attempts (optional, default: 30)
  4000, // interval in ms (optional, default: 4000)
  true // check completion status (optional, default: false)
);
```

Completion criteria varies by inscription type:

- Regular files: Need `topic_id`
- Hashinal NFTs: Need both `topic_id` and `jsonTopicId`
- Dynamic files (HCS-6): Need `topic_id`, `jsonTopicId`, and `registryTopicId`

If `checkCompletion` is true, also verifies `status === 'completed'`.

## Examples

### Vanilla JavaScript Demo

A minimal example using vanilla JavaScript and HCS-3 recursion is available in the `demo/vanilla` directory.

See the full example in `demo/vanilla/index.html` for wallet integration and inscription querying.

## Try the Interactive Demo

We've included a complete demo app in the `demo` directory that shows:

- Wallet connection with QR code
- File selection with preview
- Inscription creation
- Status updates

To run it:

1. Clone the repository:

```bash
git clone https://github.com/kiloscribe/inscription-sdk.git
cd inscription-sdk
```

2. Set up the demo:

```bash
cd demo
npm install
cp .env.example .env
```

3. Configure the demo:
   Edit `.env` and add:

- Your Kiloscribe API key
- Your WalletConnect Project ID

4. Start the demo:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) and try it out!

## File Support

### Size Limits

- URL files: Up to 100MB
- Base64/Local files: Up to 2MB

### Supported Formats

- Images: jpg, jpeg, png, gif, bmp, webp, tiff, svg
- Video: mp4, webm
- Audio: mp3
- Documents: pdf, doc, docx, xls, xlsx, ppt, pptx
- Web: html, css, js
- Data: csv, json, txt
- 3D: glb

## Common Issues

### 1. "Account ID not found"

- Make sure you're using the correct Account ID format (0.0.123456)
- Check if you're on the right network (testnet/mainnet)

### 2. "Transaction failed"

- Ensure your account has enough HBAR (at least 1 HBAR recommended)
- Check if your private key matches your account ID
- Verify you're using the correct network

### 3. "File too large"

- URL inscriptions: Max 100MB
- Base64/Local files: Max 2MB
- Try compressing your file or using a URL instead

### 4. WalletConnect Issues

- Ensure your wallet (e.g., HashPack) is installed and on the correct network
- Check if your WalletConnect Project ID is correct
- Try clearing your browser cache

## Error Handling

Always wrap SDK calls in try-catch:

```typescript
try {
  const result = await sdk.inscribe(config, signer);
  console.log('Inscription started:', result.jobId);

  // Poll for status
  const checkStatus = async () => {
    const status = await sdk.retrieveInscription(result.jobId);
    console.log('Status:', status.status);

    if (status.status !== 'completed' && status.status !== 'failed') {
      setTimeout(checkStatus, 2000); // Check every 2 seconds
    }
  };

  checkStatus();
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
}
```

## Support

Need help? We've got you covered:

- [GitHub Issues](https://github.com/kiloscribe/inscription-sdk/issues) - Bug reports and feature requests
- [Documentation](https://docs.kiloscribe.com) - Full API documentation
- [Discord](https://discord.gg/kiloscribe) - Community support
- [Twitter](https://twitter.com/kiloscribe) - Updates and announcements

## License

Apache-2.0