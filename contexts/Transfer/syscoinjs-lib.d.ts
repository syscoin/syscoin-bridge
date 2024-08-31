declare module "syscoinjs-lib" {
  interface SPVProof {
    transaction: string;
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
  }

  class syscoin {
    constructor(p1, blockbookAPIURL: string, network: Network): syscoin;
    createTransaction(
      txOpts,
      sysChangeAddress,
      outputsArr,
      feeRate,
      xpubAddress
    ): Promise<{ psbt }>;
    sysMintFromNEVM(
      txOpts,
      sysChangeAddress,
      feeRate,
      xpubAddress
    ): Promise<{ psbt }>;
  }
  declare module utils {
    export const BN: any;
    export function exportPsbtToJson(psbt: Psbt): UTXOTransaction;
    export function importPsbtFromJson(jsonData, network): UTXOTransaction;
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
    ): Promise<BlockbookTransactionBTC>;

    export const syscoinNetworks: {
      mainnet: Network;
    };
  }
}

declare module "satoshi-bitcoin" {
  export function toSatoshi(amount: number | string): number;
  export function toBitcoin(amount: number | string): number;
}

declare module "bitcoin-proof" {
  export function getProof(
    txIds: string[],
    txIndex: number
  ): { txId: string; txIndex: number; sibling: string[] };
}
