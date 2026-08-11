import { buildInternalApiUrl } from "./api-base-url";

describe("buildInternalApiUrl", () => {
  const originalInternalApiBaseUrl = process.env.INTERNAL_API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    if (originalInternalApiBaseUrl === undefined) {
      delete process.env.INTERNAL_API_BASE_URL;
    } else {
      process.env.INTERNAL_API_BASE_URL = originalInternalApiBaseUrl;
    }

    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
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
