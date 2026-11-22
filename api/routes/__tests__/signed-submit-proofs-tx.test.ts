import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  PROOF_BLOCK_PENDING_CODE,
  PROOF_BLOCK_RETRY_DELAY_MS,
  PROOF_SPONSORSHIP_UNAVAILABLE_CODE,
} from "utils/proof-submission";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const mockGetBlock = jest.fn<any>();
const mockGetBlockNumber = jest.fn<any>();
const mockEncodeAbi = jest.fn(() => "0xrelay");
const mockRelayTx = jest.fn(() => ({ encodeABI: mockEncodeAbi }));
const mockSponsorTransaction = jest.fn<any>();
const mockGetTransfer = jest.fn<any>();
const mockGetCanonicalProof = jest.fn<any>();
const mockGetExistingProofSponsorship = jest.fn<any>();
const mockAssertSponsoredProofBurn = jest.fn<any>();

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
      getExistingProofSponsorship: mockGetExistingProofSponsorship,
    })),
    SponsorshipInProgressError,
    SponsorNonceRecoveryError,
  };
});
jest.mock("api/services/sponsor-proof", () => ({
  ...jest.requireActual<typeof import("api/services/sponsor-proof")>("api/services/sponsor-proof"),
  assertSponsoredProofBurn: mockAssertSponsoredProofBurn,
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
const sourceTxHash = syscoinTxIdFromWitnessStrippedHex("00");

describe("signed proof submission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FOUNDATION_FUNDED = "true";
    process.env.MINIMUM_AMOUNT = "100";
    mockGetExistingProofSponsorship.mockResolvedValue(null);
    mockAssertSponsoredProofBurn.mockReset();
    mockGetTransfer.mockResolvedValue({
      id: "transfer-1",
      version: "v2",
      type: "sys-to-nevm",
      logs: [
        {
          status: "generate-proofs",
          payload: { data: { nevm_blockhash: "proof-block-hash", transaction: "00" } },
        },
      ],
    });
    mockGetCanonicalProof.mockResolvedValue({
      sourceTxHash,
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
    delete process.env.MINIMUM_AMOUNT;
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
      sourceTxHash
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      status: "pending",
      transaction: { hash: "0xsponsored", confirmedHash: "" },
    });
  });

  it("serves an existing sponsorship without loading the proof block or enforcing the new-signature minimum", async () => {
    delete process.env.MINIMUM_AMOUNT;
    mockGetExistingProofSponsorship.mockResolvedValue({
      status: "success",
      transaction: { hash: "0xexisting", confirmedHash: "0xexisting" },
    });
    const response = createResponse();

    await handler(request, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      status: "success",
      transaction: { hash: "0xexisting", confirmedHash: "0xexisting" },
    });
    expect(mockGetCanonicalProof).not.toHaveBeenCalled();
    expect(mockGetBlock).not.toHaveBeenCalled();
    expect(mockGetBlockNumber).not.toHaveBeenCalled();
    expect(mockSponsorTransaction).not.toHaveBeenCalled();
  });

  it("declines new sponsorship without a configured minimum", async () => {
    delete process.env.MINIMUM_AMOUNT;
    const response = createResponse();

    await handler(request, response);

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      code: PROOF_SPONSORSHIP_UNAVAILABLE_CODE,
      message: "Foundation proof sponsorship minimum is not configured",
    });
    expect(mockGetCanonicalProof).not.toHaveBeenCalled();
    expect(mockSponsorTransaction).not.toHaveBeenCalled();
  });
});
