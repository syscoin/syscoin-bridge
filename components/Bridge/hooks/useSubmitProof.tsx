import { useMutation } from "react-query";
import { SPVProof } from "syscoinjs-lib";

import { getProof } from "bitcoin-proof";
import { useWeb3 } from "../context/Web";

import { ITransfer } from "@contexts/Transfer/types";
import { useRelayContract } from "./useRelayContract";
import {
  assertProofBlockIsHistorical,
  proofSubmissionRetryDelay,
  shouldRetryPendingProof,
} from "utils/proof-submission";


export const isSpvProof = (data: unknown): data is SPVProof => {
  return typeof data === "object" && data !== null && "nevm_blockhash" in data;
};

export const useSubmitProof = (transfer: ITransfer, proof: SPVProof) => {
  const relayContract = useRelayContract();
  const web3 = useWeb3();
  return useMutation(["submitProof", proof.transaction], async () => {
    const nevmBlock = await web3.eth.getBlock(`0x${proof.nevm_blockhash}`);
    if (!nevmBlock) {
      throw new Error("NEVM block not found: " + proof.nevm_blockhash);
    }
    if (nevmBlock.number === null) {
      throw new Error("NEVM proof block has no block number");
    }
    assertProofBlockIsHistorical(
      nevmBlock.number,
      await web3.eth.getBlockNumber()
    );
    if (!proof.coinbase) {
      throw new Error("The generated SPV proof is missing coinbase data");
    }
    const txBytes = `0x${proof.transaction}`;
    const txIndex = proof.index;
    const merkleProof = getProof(proof.siblings, txIndex);
    merkleProof.sibling = merkleProof.sibling.map((sibling) => `0x${sibling}`);
    const coinbaseBytes = `0x${proof.coinbase}`;
    const coinbaseProof = getProof(proof.siblings, 0);
    coinbaseProof.sibling = coinbaseProof.sibling.map(
      (sibling) => `0x${sibling}`
    );
    const syscoinBlockheader = `0x${proof.header}`;

    const method = relayContract.methods.relayTx(
      nevmBlock.number,
      txBytes,
      txIndex,
      merkleProof.sibling,
      syscoinBlockheader,
      coinbaseBytes,
      coinbaseProof.sibling
    );

    const gasPrice = await web3.eth.getGasPrice();

    let gas: number;
    try {
      gas = await method.estimateGas({ from: transfer.nevmAddress });
    } catch (error) {
      console.error("Estimate gas error", error);
      throw error instanceof Error
        ? error
        : new Error("Unable to estimate gas for proof submission");
    }

    return new Promise((resolve, reject) => {
      method
        .send({
          from: transfer.nevmAddress,
          gas,
          gasPrice,
        })
        .once("transactionHash", (hash: string | any) => {
          // Handle both string and object formats
          const txHash = typeof hash === "string" ? hash : hash?.hash;
  
          if (!txHash) {
            reject("Proof submission did not return a transaction hash");
            console.error("Submission failed", hash);
          } else {
            resolve(txHash);
          }
        })
        .on("error", (error: { message: string }) => {
          if (/might still be mined/.test(error.message)) {
            resolve("");
          } else {
            console.error(error);
            reject(error.message);
          }
        });
    });
  }, {
    retry: shouldRetryPendingProof,
    retryDelay: proofSubmissionRetryDelay,
  });
};
