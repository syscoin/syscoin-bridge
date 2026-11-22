import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { hashPersonalMessage } from "ethereumjs-util";
import { ETH_TO_SYS_TRANSFER_STATUS, type ITransfer } from "@contexts/Transfer/types";
import { issueTransferCreationAuthorization, verifyTransferCreationAuthorization } from "./transfer-creation-authorization";
import verifyNevmContractSignature from "./verify-nevm-contract-signature";

const mockCall = jest.fn<() => Promise<string>>();
const mockGetChainId = jest.fn<() => Promise<number>>();

jest.mock("web3", () => {
  const RealWeb3 = jest.requireActual<typeof import("web3").default>("web3");
  return class {
    static providers: { HttpProvider: new () => object } = { HttpProvider: class {} };
    readonly eth = {
      abi: new RealWeb3().eth.abi,
      call: mockCall,
      getChainId: mockGetChainId,
    };
  };
});

const address = "0x1111111111111111111111111111111111111111";
const message = "Syscoin Bridge transfer creation";
const signature = "0x" + "22".repeat(90);
const original = process.env.NEVM_RPC_URL;

describe("NEVM contract wallet verification", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEVM_RPC_URL = "https://nevm.example";
    mockGetChainId.mockResolvedValue(57);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEVM_RPC_URL;
    else process.env.NEVM_RPC_URL = original;
  });

  it("accepts the contract's ERC-1271 magic value for the EIP-191 digest on the configured chain", async () => {
    mockCall.mockResolvedValue("0x1626ba7e" + "0".repeat(56));
    await expect(verifyNevmContractSignature(address, message, signature, "0x39")).resolves.toBe(true);
    const digest = hashPersonalMessage(Buffer.from(message)).toString("hex");
    expect(mockCall).toHaveBeenCalledWith({
      to: address, data: expect.stringMatching(new RegExp(`^0x1626ba7e${digest}`)), gas: 250_000,
    }, "latest");
  });

  it("refuses to read signatures from another chain", async () => {
    mockGetChainId.mockResolvedValue(5700);
    await expect(verifyNevmContractSignature(address, message, signature, "0x39")).resolves.toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it.each(["0x", "0xffffffff", "0x1626ba7eff"])("rejects a nonvalid result %s", async (result) => {
    mockCall.mockResolvedValue(result);
    await expect(verifyNevmContractSignature(address, message, signature, "0x39")).resolves.toBe(false);
  });

  describe("empty transfer creation signatures", () => {
    const originalSecret = process.env.SECRET_COOKIE_PASSWORD;
    const originalChainId = process.env.CHAIN_ID;
    const origin = "https://bridge.example";
    const token = "019aa721-0d63-4320-823f-b28324544a40";
    const transfer: ITransfer = {
      id: "e8d6267c-f818-41b3-9ee0-09b71179c438",
      type: "nevm-to-sys",
      status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
      amount: "1",
      logs: [],
      createdAt: 1,
      utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
      nevmAddress: address,
      version: "v2",
      agreedToTerms: true,
    };
    const charge = jest.fn(async () => undefined);
    const authorize = (challenge: string, signedMessage: string) =>
      verifyTransferCreationAuthorization(transfer, origin, token, { challenge, signedMessage }, charge);

    beforeEach(() => {
      process.env.CHAIN_ID = "57";
      process.env.SECRET_COOKIE_PASSWORD = "test-transfer-creation-authorization-secret";
    });
    afterEach(() => {
      if (originalSecret === undefined) delete process.env.SECRET_COOKIE_PASSWORD;
      else process.env.SECRET_COOKIE_PASSWORD = originalSecret;
      if (originalChainId === undefined) delete process.env.CHAIN_ID;
      else process.env.CHAIN_ID = originalChainId;
    });

    it("accepts an approved empty envelope through the configured chain's contract verifier", async () => {
      const intent = issueTransferCreationAuthorization(transfer, origin, token);
      mockCall.mockResolvedValue("0x1626ba7e" + "0".repeat(56));
      await expect(authorize(intent.challenge, "0x")).resolves.toBe(true);
      expect(charge).toHaveBeenCalledTimes(1);
      const digest = hashPersonalMessage(Buffer.from(intent.message)).toString("hex");
      const offset = "40".padStart(64, "0");
      expect(mockCall).toHaveBeenCalledWith({
        to: address, data: `0x1626ba7e${digest}${offset}${"0".repeat(64)}`, gas: 250_000,
      }, "latest");

      mockCall.mockClear();
      mockGetChainId.mockResolvedValue(5700);
      await expect(authorize(intent.challenge, "0x")).resolves.toBe(false);
      expect(mockCall).not.toHaveBeenCalled();
    });

    it.each([["EOA", "0x"], ["unapproved contract", "0xffffffff"]])(
      "refuses empty signatures for an %s", async (_kind, result) => {
        const { challenge } = issueTransferCreationAuthorization(transfer, origin, token);
        mockCall.mockResolvedValue(result);
        await expect(authorize(challenge, "0x")).resolves.toBe(false);
        expect(charge).toHaveBeenCalledTimes(1);
      }
    );

    it.each([["missing", ""], ["unprefixed", "00"], ["odd-length", "0x0"], ["non-hex", "0xzz"], ["oversized", "0x" + "aa".repeat(4097)]])("rejects %s bytes before contract verification", async (_kind, value) => {
      const { challenge } = issueTransferCreationAuthorization(transfer, origin, token);
      await expect(authorize(challenge, value)).resolves.toBe(false);
      expect(charge).not.toHaveBeenCalled();
      expect(mockGetChainId).not.toHaveBeenCalled();
    });
  });
});
