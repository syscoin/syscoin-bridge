# Syscoin Bridge

This project is a bridge between Syscoin UTXO and Syscoin NEVM. It allows Syscoin assets to be moved to Syscoin NEVM and back.

https://bridge.syscoin.org/

> Trustless transfer of SYS back and forth between the Syscoin UTXO and Syscoin NEVM blockchains without middlemen !

## Screenshots

![Home Page](./docs/home.png)
![UTXO to NEVM](./docs/utxo-to-nevm.png)
![NEVM to UTXO](./docs/nevm-to-utxo.png)

## How it works

### UTXO to NEVM

1. User burns SYS to create SYS on the Syscoin UTXO chain by via `syscoinBurnToAssetAllocation` RPC call.
2. User burns SYSX to create SYS on the Syscoin NEVM chain by via `assetAllocationBurn` RPC call and specifying the NEVM address which receives the SYS on NEVM chain.
3. Once both transactions are mined, the user can now use the transaction data to build a SPV proof `fetchBackendSPVProof` . This proof is then send to a Smart Contract on Syscoin NEVM chain.
4. The Smart Contract verifies the SPV proof and if valid, mints SYS on the Syscoin NEVM chain to the address indicated on the SPV proof.

### NEVM to UTXO

1. User freezes and Burn their SYS by calling on the `SyscoinERC20Manager` contract `freezeBurnERC20` function.
2. Once the transaction is mined, the user can now use the transaction data to mint SYSX asset on UTXO chain by calling `assetAllocationMint` RPC call.
3. Once SYSX is minted, this again can be burned using `assetAllocationBurn` to get native SYS on UTXO.

### Bridge UI

The bridge UI is a ReactJS application that allows users to interact with the bridge. It is a NextJS application that uses Mongodb for storage. This allows users to interact with the bridge without having to install any software.

Each step taken on the Bridge is stored in MongoDB. This allows the user to resume the process at any time.

### Sponsored Claim Gas

When `FOUNDATION_FUNDED=true`, the bridge can sponsor only the destination-side gas needed to complete receipt of bridged SYS. Users still sign and pay the source-chain transaction.

- `sys-to-nevm`: the configured NEVM sponsor wallet signs the final NEVM `submit-proofs` transaction, so the destination NEVM address does not need pre-existing gas to receive SYS.
- `nevm-to-sys`: after the NEVM `freezeBurn` transaction is confirmed, the bridge can fund a minimal UTXO SYS amount to the destination Syscoin address so the user can complete the UTXO claim/release steps.

UTXO sponsorship reserves individual sponsor outputs by `txid:vout` in MongoDB before signing. Pre-split the UTXO sponsor wallet into multiple small outputs to allow multiple users to be funded concurrently. If every sponsor output is already reserved or spent, new claim-gas requests fail safely and can be retried later.

Sponsorship is rate-limited by client IP, destination UTXO address, and source NEVM address. It is also idempotent per transfer/action, so refreshing a transfer does not repeatedly drain sponsor funds.

Sponsor signing keys are configured through deployment secrets/env vars. MongoDB stores sponsorship usage, reservations, and rate-limit state only; it does not store sponsor private keys.

NEVM sponsorship is server-broadcast: the backend durably stores each signed
transaction, broadcasts it in nonce order, and returns only the accepted hash
to the browser. Pending raw transactions are replayed by later requests before
another nonce is signed.

#### Foundation-funded V2 cutover

Treat enabling `FOUNDATION_FUNDED=true` as an atomic V2 backend cutover:

1. Keep funding disabled while all pre-V2/older backend instances are stopped.
2. Configure `NEVM_V2_ACTIVATION_BLOCK` to the immutable first NEVM block
   eligible for V2 claim-gas sponsorship. Funding fails closed if it is missing
   or invalid.
3. Reconcile every legacy signed sponsor row that lacks `action` or
   `sourceTxHash`. Confirm/broadcast or replace its nonce as appropriate, then
   archive the row; do not copy it into the V2 sponsor namespace.
4. Reconcile duplicate historical transfer IDs. Startup checks for duplicates
   and synchronously creates the unique transfer-ID index before serving public
   writes.
5. Deploy the V2 backend and frontend together to every instance and allow its
   MongoDB indexes to be created. New transfers receive a per-transfer write
   capability; pre-cutover rows without one are intentionally read-only through
   the public API.
6. Enable foundation funding only after all instances run the same V2 sponsor
   protocol.

Startup fails closed when foundation funding is enabled while an unreconciled
legacy signed row remains. A rolling deployment with old sponsor-signing
instances is unsupported.

## How to run

### Prerequisites

- NodeJS 24+ (recommended to use `nvm` to install NodeJS)
- Yarn (recommended to use `npm install -g yarn` to install Yarn)

### Node Version Management with nvm

This project uses Node.js v24. We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage Node versions:

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash

# Restart your terminal or run:
source ~/.bashrc  # or ~/.zshrc

# Install and use the correct Node version (reads from .nvmrc)
nvm install
nvm use

# Or manually install Node v24
nvm install 24
nvm use 24
```

### Install dependencies

```bash
yarn install
```

### Run Dev Server

Runs NextJS Dev Server on port `3000`

```bash
yarn dev
```

## Production Deployment

### Production Build

```bash
yarn build
```

### Production Docker

```bash
docker build -t syscoin/bridge .
```

### Environment Variables (for Production Docker)

| Name                            | Description                                    | Default |
| ------------------------------- | ---------------------------------------------- | ------- |
| `MONGODB_URI`                   | MongoDB URI                                    |         |
| `CONFIRM_TRANSACTION_TIMEOUTS`  | Transaction confirmation timeout               |         |
| `MINIMUM_AMOUNT`                | Minimum amount of SYS to transfer              | 100     |
| `ADMIN_API_KEY`                 | Admin API Key                                  |         |
| `SECRET_COOKIE_PASSWORD`        | Secret Cookie Password                         |         |
| `ADMIN_COOKIE_DOMAIN`           | Optional domain for admin session cookie       |         |
| `NEVM_RPC_URL`                  | NEVM RPC URL                                   |         |
| `NEVM_EXPLORER`                 | NEVM Explorer URL                              |         |
| `NEVM_API_URL`                  | NEVM Block Explorer API URL (EVM only)        |         |
| `UTXO_RPC_URL`                  | UTXO RPC URL                                   |         |
| `UTXO_EXPLORER`                 | UTXO Explorer URL                              |         |
| `IS_TESTNET`                    | Is Testnet                                     |         |
| `CHAIN_ID`                      | Chain ID                                       |         |
| `RELAY_CONTRACT_ADDRESS`        | Relay contract address                         |         |
| `ERC20_MANAGER_CONTRACT_ADDRESS`| ERC20 Manager contract address                 |         |
| `SYS5_ENABLED`                  | Enable Sys5 features                           | true    |
| `PALI_V2_NEVM_ENABLED`          | Enable Pali V2 NEVM features                    | true    |
| `FOUNDATION_FUNDED`             | Enable sponsored claim gas for destination-side bridge completion | false   |
| `NEVM_V2_ACTIVATION_BLOCK`      | First NEVM block eligible for V2 foundation-funded claim gas; required when funding is enabled |         |
| `NEVM_SPONSOR_PRIVATE_KEY`      | Private key for the NEVM sponsor wallet used to sign sponsored `submit-proofs` transactions |         |
| `UTXO_SPONSOR_ADDRESS`          | Syscoin UTXO sponsor address used for NEVM-to-UTXO claim gas funding |         |
| `UTXO_SPONSOR_WIF`              | WIF private key for the UTXO sponsor address    |         |
| `UTXO_SPONSOR_CLAIM_GAS_AMOUNT_SYS` | Minimal SYS amount funded to empty UTXO destinations for claim gas | 0.001   |
| `SPONSOR_IP_RATE_LIMIT`         | Max claim-gas sponsorship attempts per client IP per window | 20      |
| `SPONSOR_ADDRESS_RATE_LIMIT`    | Max claim-gas sponsorship attempts per UTXO/NEVM address per window | 3       |
| `SPONSOR_RATE_LIMIT_WINDOW_MS`  | Sponsorship rate-limit window in milliseconds   | 86400000 |
| `SPONSOR_TRUST_PROXY_HEADERS`   | Trust `x-real-ip`/`x-forwarded-for` for sponsor IP limits only when a trusted proxy overwrites them | false   |
| `NEXT_PUBLIC_API_BASE_URL`      | Base URL the frontend uses for API requests    |         |
| `CORS_ALLOWED_ORIGIN`           | Allowed frontend origin(s) for API CORS responses (comma-separated, no `*` for admin cookie auth) |         |

**Note**: API URLs are only used for EVM networks. UTXO networks use Blockbook which has a different API structure.

### Split Frontend/Backend Deployments

When hosting the frontend separately from the backend services, set `NEXT_PUBLIC_API_BASE_URL` to the backend origin (for example, `https://backend.test.com`). All browser and server-side fetches automatically use that base URL when provided, and fall back to the current origin otherwise. The same variable also enables a framework rewrite so hitting `/api/*` on the frontend domain proxies to the backend. This lets a single build work for both combined and split deployments—just omit the variable when the API routes run alongside the frontend.

### Env Files

Next.js automatically loads `.env.local` and `.env` (and env-specific files like `.env.production`).
So a production build will pick up `.env.local` if it exists in the project root.

## Contact

### Developers

- [Ted](https://github.com/osiastedian)

### Channels

- [Discord](https://discord.gg/RkK2AXD)
- [Telegram](https://t.me/Syscoin_Official)
- [Twitter](https://twitter.com/syscoin)
- [Facebook](https://www.facebook.com/Syscoin/)
- [Reddit](https://www.reddit.com/r/SysCoin/)
- [LinkedIn](https://www.linkedin.com/company/syscoin/)
