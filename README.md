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

The bridge UI is a ReactJS application that allows users to interact with the bridge. It is a NextJS application that uses Firebase for authentication and storage. This allows users to interact with the bridge without having to install any software.

Each step taken on the Bridge is stored in Firebase Firestore. This allows the user to resume the process at any time.

## How to run

### Prerequisites

- NodeJS 16+ (recommneded to use `nvm` to install NodeJS)
- Firebase Emulator (recommended to use `npm install -g firebase-tools` to install Firebase Emulator)
- Yarn (recommended to use `npm install -g yarn` to install Yarn)

### Install dependencies

```bash
yarn install
```

### Run Firebase Emulator

Runs Firebase Emulator on port `4000`

```bash
yarn firebase:dev
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

| Name                           | Description                  | Default |
| ------------------------------ | ---------------------------- | ------- |
| `FIREBASE_API_KEY`             | Firebase API Key             | `""`    |
| `FIREBASE_AUTH_DOMAIN`         | Firebase Auth Domain         | `""`    |
| `FIREBASE_PROJECT_ID`          | Firebase Project ID          | `""`    |
| `FIREBASE_STORAGE_BUCKET`      | Firebase Storage Bucket      | `""`    |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `""`    |
| `FIREBASE_APP_ID`              | Firebase App ID              | `""`    |
| `FIREBASE_MEASUREMENT_ID`      | Firebase Measurement ID      | `""`    |
| `FIREBASE_AUTH_EMAIL`          | Firebase Auth Email          | `""`    |
| `FIREBASE_AUTH_PASSWORD`       | Firebase Auth Password       | `""`    |
| `FIREBASE_AUTH_UID`            | Firebase Auth UID            | `""`    |

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
