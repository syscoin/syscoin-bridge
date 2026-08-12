const SYSCOIN_DECIMALS = 8;

const parseSyscoinBaseUnits = (amount: string): bigint => {
  const normalized = String(amount).trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalized);

  if (!match) {
    throw new Error("Amount must be a positive decimal number");
  }
  if (match[1].length > 20) {
    throw new Error("Amount is too large");
  }

  const fraction = match[2] || "";
  if (fraction.length > SYSCOIN_DECIMALS) {
    throw new Error("Amount supports at most 8 decimal places");
  }

  return BigInt(`${match[1]}${fraction.padEnd(SYSCOIN_DECIMALS, "0")}`);
};

export const toNonnegativeSyscoinBaseUnits = (amount: string): string =>
  parseSyscoinBaseUnits(amount).toString();

export const toSyscoinBaseUnits = (amount: string): string => {
  const baseUnits = parseSyscoinBaseUnits(amount);
  if (baseUnits <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }

  return baseUnits.toString();
};
