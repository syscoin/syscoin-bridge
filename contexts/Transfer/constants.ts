import { NEVM_EXPLORER_URL, NEVM_RPC_URL } from "@constants";

export const SYSX_ASSET_GUID = "123456";
export const BlockbookAPIURL = "https://blockbook.elint.services/";

export const NEVMNetwork = {
  chainId: "0x39",
  chainName: "Syscoin NEVM",
  nativeCurrency: {
    name: "Syscoin",
    symbol: "SYS",
    decimals: 18,
  },
  rpcUrls: [NEVM_RPC_URL],
  blockExplorerUrls: [NEVM_EXPLORER_URL],
};
