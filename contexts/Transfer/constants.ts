import { utils as syscoinUtils } from "syscoinjs-lib";
export const SYSX_ASSET_GUID = "123456";
const isTestnet = process.env.NEXT_PUBLIC_IS_TESTNET === "true";
export const BlockbookAPIURL = process.env.NEXT_PUBLIC_BLOCKBOOK_API_URL;

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
  rpcUrls: [process.env.NEXT_PUBLIC_NEVM_RPC_URL!],
  blockExplorerUrls: [process.env.NEXT_PUBLIC_NEVM_EXPLORER_URL],
};
