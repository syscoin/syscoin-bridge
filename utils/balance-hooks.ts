import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import { isValidEthereumAddress } from "@pollum-io/sysweb3-utils";
import { useWeb3 } from "components/Bridge/v3/context/Web";

import { useQuery } from "react-query";

export const useUtxoBalance = (xpub?: string) =>
  useQuery(["utxo", "balance", xpub], async () => {
    if (!xpub || isValidEthereumAddress(xpub)) return Promise.resolve(0);
    const url = BlockbookAPIURL + "/api/v2/xpub/" + xpub;
    const balanceInText = await fetch(url)
      .then((res) => res.json())
      .then((res) => res.balance);
    return parseInt(balanceInText) / Math.pow(10, 8);
  });

export const useNevmBalance = (address?: string) => {
  const web3 = useWeb3();
  return useQuery(["nevm", "balance", address], async () => {
    if (!address) return Promise.resolve(0);

    let balRpc = await web3.eth.getBalance(address).then(parseInt).catch(() => undefined);

    if (balRpc === undefined) {
      const url = `https://explorer.syscoin.org/api?module=account&action=eth_get_balance&address=${address}&tag=latest`;
      const ethBalanceInHex = await fetch(url)
        .then((res) => res.json())
        .then((rpcResp) => rpcResp.result);
      const valueAsNumber = parseInt(ethBalanceInHex, 16);
      if (isNaN(valueAsNumber)) {
        return 0;
      }
      balRpc = valueAsNumber;
    }

    const ethBalance = balRpc / Math.pow(10, 18);
    return ethBalance;
  });
};
