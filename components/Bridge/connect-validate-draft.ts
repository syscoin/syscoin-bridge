export type ConnectValidateDraft = {
  amount?: string;
  nevmAddress: string;
  utxoAddress: string;
  utxoXpub: string;
  utxoAssetType?: "sys" | "sysx";
};

type DraftStorageReader = Pick<Storage, "getItem">;
type DraftStorageWriter = Pick<Storage, "setItem">;
type DraftStorageRemover = Pick<Storage, "removeItem">;

const STORAGE_KEY = "syscoin-bridge-connect-draft-v1";
const MAX_DRAFT_VALUE_LENGTH = 512;

const readDraftString = (value: unknown) =>
  typeof value === "string" && value.length <= MAX_DRAFT_VALUE_LENGTH
    ? value
    : undefined;

export const readConnectValidateDraft = (
  storage: DraftStorageReader
): Partial<ConnectValidateDraft> => {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const draft = JSON.parse(stored) as Record<string, unknown> | null;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return {};

    const amount = readDraftString(draft.amount);
    const nevmAddress = readDraftString(draft.nevmAddress);
    const utxoAddress = readDraftString(draft.utxoAddress);
    const utxoXpub = readDraftString(draft.utxoXpub);
    const utxoAssetType =
      draft.utxoAssetType === "sys" || draft.utxoAssetType === "sysx"
        ? draft.utxoAssetType
        : undefined;

    return {
      ...(amount !== undefined && { amount }),
      ...(nevmAddress !== undefined && { nevmAddress }),
      ...(utxoAddress !== undefined && { utxoAddress }),
      ...(utxoXpub !== undefined && { utxoXpub }),
      ...(utxoAssetType !== undefined && { utxoAssetType }),
    };
  } catch {
    return {};
  }
};

export const writeConnectValidateDraft = (
  storage: DraftStorageWriter,
  draft: Partial<ConnectValidateDraft>
) => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // A blocked or full browser store must not prevent starting a transfer.
  }
};

export const clearConnectValidateDraft = (storage: DraftStorageRemover) => {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // A blocked browser store is equivalent to having no saved draft.
  }
};
