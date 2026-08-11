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
});
