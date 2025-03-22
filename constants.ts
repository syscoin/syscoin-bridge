export const MIN_AMOUNT = 0.01;
export const DEFAULT_GAS_LIMIT = 120_000;

export const RELAY_CONTRACT_ADDRESS =
  process.env.SYS5_ENABLED === "true"
    ? process.env.RELAY_CONTRACT_ADDRESS
    : "0xD822557aC2F2b77A1988617308e4A29A89Cb95A6";

export const ERC20_MANAGER_CONTRACT_ADDRESS =
  process.env.SYS5_ENABLED === "true"
    ? process.env.ERC20_MANAGER_CONTRACT_ADDRESS
    : "0xA738a563F9ecb55e0b2245D1e9E380f0fE455ea1";

export const ADMIN_LOGIN_MESSAGE = "Login to Syscoin Bridge Admin";
