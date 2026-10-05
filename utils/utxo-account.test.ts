import { afterEach, describe, expect, it } from "@jest/globals";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { isValidUtxoAccount } from "./utxo-account";

const versions = [
  { prefix: "xpub", isTestnet: false, public: 0x0488b21e, private: 0x0488ade4 },
  { prefix: "ypub", isTestnet: false, public: 0x049d7cb2, private: 0x049d7878 },
  { prefix: "zpub", isTestnet: false, public: 0x04b24746, private: 0x04b2430c },
  { prefix: "tpub", isTestnet: true, public: 0x043587cf, private: 0x04358394 },
  { prefix: "upub", isTestnet: true, public: 0x044a5262, private: 0x044a4e28 },
  { prefix: "vpub", isTestnet: true, public: 0x045f1cf6, private: 0x045f18bc },
];

const createAccount = (version = versions[0]) =>
  syscoinUtils.bitcoinjs.bip32
    .fromSeed(Buffer.alloc(32, 1), {
      ...(version.isTestnet
        ? syscoinUtils.syscoinNetworks.testnet
        : syscoinUtils.syscoinNetworks.mainnet),
      bip32: { public: version.public, private: version.private },
    })
    .derivePath(`m/84'/${version.isTestnet ? 1 : 57}'/0'`);

const originalTestnet = process.env.IS_TESTNET;
afterEach(() => {
  if (originalTestnet === undefined) delete process.env.IS_TESTNET;
  else process.env.IS_TESTNET = originalTestnet;
});

describe("UTXO public account validation", () => {
  it.each(versions)("accepts a valid $prefix on its network", (version) => {
    const account = createAccount(version).neutered().toBase58();

    expect(account.startsWith(version.prefix)).toBe(true);
    expect(isValidUtxoAccount(account, version.isTestnet)).toBe(true);
    expect(isValidUtxoAccount(account, !version.isTestnet)).toBe(false);
  });

  it.each(versions)("rejects the private key paired with $prefix", (version) => {
    expect(
      isValidUtxoAccount(createAccount(version).toBase58(), version.isTestnet)
    ).toBe(false);
  });

  it("uses the server network when no network is provided", () => {
    const mainnetAccount = createAccount().neutered().toBase58();
    const testnetAccount = createAccount(versions[3]).neutered().toBase58();

    process.env.IS_TESTNET = "false";
    expect(isValidUtxoAccount(mainnetAccount)).toBe(true);
    expect(isValidUtxoAccount(testnetAccount)).toBe(false);
    process.env.IS_TESTNET = "true";
    expect(isValidUtxoAccount(mainnetAccount)).toBe(false);
    expect(isValidUtxoAccount(testnetAccount)).toBe(true);
  });

  it("rejects a valid-looking public key with a corrupted checksum", () => {
    const account = createAccount().neutered().toBase58();
    const replacement = account.endsWith("1") ? "2" : "1";

    expect(isValidUtxoAccount(account.slice(0, -1) + replacement, false)).toBe(
      false
    );
  });

  it("rejects checksum-valid payloads with invalid public key data", () => {
    const bs58check = require("bs58check").default;
    const account = createAccount().neutered().toBase58();
    const payload = Buffer.from(bs58check.decode(account));
    payload.fill(0, 45);

    expect(isValidUtxoAccount(bs58check.encode(payload), false)).toBe(false);
  });

  it("rejects malformed root metadata even when its checksum is valid", () => {
    const bs58check = require("bs58check").default;
    const account = createAccount().neutered().toBase58();
    const payload = Buffer.from(bs58check.decode(account));
    payload[4] = 0;

    expect(isValidUtxoAccount(bs58check.encode(payload), false)).toBe(false);
  });

  it.each([
    undefined,
    null,
    "",
    42,
    {},
    [],
    "xpub-test",
    "../account",
    "%2e%2e%2faccount",
    "%252e%252e%252faccount",
    "xpub" + "1".repeat(107),
    "xpub" + "0".repeat(107),
  ])("rejects malformed account input %p", (value) => {
    expect(isValidUtxoAccount(value, false)).toBe(false);
  });

  it("rejects decorated, encoded, and path-suffixed valid accounts", () => {
    const account = createAccount().neutered().toBase58();
    for (const value of [
      ` ${account}`,
      `${account}\n`,
      `${account}/0/0`,
      `${account}%2f0`,
      `${account}%252f0`,
      `${account}?details=tokens`,
      `${account}#fragment`,
      `%78${account.slice(1)}`,
    ]) {
      expect(isValidUtxoAccount(value, false)).toBe(false);
    }
  });
});
