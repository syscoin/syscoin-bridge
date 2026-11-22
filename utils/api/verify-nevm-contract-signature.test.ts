import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { hashPersonalMessage } from "ethereumjs-util";
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
});
