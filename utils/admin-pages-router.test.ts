import { readFileSync } from "fs";
import { join } from "path";

describe("admin Pages Router components", () => {
  it.each([
    "pages/admin/index.tsx",
    "components/Admin/Transfer/Filters.tsx",
  ])("does not import App Router hooks in %s", (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");

    expect(source).toContain('from "next/router"');
    expect(source).not.toContain('from "next/navigation"');
  });

  it.each(["pages/admin/index.tsx", "pages/admin/transfer/[id].tsx"])(
    "delegates session validation to the backend in %s",
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");

      expect(source).not.toContain("withSessionSsr");
      expect(source).toContain("response.status === 401");
    }
  );

  it.each(["pages/admin/index.tsx", "pages/admin/transfer/[id].tsx"])(
    "uses only the configured internal API origin in %s",
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");

      expect(source).toContain("buildInternalApiUrl");
      expect(source).not.toContain('req.headers["x-forwarded-proto"]');
      expect(source).not.toContain("req.headers.host");
      expect(source).not.toContain("fallbackOrigin");
    }
  );

  it("returns the authenticated user with the transfer list", () => {
    const source = readFileSync(
      join(process.cwd(), "pages/api/admin/transfers/index.ts"),
      "utf8"
    );

    expect(source).toContain("user: req.session.user");
  });
});
