# Pali Wallet Integration Guide

## External RPC Support

When the Syscoin Bridge needs to add a custom network to Pali wallet, it uses the `wallet_addEthereumChain` method. This document describes the recent improvements to this integration.

### Network Configuration

When calling `wallet_addEthereumChain`, the bridge uses the standard EIP-3085 format:

```typescript
interface ChainConfig {
  chainId: string;           // Hex-encoded chain ID (e.g., "0x39")
  chainName: string;         // Network name (e.g., "Syscoin NEVM")
  nativeCurrency: {
    name: string;            // Currency name (e.g., "Syscoin")
    symbol: string;          // Currency symbol (e.g., "SYS")
    decimals: number;        // Currency decimals (e.g., 18)
  };
  rpcUrls: string[];         // Array of RPC URLs
  blockExplorerUrls: string[];  // Array of block explorer URLs
  apiUrl?: string;           // Pali extension: Block explorer API URL (EVM only)
}
```

### API URL Field

The `apiUrl` field is a Pali wallet extension that enables enhanced features for **EVM networks only**:

- **Enhanced Transaction History**: Fetch detailed transaction data from block explorer APIs
- **Token Detection**: Automatically detect and display tokens owned by the user
- **Gas Estimation**: More accurate gas price estimates using real-time data
- **Transaction Status**: Real-time transaction confirmation tracking

**Important**: API URLs are only used for EVM networks. UTXO networks use Blockbook which has a different API structure and don't require separate API URLs.

### Field Mapping

Pali wallet internally converts EIP-3085 format to its own INetwork format:

| EIP-3085 Field | Pali INetwork Field |
|----------------|-------------------|
| `chainName` | `label` |
| `rpcUrls[0]` | `url` |
| `blockExplorerUrls[0]` | `explorer` |
| `nativeCurrency.symbol` | `currency` |
| `apiUrl` | `apiUrl` (EVM only) |

### Environment Variables

The bridge now supports these environment variables:

```bash
# NEVM Configuration (EVM)
NEVM_RPC_URL=https://rpc.syscoin.org
NEVM_EXPLORER=https://explorer.syscoin.org
NEVM_API_URL=https://explorer.syscoin.org/api  # EVM only

# UTXO Configuration (no API URL needed)
UTXO_RPC_URL=https://blockbook.syscoin.org
UTXO_EXPLORER=https://blockbook.syscoin.org
```

### Implementation Example

```typescript
// When switching to mainnet
const networkParams = {
  chainId: "0x39",
  chainName: "Syscoin NEVM",
  nativeCurrency: {
    name: "Syscoin",
    symbol: "SYS",
    decimals: 18
  },
  rpcUrls: ["https://rpc.syscoin.org"],
  blockExplorerUrls: ["https://explorer.syscoin.org"],
  apiUrl: "https://explorer.syscoin.org/api"  // Only for EVM networks
};

window.ethereum.request({
  method: "wallet_addEthereumChain",
  params: [networkParams]
});
```

### What Happens in Pali

1. **Format Conversion**: EIP-3085 format is converted to Pali's INetwork format
2. **RPC Validation**: Pali tests the RPC connection before adding the network
3. **Chain ID Verification**: Ensures the RPC reports the expected chain ID
4. **API URL Testing**: If provided (EVM only), tests the API URL accessibility
5. **Network Addition**: Only adds the network if all validations pass

### Error Handling

The external RPC component now provides better error messages:
- RPC connection failures
- Chain ID mismatches
- API URL validation errors (EVM only)
- Rate limiting detection

### Benefits

1. **Better UX**: Users see validation progress and clear error messages
2. **Reliability**: Networks are only added if they actually work
3. **Enhanced Features**: API URLs enable richer wallet functionality for EVM networks
4. **Consistency**: External RPCs behave the same as manually added custom RPCs
5. **Protocol Compliance**: Uses standard EIP-3085 format with Pali extensions 