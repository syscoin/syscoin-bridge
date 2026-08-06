import { isValidEthereumAddress } from "@sidhujag/sysweb3-utils";

/**
 * Return an authoritative EVM account update from an accountsChanged payload.
 * Undefined means the payload belongs to the UTXO provider instead.
 */
export const getNevmAccountUpdateFromEvent = (
  accounts: unknown,
  isEvmMode: boolean
): string | null | undefined => {
  const accountList = Array.isArray(accounts)
    ? accounts
    : accounts === null || accounts === undefined
    ? []
    : [accounts];

  if (accountList.length === 0) {
    return isEvmMode ? null : undefined;
  }

  const account = accountList[0];
  return typeof account === "string" && isValidEthereumAddress(account)
    ? account
    : undefined;
};
