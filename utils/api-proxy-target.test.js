const {
  TESTNET_API_PROXY_TARGET,
  resolveApiProxyTarget,
} = require("./api-proxy-target");

describe("resolveApiProxyTarget", () => {
  it("uses an explicitly configured API target", () => {
    expect(
      resolveApiProxyTarget({
        NEXT_PUBLIC_API_BASE_URL: " https://api.example.test/// ",
        VERCEL_ENV: "preview",
        IS_TESTNET: "true",
      })
    ).toBe("https://api.example.test");
  });

  it("proxies a Vercel testnet preview to the Tanenbaum API", () => {
    expect(
      resolveApiProxyTarget({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_IS_TESTNET: "true",
      })
    ).toBe(TESTNET_API_PROXY_TARGET);
  });

  it("does not proxy a mainnet preview to the production API", () => {
    expect(
      resolveApiProxyTarget({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_IS_TESTNET: "false",
      })
    ).toBe("");
  });

  it("does not override production host-based routing", () => {
    expect(
      resolveApiProxyTarget({
        VERCEL_ENV: "production",
        IS_TESTNET: "true",
      })
    ).toBe("");
  });
});
