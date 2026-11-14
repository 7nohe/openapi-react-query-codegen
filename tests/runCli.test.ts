import { describe, expect, test, vi } from "vitest";
import type { CheckResult } from "../src/check.mjs";
import { CodegenError, ErrorCodes } from "../src/errors.mjs";
import { type CliDependencies, runCli } from "../src/runCli.mjs";

function setup(overrides: Partial<CliDependencies> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const dependencies: CliDependencies = {
    generate: vi.fn(async () => {}),
    check: vi.fn(
      async (): Promise<CheckResult> => ({ upToDate: true, files: [] }),
    ),
    ...overrides,
  };
  const run = (...args: string[]) =>
    runCli(
      ["node", "openapi-rq", ...args],
      "9.9.9",
      { stdout: (text) => out.push(text), stderr: (text) => err.push(text) },
      dependencies,
    );
  return {
    run,
    dependencies,
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
}

const driftFiles: CheckResult["files"] = [
  { path: "openapi/queries/queries.ts", status: "modified" },
  { path: "openapi/requests/old.gen.ts", status: "removed" },
];

describe("runCli", () => {
  test("--version and --help exit 0", async () => {
    const version = setup();
    expect(await version.run("--version")).toBe(0);
    expect(version.stdout()).toBe("9.9.9\n");

    const help = setup();
    expect(await help.run("--help", "--json")).toBe(0);
    expect(help.stdout()).toContain("--check");
    expect(help.stderr()).toBe("");
  });

  test("generates and strips CLI-only flags from the options", async () => {
    const cli = setup();
    expect(await cli.run("-i", "spec.yaml", "--json")).toBe(0);
    expect(cli.dependencies.generate).toHaveBeenCalledWith(
      expect.not.objectContaining({ json: expect.anything() }),
      "9.9.9",
      { silent: true },
    );
    expect(cli.dependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({ input: "spec.yaml", output: "openapi" }),
      "9.9.9",
      { silent: true },
    );
  });

  test("--agentsMd takes an optional file name", async () => {
    const bare = setup();
    expect(await bare.run("-i", "spec.yaml", "--agentsMd")).toBe(0);
    expect(bare.dependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({ agentsMd: true }),
      "9.9.9",
      { silent: false },
    );

    const named = setup();
    expect(
      await named.run("-i", "spec.yaml", "--agentsMd", "CLAUDE.md", "--check"),
    ).toBe(0);
    expect(named.dependencies.check).toHaveBeenCalledWith(
      expect.objectContaining({ agentsMd: "CLAUDE.md" }),
      "9.9.9",
    );

    const off = setup();
    expect(await off.run("-i", "spec.yaml")).toBe(0);
    expect(off.dependencies.generate).toHaveBeenCalledWith(
      expect.not.objectContaining({ agentsMd: expect.anything() }),
      "9.9.9",
      { silent: false },
    );
  });

  test("--mock takes the mocking library", async () => {
    const cli = setup();
    expect(await cli.run("-i", "spec.yaml", "--mock", "msw")).toBe(0);
    expect(cli.dependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({ mock: "msw" }),
      "9.9.9",
      { silent: false },
    );

    const unknown = setup();
    expect(await unknown.run("-i", "spec.yaml", "--mock", "nock")).toBe(2);
    expect(unknown.stderr()).toContain("--mock");
    expect(unknown.dependencies.generate).not.toHaveBeenCalled();
  });

  test("does not silence the generator in the default mode", async () => {
    const cli = setup();
    expect(await cli.run("-i", "spec.yaml")).toBe(0);
    expect(cli.dependencies.generate).toHaveBeenCalledWith(
      expect.anything(),
      "9.9.9",
      { silent: false },
    );
  });

  test("passes the date and schema options on", async () => {
    const cli = setup();
    expect(
      await cli.run(
        "-i",
        "spec.yaml",
        "--useDateType",
        "--noSchemas",
        "--schemaType",
        "form",
      ),
    ).toBe(0);
    expect(cli.dependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        useDateType: true,
        noSchemas: true,
        schemaType: "form",
      }),
      "9.9.9",
      { silent: false },
    );

    const invalid = setup();
    expect(await invalid.run("-i", "spec.yaml", "--schemaType", "xml")).toBe(2);
    expect(invalid.dependencies.generate).not.toHaveBeenCalled();
  });

  describe("argument errors", () => {
    test("exit 2 with commander's message in text mode", async () => {
      const cli = setup();
      expect(await cli.run("-i", "spec.yaml", "-c", "nope")).toBe(2);
      expect(cli.stderr()).toContain("error: option '-c, --client <value>'");
      expect(cli.dependencies.generate).not.toHaveBeenCalled();
    });

    test("exit 2 with a single JSON line in --json mode", async () => {
      const cli = setup();
      expect(await cli.run("--json")).toBe(2);
      const lines = cli.stderr().trimEnd().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual({
        code: "INVALID_ARGUMENT",
        message: "required option '-i, --input <value>' not specified",
        details: { commanderCode: "commander.missingMandatoryOptionValue" },
      });
    });
  });

  describe("generation errors", () => {
    const failing = () =>
      setup({
        generate: vi.fn(async () => {
          throw new CodegenError(ErrorCodes.inputNotFound, "missing", {
            input: "spec.yaml",
          });
        }),
      });

    test("exit 2 with a readable line in text mode", async () => {
      const cli = failing();
      expect(await cli.run("-i", "spec.yaml")).toBe(2);
      expect(cli.stderr()).toBe("error [INPUT_NOT_FOUND]: missing\n");
    });

    test("exit 2 with JSON in --json mode", async () => {
      const cli = failing();
      expect(await cli.run("-i", "spec.yaml", "--json")).toBe(2);
      expect(JSON.parse(cli.stderr())).toEqual({
        code: "INPUT_NOT_FOUND",
        message: "missing",
        details: { input: "spec.yaml" },
      });
    });

    test("unexpected errors become GENERATION_FAILED", async () => {
      const cli = setup({
        generate: vi.fn(async () => {
          throw new Error("boom");
        }),
      });
      expect(await cli.run("-i", "spec.yaml", "--json")).toBe(2);
      expect(JSON.parse(cli.stderr())).toMatchObject({
        code: "GENERATION_FAILED",
        message: "boom",
      });
    });
  });

  describe("--check", () => {
    test("exit 0 when up to date and never calls generate", async () => {
      const cli = setup();
      expect(await cli.run("-i", "spec.yaml", "--check")).toBe(0);
      expect(cli.stdout()).toBe("✔ Generated output is up to date.\n");
      expect(cli.dependencies.generate).not.toHaveBeenCalled();
      expect(cli.dependencies.check).toHaveBeenCalledWith(
        expect.not.objectContaining({ check: expect.anything() }),
        "9.9.9",
      );
    });

    test("exit 1 and lists the files in text mode", async () => {
      const cli = setup({
        check: vi.fn(async () => ({ upToDate: false, files: driftFiles })),
      });
      expect(await cli.run("-i", "spec.yaml", "--check")).toBe(1);
      expect(cli.stderr()).toBe(
        [
          "error [OUTPUT_OUT_OF_DATE]: Generated output is out of date (2 files differ). Re-run orqc without --check to update it.",
          "  modified openapi/queries/queries.ts",
          "  removed  openapi/requests/old.gen.ts",
          "",
        ].join("\n"),
      );
    });

    test("exit 1 with OUTPUT_OUT_OF_DATE JSON in --json mode", async () => {
      const cli = setup({
        check: vi.fn(async () => ({ upToDate: false, files: driftFiles })),
      });
      expect(await cli.run("-i", "spec.yaml", "--check", "--json")).toBe(1);
      expect(JSON.parse(cli.stderr())).toMatchObject({
        code: "OUTPUT_OUT_OF_DATE",
        details: { files: driftFiles },
      });
    });

    test("exit 2 when the check itself fails", async () => {
      const cli = setup({
        check: vi.fn(async () => {
          throw new CodegenError(ErrorCodes.inputParseError, "bad");
        }),
      });
      expect(await cli.run("-i", "spec.yaml", "--check", "--json")).toBe(2);
      expect(JSON.parse(cli.stderr()).code).toBe("INPUT_PARSE_ERROR");
    });
  });

  test("rethrows non-commander parse failures", async () => {
    const cli = setup();
    const spy = vi
      .spyOn(
        await import("commander").then((m) => m.Command.prototype),
        "parse",
      )
      .mockImplementationOnce(() => {
        throw new Error("unexpected");
      });
    await expect(cli.run("-i", "spec.yaml")).rejects.toThrow("unexpected");
    spy.mockRestore();
  });
});
