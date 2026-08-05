import { useConstants } from "@contexts/useConstants";
import { isValidEthereumAddress } from "@sidhujag/sysweb3-utils";
import Web3 from "web3";

import { useQuery } from "react-query";
import { buildApiUrl } from "./api-base-url";

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
      const details = assetGuid && address ? "tokenBalances" : "basic";
      const url = buildApiUrl(
        `/api/utxo/xpub/${encodeURIComponent(xpub)}?details=${details}`
      );
      const balanceInText = await fetch(url)
        .then((res) => {
          if (!res.ok) {
            throw new Error("Unable to load UTXO balance");
          }
          return res.json();
        })
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
  const { constants } = useConstants();
  return useQuery(
    ["nevm-rpc", "balance", constants?.rpc.nevm, address],
    async () => {
      if (!address) return Promise.resolve(0);

      // Balance display is read-only and must not wake or switch the injected
      // wallet when Pali is operating in UTXO mode.
      const web3 = new Web3(constants!.rpc.nevm);
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
      enabled: Boolean(constants?.rpc.nevm),
    }
  );
};
