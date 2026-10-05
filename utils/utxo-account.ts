import { utils as syscoinUtils } from "syscoinjs-lib";

const accountVersions: Record<
  string,
  { isTestnet: boolean; public: number; private: number }
> = {
  xpub: { isTestnet: false, public: 0x0488b21e, private: 0x0488ade4 },
  ypub: { isTestnet: false, public: 0x049d7cb2, private: 0x049d7878 },
  zpub: { isTestnet: false, public: 0x04b24746, private: 0x04b2430c },
  tpub: { isTestnet: true, public: 0x043587cf, private: 0x04358394 },
  upub: { isTestnet: true, public: 0x044a5262, private: 0x044a4e28 },
  vpub: { isTestnet: true, public: 0x045f1cf6, private: 0x045f18bc },
};

/** Validate the exact public account representation forwarded to Blockbook. */
export const isValidUtxoAccount = (
  value: unknown,
  isTestnet = process.env.IS_TESTNET === "true"
): value is string => {
  if (
    typeof value !== "string" ||
    value.length !== 111 ||
    !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    return false;
  }

  const version = accountVersions[value.slice(0, 4)];
  if (!version || version.isTestnet !== isTestnet) return false;

  const network = isTestnet
    ? syscoinUtils.syscoinNetworks.testnet
    : syscoinUtils.syscoinNetworks.mainnet;
  try {
    const account = syscoinUtils.bitcoinjs.bip32.fromBase58(value, {
      ...network,
      bip32: { public: version.public, private: version.private },
    });
    return account.isNeutered() && account.toBase58() === value;
  } catch {
    return false;
  }
};
