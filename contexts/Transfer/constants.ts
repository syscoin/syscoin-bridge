export const BlockbookAPIURL = "https://blockbook.syscoin.org/";

export const NEVMNetwork = {
  chainId: "0x39",
  chainName: "Syscoin NEVM",
  nativeCurrency: {
    name: "Syscoin",
    symbol: "SYS",
    decimals: 18,
  },
  rpcUrls: [process.env.NEVM_RPC_URL!],
  blockExplorerUrls: ["https://explorer.syscoin.org/"],
};
