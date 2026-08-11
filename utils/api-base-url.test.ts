import { buildInternalApiUrl } from "./api-base-url";

describe("buildInternalApiUrl", () => {
  const envNames = [
    "INTERNAL_API_BASE_URL",
    "NEXT_PUBLIC_API_BASE_URL",
    "VERCEL_ENV",
    "IS_TESTNET",
    "NEXT_PUBLIC_IS_TESTNET",
  ] as const;
  const originalEnv = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]])
  );

  afterEach(() => {
    for (const name of envNames) {
      const value = originalEnv[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("builds an absolute URL from the configured internal API origin", () => {
    process.env.INTERNAL_API_BASE_URL = " https://api.example.test/// ";
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://public.example.test";

    expect(buildInternalApiUrl("api/admin/transfers?page=2")).toBe(
      "https://api.example.test/api/admin/transfers?page=2"
    );
  });

  it("fails closed when the internal API origin is missing", () => {
    delete process.env.INTERNAL_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.IS_TESTNET;
    delete process.env.NEXT_PUBLIC_IS_TESTNET;

    expect(() => buildInternalApiUrl("/api/admin/transfers")).toThrow(
      "INTERNAL_API_BASE_URL is required for server-side API requests"
    );
  });

  it("uses the trusted proxy target for a testnet Vercel preview", () => {
    delete process.env.INTERNAL_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_IS_TESTNET = "true";

    expect(buildInternalApiUrl("/api/admin/transfers")).toBe(
      "https://bridge-api.tanenbaum.io/api/admin/transfers"
    );
  });

  it("fails closed for a mainnet Vercel preview without a target", () => {
    delete process.env.INTERNAL_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_IS_TESTNET = "false";

    expect(() => buildInternalApiUrl("/api/admin/transfers")).toThrow(
      "INTERNAL_API_BASE_URL is required for server-side API requests"
    );
  });

  it.each(["file:///tmp/bridge", "javascript:alert(1)"])(
    "rejects a non-HTTP internal API origin: %s",
    (baseUrl) => {
      process.env.INTERNAL_API_BASE_URL = baseUrl;

      expect(() => buildInternalApiUrl("/api/admin/transfers")).toThrow(
        "INTERNAL_API_BASE_URL must use HTTP or HTTPS"
      );
    }
  );
});
