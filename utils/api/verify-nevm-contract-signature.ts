import { hashPersonalMessage } from "ethereumjs-util";
import Web3 from "web3";
import { normalizeEvmChainId } from "utils/network-config";

let verifier: { url: string; web3: Web3 } | undefined;

const verifyNevmContractSignature = async (
  address: string,
  message: string,
  signature: string,
  chainId: string
): Promise<boolean> => {
  const url = process.env.NEVM_RPC_URL;
  if (!url) return false;
  if (verifier?.url !== url) {
    verifier = { url, web3: new Web3(new Web3.providers.HttpProvider(url, { timeout: 5000 })) };
  }
  const { eth } = verifier.web3;
  try {
    if (normalizeEvmChainId(await eth.getChainId()) !== chainId) return false;
    const hash = `0x${hashPersonalMessage(Buffer.from(message, "utf8")).toString("hex")}`;
    const args = eth.abi.encodeParameters(["bytes32", "bytes"], [hash, signature]);
    const result = await eth.call({
      to: address,
      data: `0x1626ba7e${args.slice(2)}`,
      gas: 250_000,
    }, "latest");
    return /^0x1626ba7e(?:0{56})?$/i.test(result);
  } catch {
    return false;
  }
};

export default verifyNevmContractSignature;
