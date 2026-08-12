declare module "syscoinjs-lib" {
  interface SPVProof {
    transaction: string;
    /** Witness-stripped coinbase hex for same-depth Merkle checks */
    coinbase: string;
    blockhash: string;
    header: string;
    siblings: string[];
    index: number;
    nevm_blockhash: string;
    chainlock: boolean;
  }
  interface Network {
    messagePrefix: string;
    bech32: string;
    bip32: {
      public: number;
      private: number;
    };
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
  }

  export interface UTXOTransaction {
    psbt: Psbt;
    assets: string;
  }

  class syscoin {
    constructor(p1, blockbookAPIURL: string, network: Network): syscoin;
    readonly blockbookURL: string;
    createTransaction(
      txOpts,
      changeAddress,
      outputsArr,
      feeRate,
      fromXpubOrAddress?,
      utxos?,
      redeemOrWitnessScript?,
      inputsArr?
    ): Promise<{ psbt; res; fee }>;
    signAndSendWithWIF(psbt, wif: string): Promise<any>;
    syscoinBurnToAssetAllocation(
      txOpts,
      assetMap,
      sysChangeAddress,
      feeRate,
      sysFromXpubOrAddress,
      redeemOrWitnessScript?
    ): Promise<{ psbt; assets }>;
    assetAllocationBurn(
      txOpts,
      assetMap,
      sysChangeAddress,
      feeRate,
      sysFromXpubOrAddress,
      utxos,
      redeemOrWitnessScript?
    ): Promise<{ psbt; assets }>;
    assetAllocationMint(
      assetOpts,
      txOpts,
      assetMap,
      sysChangeAddress,
      feeRate,
      sysFromXpubOrAddress,
      utxos?,
      redeemOrWitnessScript?
    ): Promise<{ psbt; assets }>;
  }
  declare module utils {
    export const BN: any;
    export const bitcoinjs: any;
    export function exportPsbtToJson(psbt: Psbt, assets): UTXOTransaction;
    export function importPsbtFromJson(jsonData, network): UTXOTransaction;
    export function signWithWIF(psbt, wif: string, network): Promise<any>;
    export function sendRawTransaction(
      backendUrl: string,
      rawTransaction: string
    ): Promise<{ result?: string; error?: unknown }>;
    export interface BlockbookTransactionBTC {
      txid: string;
      version: number;
      vin: TxBTCVin[];
      vout: TxBTCVout[];
      blockHash: string;
      blockHeight: number;
      confirmations: number;
      blockTime: number;
      value: string;
      valueIn: string;
      fees: string;
      hex: string;
    }
    export function fetchBackendSPVProof(
      blockbookAPIURL: string,
      txId: string
    ): Promise<any>;
    export function fetchBackendRawTx(
      backendUrl: string,
      txid: string
    ): Promise<BlockbookTransactionBTC & { tokenType: string }>;

    export const syscoinNetworks: {
      mainnet: Network;
      testnet: Network;
    };
  }
}

declare module "bitcoin-proof" {
  export function getProof(
    txIds: string[],
    txIndex: number
  ): { txId: string; txIndex: number; sibling: string[] };
}
