import Web3 from "web3";

export const validateTransactionReceipt = async (
  web3: Web3,
  txHash: string,
  contractAddress: string
) => {
  const receipt = await web3.eth.getTransactionReceipt(txHash);

  if (!receipt) {
    throw new Error("Invalid transaction hash: Transaction not found");
  }

  if (
    !receipt.to ||
    receipt.to.toLowerCase() !== contractAddress.toLowerCase()
  ) {
    throw new Error(
      "Invalid transaction: To is not the expected contract address"
    );
  }

  if (receipt.logs.length === 0) {
    throw new Error("Invalid transaction: No logs found");
  }
  return receipt;
};
