import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  PROOF_BLOCK_PENDING_CODE,
  PROOF_BLOCK_RETRY_DELAY_MS,
} from "utils/proof-submission";

const mockGetBlock = jest.fn<any>();
const mockGetBlockNumber = jest.fn<any>();
const mockEncodeAbi = jest.fn(() => "0xrelay");
const mockRelayTx = jest.fn(() => ({ encodeABI: mockEncodeAbi }));
const mockSponsorTransaction = jest.fn<any>();
const mockGetTransfer = jest.fn<any>();
const mockGetCanonicalProof = jest.fn<any>();

jest.mock("@constants", () => ({
  RELAY_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
}));
jest.mock("web3", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    eth: {
      Contract: jest.fn().mockImplementation(() => ({
        methods: { relayTx: mockRelayTx },
      })),
      getBlock: mockGetBlock,
      getBlockNumber: mockGetBlockNumber,
    },
  })),
}));
jest.mock("api/services/sponsor-wallet", () => {
  class SponsorshipInProgressError extends Error {}
  class SponsorNonceRecoveryError extends Error {}

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      sponsorTransaction: mockSponsorTransaction,
    })),
    SponsorshipInProgressError,
    SponsorNonceRecoveryError,
  };
});
jest.mock("api/services/sponsor-proof", () => ({
  getCanonicalProof: mockGetCanonicalProof,
}));
jest.mock("api/services/transfer", () => ({
  TransferService: jest.fn().mockImplementation(() => ({
    getTransfer: mockGetTransfer,
  })),
}));
jest.mock("bitcoin-proof", () => ({
  getProof: jest.fn(() => ({ sibling: ["sibling"] })),
}));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/cors", () => ({
  applyApiCors: jest.fn(() => false),
}));

import handler from "pages/api/transfer/[id]/signed-submit-proofs-tx";

const createResponse = () => {
  const response = {
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

const request = {
  method: "GET",
  query: { id: "transfer-1" },
} as unknown as NextApiRequest;

describe("signed proof submission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FOUNDATION_FUNDED = "true";
    mockGetTransfer.mockResolvedValue({
      id: "transfer-1",
      version: "v2",
      logs: [
        {
          status: "generate-proofs",
          payload: { data: { nevm_blockhash: "proof-block-hash" } },
        },
      ],
    });
    mockGetCanonicalProof.mockResolvedValue({
      sourceTxHash: "source-burn-hash",
      proof: {
        blockhash: "utxo-block-hash",
        coinbase: "coinbase",
        header: "header",
        index: 1,
        nevm_blockhash: "proof-block-hash",
        siblings: ["sibling"],
        transaction: "transaction",
      },
    });
    mockGetBlock.mockResolvedValue({ number: 100 });
    mockSponsorTransaction.mockResolvedValue({
      status: "pending",
      transaction: { hash: "0xsponsored", confirmedHash: "" },
    });
  });

  afterEach(() => {
    delete process.env.FOUNDATION_FUNDED;
  });

  it("waits without reserving sponsorship when the proof block is the tip", async () => {
    mockGetBlockNumber.mockResolvedValue(100);
    const response = createResponse();

    await handler(request, response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", 10);
    expect(response.json).toHaveBeenCalledWith({
      code: PROOF_BLOCK_PENDING_CODE,
      message: "Waiting for the next NEVM block before submitting the proof.",
      retryAfterMs: PROOF_BLOCK_RETRY_DELAY_MS,
    });
    expect(mockRelayTx).not.toHaveBeenCalled();
    expect(mockSponsorTransaction).not.toHaveBeenCalled();
  });

  it("submits once the proof block is historical", async () => {
    mockGetBlockNumber.mockResolvedValue(101);
    const response = createResponse();

    await handler(request, response);

    expect(mockSponsorTransaction).toHaveBeenCalledTimes(1);
    expect(mockSponsorTransaction).toHaveBeenCalledWith(
      "transfer-1",
      {
        to: expect.any(String),
        data: "0xrelay",
        value: 0,
      },
      "submit-proofs",
      "source-burn-hash"
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      status: "pending",
      transaction: { hash: "0xsponsored", confirmedHash: "" },
    });
  });
});
