import { utils as syscoinUtils } from "syscoinjs-lib";
export const SYSX_ASSET_GUID = "123456";
const isTestnet = process.env.NEXT_PUBLIC_IS_TESTNET === "true";
export const BlockbookAPIURL = isTestnet
  ? "https://blockbook-dev.syscoin.org"
  : "https://blockbook.syscoin.org";

export const UTXO_NETWORK = isTestnet
  ? syscoinUtils.syscoinNetworks.testnet
  : syscoinUtils.syscoinNetworks.mainnet;

export const NEVMNetwork = {
  chainId: isTestnet ? "0x1644" : "0x39",
  chainName: "Syscoin NEVM",
  nativeCurrency: {
    name: "Syscoin",
    symbol: isTestnet ? "TSYS" : "SYS",
    decimals: 18,
  },
  rpcUrls: [process.env.NEVM_RPC_URL!],
  blockExplorerUrls: [process.env.NEXT_PUBLIC_NEVM_EXPLORER],
};
