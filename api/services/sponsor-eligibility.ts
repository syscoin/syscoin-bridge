const parseBlockNumber = (value: unknown, label: string): bigint => {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return BigInt(value);
  }

  if (
    typeof value === "string" &&
    (/^\d+$/.test(value) || /^0x[0-9a-f]+$/i.test(value))
  ) {
    return BigInt(value);
  }

  if (typeof value === "bigint" && value >= BigInt(0)) {
    return value;
  }

  throw new Error(`${label} is not a valid block number`);
};

export const getV2ActivationBlock = (): bigint => {
  const configuredActivationBlock = process.env.NEVM_V2_ACTIVATION_BLOCK;
  if (!configuredActivationBlock) {
    throw new Error("NEVM V2 activation block is not configured");
  }

  return parseBlockNumber(
    configuredActivationBlock,
    "NEVM V2 activation block"
  );
};

export const assertV2ActivationBlock = (receiptBlockNumber: unknown): void => {
  const activationBlock = getV2ActivationBlock();
  const eventBlock = parseBlockNumber(
    receiptBlockNumber,
    "Freeze and burn receipt block"
  );

  if (eventBlock < activationBlock) {
    throw new Error(
      "Freeze and burn transaction is before the V2 activation block"
    );
  }
};
