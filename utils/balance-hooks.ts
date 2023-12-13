import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import { isValidEthereumAddress } from "@pollum-io/sysweb3-utils";
import { useWeb3 } from "components/Bridge/v3/context/Web";
import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";
import { useQuery } from "react-query";

interface TokenAsset {
  assetGuid: string;
  name: string;
  symbol: string;
  balance: string;
  decimals: number;
}

interface BalanceResp {
  balance: string;
  tokensAsset: TokenAsset[];
}

type Options = {
  address?: string;
  assetGuid?: string;
  retry?: boolean;
};

export const useUtxoBalance = (
  xpub: string,
  options: Options = { retry: true }
) => {
  const { address, assetGuid, retry } = options;
  return useQuery(
    ["utxo", "balance", xpub, address, assetGuid],
    async () => {
      if (!xpub || isValidEthereumAddress(xpub)) return Promise.resolve(0);
      const url = BlockbookAPIURL + "/api/v2/xpub/" + xpub;
      const balanceInText = await fetch(url)
        .then((res) => res.json())
        .then((res: BalanceResp) => {
          if (assetGuid && address && res.tokensAsset) {
            const total = res.tokensAsset.reduce((acc, asset) => {
              if (asset.assetGuid === assetGuid) {
                return acc + parseInt(asset.balance);
              }
              return acc;
            }, 0);
            return total.toString();
          }
          return res.balance;
        });
      return parseInt(balanceInText) / Math.pow(10, 8);
    },
    {
      retry,
    }
  );
};

export const useNevmBalance = (address?: string) => {
  const web3 = useWeb3();
  return useQuery(["nevm", "balance", address], async () => {
    if (!address) return Promise.resolve(0);

    let balRpc = await web3.eth
      .getBalance(address)
      .then(parseInt)
      .catch(() => undefined);

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
