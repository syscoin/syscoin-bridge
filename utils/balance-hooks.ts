import { useConstants } from "@contexts/useConstants";
import { isValidEthereumAddress } from "@pollum-io/sysweb3-utils";
import { useWeb3 } from "components/Bridge/context/Web";

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
  const { data: constants } = useConstants();
  return useQuery(
    ["utxo", "balance", xpub, address, assetGuid],
    async () => {
      if (!xpub || isValidEthereumAddress(xpub)) return Promise.resolve(0);
      // Use proxy route instead of direct external API call to avoid CORS
      const url = "/api/explorer-blockbook/v2/xpub/" + xpub;
      const balanceInText = await fetch(url)
        .then((res) => res.json())
        .then((res: BalanceResp) => {
          if (assetGuid && address) {
            if (!res.tokensAsset) {
              return "0";
            }
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
      enabled: Boolean(constants),
    }
  );
};

export const useNevmBalance = (address?: string) => {
  const web3 = useWeb3();
  const { constants } = useConstants();
  return useQuery(
    ["nevm", "balance", address],
    async () => {
      if (!address) return Promise.resolve(0);

      let balRpc = await web3.eth
        .getBalance(address)
        .then(parseInt)
        .catch(() => undefined);

      if (balRpc === undefined) {
        const url = `${
          constants!.explorer.nevm
        }/api?module=account&action=eth_get_balance&address=${address}&tag=latest`;
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
    },
    {
      enabled: Boolean(constants),
    }
  );
};
