import { RELAY_CONTRACT_ADDRESS } from "@constants";
import relayAbi from "@contexts/Transfer/relay-abi";
import { TransferService } from "api/services/transfer";
import { getProof } from "bitcoin-proof";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { SPVProof } from "syscoinjs-lib";
import Web3 from "web3";

const web3 = new Web3("https://rpc.syscoin.org");

const relayContract = new web3.eth.Contract(relayAbi, RELAY_CONTRACT_ADDRESS);

const transferService = new TransferService();

const handler: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const { id } = req.query;

  try {
    const transfer = await transferService.getTransfer(id as string);
    const generatedProofLog = transfer.logs.find(
      (a) => a.status === "generate-proofs"
    );
    if (!generatedProofLog) {
      throw new Error("Proofs not generated");
    }
    const proof = generatedProofLog.payload.data as SPVProof;
    const nevmBlock = await web3.eth.getBlock(`0x${proof.nevm_blockhash}`);
    if (!nevmBlock) {
      throw new Error("NEVM block not found: " + proof.nevm_blockhash);
    }
    const txBytes = `0x${proof.transaction}`;
    const txIndex = proof.index;
    const merkleProof = getProof(proof.siblings, txIndex);
    merkleProof.sibling = merkleProof.sibling.map((sibling) => `0x${sibling}`);
    const syscoinBlockheader = `0x${proof.header}`;

    const method = relayContract.methods.relayTx(
      nevmBlock.number,
      txBytes,
      txIndex,
      merkleProof.sibling,
      syscoinBlockheader
    );

    const encoded = method.encodeABI();

    if (!process.env.BRIDGE_WALLET_PRIVATE_KEY) {
      throw new Error("BRIDGE_WALLET_PRIVATE_KEY not set");
    }

    const bridgeWallet = web3.eth.accounts.privateKeyToAccount(
      process.env.BRIDGE_WALLET_PRIVATE_KEY
    );

    const walletBalanceInString = await web3.eth.getBalance(
      bridgeWallet.address
    );

    const balanceInEth = web3.utils.fromWei(walletBalanceInString, "ether");

    if (Number(balanceInEth) < 0.01) {
      throw new Error("Bridge wallet balance is less than 0.01");
    }

    const sender = web3.eth.accounts.privateKeyToAccount(
      process.env.BRIDGE_WALLET_PRIVATE_KEY
    );

    const nonce = await web3.eth.getTransactionCount(sender.address, "latest");

    const gasPrice = await web3.eth.getGasPrice();
    const gas = await method.estimateGas();
    const gasLimit = gas ?? 400_000;

    const signedTransaction = await sender.signTransaction({
      nonce,
      to: RELAY_CONTRACT_ADDRESS,
      gasPrice: web3.utils.toHex(gasPrice),
      gas: web3.utils.toHex(gasLimit),
      data: encoded,
      value: 0,
    });

    res.status(200).json({ signedTx: signedTransaction.rawTransaction });
  } catch (e) {
    let message = "Unknown error";
    if (e instanceof Error) {
      message = e.message;
    }
    res.status(500).json({ message });
  }
};

export default handler;
