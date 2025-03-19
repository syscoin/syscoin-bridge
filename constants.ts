export const MIN_AMOUNT = 0.01;
export const DEFAULT_GAS_LIMIT = 120_000;

export const RELAY_CONTRACT_ADDRESS =
  process.env.SYS5_ENABLED === "true"
    ? process.env.RELAY_CONTRACT_ADDRESS
    : "0xd714E7915362FF89388025F584726E6dF26D20f9";

export const ERC20_MANAGER_CONTRACT_ADDRESS =
  process.env.SYS5_ENABLED === "true"
    ? process.env.ERC20_MANAGER_CONTRACT_ADDRESS
    : "0x7904299b3D3dC1b03d1DdEb45E9fDF3576aCBd5f";

export const SYSCOIN_TX_BLOCKCHAIN_URL = "https://blockbook.syscoin.org/tx/";
export const NEVM_TX_BLOCKCHAIN_URL = "https://explorer.syscoin.org/tx/";

export const ADMIN_LOGIN_MESSAGE = "Login to Syscoin Bridge Admin";
