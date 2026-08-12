const SYSCOIN_DECIMALS = 8;

const powerOfTen = (decimals: number): bigint =>
  BigInt(`1${"0".repeat(decimals)}`);

const SYSCOIN_BASE_UNIT_FACTOR = powerOfTen(SYSCOIN_DECIMALS);

const parseNonnegativeInteger = (amount: string): bigint => {
  const normalized = String(amount).trim();
  if (!/^(0|[1-9]\d*)$/.test(normalized)) {
    throw new Error("Base-unit amount must be a nonnegative integer");
  }

  return BigInt(normalized);
};

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

export const getTransferableSyscoinBaseUnits = ({
  balanceBaseUnits,
  balanceDecimals,
  reserveBaseUnits,
}: {
  balanceBaseUnits: string;
  balanceDecimals: number;
  reserveBaseUnits: string;
}): string => {
  if (!Number.isInteger(balanceDecimals) || balanceDecimals < SYSCOIN_DECIMALS) {
    throw new Error("Balance precision must be at least 8 decimals");
  }

  const balance = parseNonnegativeInteger(balanceBaseUnits);
  const reserve = parseNonnegativeInteger(reserveBaseUnits);
  const sourceUnitFactor = powerOfTen(balanceDecimals - SYSCOIN_DECIMALS);
  const balanceInSyscoinBaseUnits = balance / sourceUnitFactor;

  return balanceInSyscoinBaseUnits > reserve
    ? (balanceInSyscoinBaseUnits - reserve).toString()
    : "0";
};

export const formatSyscoinBaseUnits = (amount: string): string => {
  const baseUnits = parseNonnegativeInteger(amount);
  const whole = baseUnits / SYSCOIN_BASE_UNIT_FACTOR;
  const fraction = (baseUnits % SYSCOIN_BASE_UNIT_FACTOR)
    .toString()
    .padStart(SYSCOIN_DECIMALS, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
};

export const toSyscoinBaseUnits = (amount: string): string => {
  const baseUnits = parseSyscoinBaseUnits(amount);
  if (baseUnits <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }

  return baseUnits.toString();
};
