import { isAdminRoute } from "./app-route";

describe("isAdminRoute", () => {
  it.each([
    ["/admin", "/admin", true],
    ["/admin/login", "/admin/login", true],
    ["/_error", "/admin", true],
    ["/_error", "/admin?filter=failed", true],
    ["/_error", "/bridge/transfer-id", false],
    ["/administrator", "/administrator", false],
  ])("classifies pathname %s and asPath %s", (pathname, asPath, expected) => {
    expect(isAdminRoute(pathname, asPath)).toBe(expected);
  });
});
