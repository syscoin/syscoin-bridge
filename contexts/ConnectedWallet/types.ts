export type UTXOWallet = "pali-wallet";

export type NEVMWallet = "metamask" | "pali-wallet";

export interface UTXOInfo {
  type: UTXOWallet;
  account: string;
  xpub: string;
  balance: number | undefined;
}

export interface NEVMInfo {
  type: NEVMWallet;
  account: string;
  balance: string | undefined;
}
