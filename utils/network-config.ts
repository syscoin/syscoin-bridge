export type SyscoinNetworkConfig = {
  isTestnet?: boolean;
  chain_id?: string;
};

export const SYSCOIN_MAINNET_CHAIN_ID = 57;
export const SYSCOIN_TESTNET_CHAIN_ID = 5700;

export const resolveSyscoinIsTestnet = (
  config?: SyscoinNetworkConfig | null
) => {
  const configuredChainId = Number(config?.chain_id);

  if (configuredChainId === SYSCOIN_TESTNET_CHAIN_ID) {
    return true;
  }

  if (configuredChainId === SYSCOIN_MAINNET_CHAIN_ID) {
    return false;
  }

  return Boolean(config?.isTestnet);
};

export const getSyscoinChainId = (isTestnet: boolean) =>
  isTestnet ? SYSCOIN_TESTNET_CHAIN_ID : SYSCOIN_MAINNET_CHAIN_ID;

export const normalizeEvmChainId = (chainId: unknown) => {
  if (typeof chainId !== "string" && typeof chainId !== "number") {
    return undefined;
  }

  const value = typeof chainId === "string" ? chainId.trim() : chainId;
  if (
    (typeof value === "string" &&
      !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) ||
    value === ""
  ) {
    return undefined;
  }

  const numericChainId = Number(value);
  if (!Number.isSafeInteger(numericChainId) || numericChainId < 0) {
    return undefined;
  }

  return `0x${numericChainId.toString(16)}`;
};

export const isSyscoinTestnetHost = (hostname?: string | null) => {
  const normalizedHostname = hostname?.split(":")[0].toLowerCase();

  return (
    normalizedHostname === "bridge.tanenbaum.io" ||
    (Boolean(normalizedHostname?.startsWith("bridge-testnet-")) &&
      Boolean(normalizedHostname?.endsWith(".vercel.app")))
  );
};
