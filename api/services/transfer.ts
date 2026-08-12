import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import TransferModel from "models/transfer";
import { createHash, timingSafeEqual } from "crypto";
import { SponsorWalletService } from "./sponsor-wallet";

export class TransferWriteUnauthorizedError extends Error {
  constructor() {
    super("Transfer write is not authorized");
    this.name = "TransferWriteUnauthorizedError";
    Object.setPrototypeOf(this, TransferWriteUnauthorizedError.prototype);
  }
}

export class TransferNotFoundError extends Error {
  constructor() {
    super("Transfer not found");
    this.name = "TransferNotFoundError";
    Object.setPrototypeOf(this, TransferNotFoundError.prototype);
  }
}

type TransferWriteResult = {
  transfer: ITransfer;
};

const hashWriteToken = (writeToken: string) =>
  createHash("sha256").update(writeToken, "utf8").digest("hex");

const writeTokenMatches = (writeToken: string, expectedHash: string) => {
  const actual = Uint8Array.from(
    Buffer.from(hashWriteToken(writeToken), "hex")
  );
  const expected = Uint8Array.from(Buffer.from(expectedHash, "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const toTransferUpdate = (transfer: ITransfer) => ({
  type: transfer.type,
  status: transfer.status,
  logs: transfer.logs,
  utxoAddress: transfer.utxoAddress,
  utxoXpub: transfer.utxoXpub,
  nevmAddress: transfer.nevmAddress,
  amount: transfer.amount,
  agreedToTerms: transfer.agreedToTerms,
  useSysx: transfer.useSysx,
  utxoAssetType: transfer.utxoAssetType,
  updatedAt: Date.now(),
});

const toPublicTransfer = (transfer: unknown): ITransfer => {
  const source =
    typeof transfer === "object" &&
    transfer !== null &&
    "toObject" in transfer &&
    typeof transfer.toObject === "function"
      ? transfer.toObject()
      : { ...(transfer as Record<string, unknown>) };
  delete source.writeTokenHash;
  delete source.__v;
  return source as ITransfer;
};

export class TransferService {
  private sponsorWalletService = new SponsorWalletService();
  constructor() {}

  async getAll(params: Partial<ITransfer>): Promise<ITransfer[]> {
    const filters: (keyof ITransfer)[] = [
      "nevmAddress",
      "utxoAddress",
      "utxoXpub",
    ];
    const queryConstraints = filters.reduce((acc, key) => {
      if (key in params && typeof params[key] === "string") {
        acc.push({ [key]: params[key] as string });
      }
      return acc;
    }, [] as Record<string, string>[]);
    return TransferModel.find({
      $or: queryConstraints,
    }).sort({ createdAt: -1 }) as unknown as ITransfer[];
  }

  async getTransfer(id: string): Promise<ITransfer> {
    const transfer = await TransferModel.findOne({ id });

    if (!transfer) {
      throw new TransferNotFoundError();
    }

    return transfer as unknown as ITransfer;
  }

  async getAuthorizedTransfer(
    id: string,
    writeToken?: string
  ): Promise<ITransfer> {
    const transfer = await TransferModel.findOne({ id: { $eq: id } }).select(
      "+writeTokenHash"
    );

    if (!transfer) {
      throw new Error("Transfer not found");
    }
    if (
      !writeToken ||
      !transfer.writeTokenHash ||
      !writeTokenMatches(writeToken, transfer.writeTokenHash)
    ) {
      throw new TransferWriteUnauthorizedError();
    }

    return toPublicTransfer(transfer);
  }

  private async updateSponsorStatuses(transfer: ITransfer): Promise<void> {
    const submitProofsTxLog = transfer.logs.find(
      (log) => log.status === "submit-proofs"
    );
    if (submitProofsTxLog) {
      const { hash } = submitProofsTxLog.payload.data;
      if (hash) {
        await this.sponsorWalletService.updateSponsorWalletTransactionStatus(
          hash
        );
      }
    }
    const sponsoredUtxoLogs = transfer.logs.filter(
      (log) =>
        log.status === ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX ||
        log.status === ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX ||
        log.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX
    );
    for (const log of sponsoredUtxoLogs) {
      const { tx } = log.payload.data;
      if (tx) {
        await this.sponsorWalletService.updateUtxoSponsorWalletTransactionStatus(
          tx
        );
      }
    }
  }

  async upsertTransfer(
    transfer: ITransfer,
    writeToken?: string
  ): Promise<TransferWriteResult> {
    const existing = await TransferModel.findOne({ id: transfer.id }).select(
      "+writeTokenHash"
    );

    if (!existing) {
      if (!writeToken) {
        throw new TransferWriteUnauthorizedError();
      }
      const created = await TransferModel.create({
        ...toTransferUpdate(transfer),
        id: transfer.id,
        version: "v2",
        createdAt: Date.now(),
        writeTokenHash: hashWriteToken(writeToken),
      });

      return { transfer: toPublicTransfer(created) };
    }

    if (
      !writeToken ||
      !existing.writeTokenHash ||
      !writeTokenMatches(writeToken, existing.writeTokenHash)
    ) {
      throw new TransferWriteUnauthorizedError();
    }

    await this.updateSponsorStatuses(transfer);
    const updatedTransfer = await TransferModel.findOneAndUpdate(
      {
        id: transfer.id,
        writeTokenHash: existing.writeTokenHash,
      },
      { $set: toTransferUpdate(transfer) },
      { new: true }
    );
    if (!updatedTransfer) {
      throw new TransferWriteUnauthorizedError();
    }

    return { transfer: toPublicTransfer(updatedTransfer) };
  }
}
