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

const normalizeBaseUnits = (value: string): string => {
  const baseUnits = BigInt(value);
  if (baseUnits < BigInt(0)) {
    throw new Error("Balance cannot be negative");
  }

  return baseUnits.toString();
};

const fetchUtxoBalanceBaseUnits = async (
  xpub: string,
  address?: string,
  assetGuid?: string
): Promise<string> => {
  if (!xpub || isValidEthereumAddress(xpub)) return "0";

  const details = assetGuid && address ? "tokenBalances" : "basic";
  const url = buildApiUrl(
    `/api/utxo/xpub/${encodeURIComponent(xpub)}?details=${details}`
  );
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to load UTXO balance");
  }

  const result: BalanceResp = await response.json();
  if (assetGuid && address) {
    if (!result.tokensAsset) return "0";

    return result.tokensAsset
      .reduce(
        (total, asset) =>
          asset.assetGuid === assetGuid
            ? total + BigInt(asset.balance)
            : total,
        BigInt(0)
      )
      .toString();
  }

  return normalizeBaseUnits(result.balance);
};

export const useUtxoBalance = (
  xpub: string,
  options: Options = { retry: true }
) => {
  const { address, assetGuid, retry } = options;
  const { data: constants } = useConstants();
  return useQuery(
    ["utxo", "balance", xpub, address, assetGuid],
    () => fetchUtxoBalanceBaseUnits(xpub, address, assetGuid),
    {
      retry,
      enabled: Boolean(constants),
      select: (balance: string) => Number(balance) / Math.pow(10, 8),
    }
  );
};

export const useUtxoBalanceBaseUnits = (
  xpub: string,
  options: Options = { retry: true }
) => {
  const { address, assetGuid, retry } = options;
  const { data: constants } = useConstants();
  return useQuery(
    ["utxo", "balance", xpub, address, assetGuid],
    () => fetchUtxoBalanceBaseUnits(xpub, address, assetGuid),
    {
      retry,
      enabled: Boolean(constants),
    }
  );
};

const fetchNevmBalanceBaseUnits = async (
  address: string,
  rpcUrl: string,
  explorerUrl: string
): Promise<string> => {
  const web3 = new Web3(rpcUrl);
  let balance = await web3.eth.getBalance(address).catch(() => undefined);

  if (balance === undefined) {
    const url = `${explorerUrl}/api?module=account&action=eth_get_balance&address=${address}&tag=latest`;
    const response = await fetch(url).then((res) => res.json());
    balance = response.result;
  }

  if (typeof balance !== "string") return "0";

  try {
    return normalizeBaseUnits(balance);
  } catch {
    return "0";
  }
};

export const useNevmBalance = (address?: string) => {
  const { constants } = useConstants();
  return useQuery(
    ["nevm-rpc", "balance", constants?.rpc.nevm, address],
    async () => {
      if (!address) return "0";

      // Balance display is read-only and must not wake or switch the injected
      // wallet when Pali is operating in UTXO mode.
      return fetchNevmBalanceBaseUnits(
        address,
        constants!.rpc.nevm,
        constants!.explorer.nevm
      );
    },
    {
      enabled: Boolean(constants?.rpc.nevm),
      select: (balance: string) => Number(balance) / Math.pow(10, 18),
    }
  );
};

export const useNevmBalanceBaseUnits = (address?: string) => {
  const { constants } = useConstants();
  return useQuery(
    ["nevm-rpc", "balance", constants?.rpc.nevm, address],
    async () => {
      if (!address) return "0";

      return fetchNevmBalanceBaseUnits(
        address,
        constants!.rpc.nevm,
        constants!.explorer.nevm
      );
    },
    {
      enabled: Boolean(constants?.rpc.nevm),
    }
  );
};
