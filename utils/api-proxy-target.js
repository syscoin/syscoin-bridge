const TESTNET_API_PROXY_TARGET = "https://bridge-api.tanenbaum.io";

const stripTrailingSlashes = (value) => value.replace(/\/+$/, "");

const resolveApiProxyTarget = (env = process.env) => {
  const configuredTarget = (env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (configuredTarget) {
    return stripTrailingSlashes(configuredTarget);
  }

  const isTestnetBuild =
    env.NEXT_PUBLIC_IS_TESTNET === "true" || env.IS_TESTNET === "true";
  if (env.VERCEL_ENV === "preview" && isTestnetBuild) {
    return TESTNET_API_PROXY_TARGET;
  }

  return "";
};

module.exports = {
  TESTNET_API_PROXY_TARGET,
  resolveApiProxyTarget,
};
