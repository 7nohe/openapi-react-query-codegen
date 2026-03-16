import { beforeEach, describe, expect, test, vi } from "vitest";
import { processOutput } from "../src/format.mjs";

vi.mock("cross-spawn", () => ({
  sync: vi.fn(),
}));

describe("processOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("runs prettier formatter", async () => {
    const { sync } = await import("cross-spawn");
    await processOutput({ output: "/tmp/test", format: "prettier" });
    expect(sync).toHaveBeenCalledWith("prettier", [
      "--ignore-unknown",
      "/tmp/test",
      "--write",
      "--ignore-path",
      "./.prettierignore",
    ]);
  });

  test("runs eslint linter", async () => {
    const { sync } = await import("cross-spawn");
    await processOutput({ output: "/tmp/test", lint: "eslint" });
    expect(sync).toHaveBeenCalledWith("eslint", ["/tmp/test", "--fix"]);
  });

  test("runs biome formatter", async () => {
    const { sync } = await import("cross-spawn");
    await processOutput({ output: "/tmp/test", format: "biome" });
    expect(sync).toHaveBeenCalledWith("biome", [
      "format",
      "--write",
      "/tmp/test",
    ]);
  });

  test("runs biome linter", async () => {
    const { sync } = await import("cross-spawn");
    await processOutput({ output: "/tmp/test", lint: "biome" });
    expect(sync).toHaveBeenCalledWith("biome", [
      "lint",
      "--write",
      "/tmp/test",
    ]);
  });

  test("does nothing without format or lint", async () => {
    const { sync } = await import("cross-spawn");
    await processOutput({ output: "/tmp/test" });
    expect(sync).not.toHaveBeenCalled();
  });
});
