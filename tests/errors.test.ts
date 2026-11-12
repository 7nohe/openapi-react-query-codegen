import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import type { LimitedUserConfig } from "../src/cli.mts";
import {
  CodegenError,
  ErrorCodes,
  formatErrorJson,
  formatErrorText,
  toCodegenError,
} from "../src/errors.mjs";
import { generate, mapClientError } from "../src/generate.mjs";

describe("toCodegenError", () => {
  test("passes CodegenError through", () => {
    const error = new CodegenError(ErrorCodes.inputNotFound, "missing");
    expect(toCodegenError(error)).toBe(error);
  });

  test("wraps unexpected errors as GENERATION_FAILED", () => {
    const cause = new TypeError("boom");
    const error = toCodegenError(cause);
    expect(error.code).toBe(ErrorCodes.generationFailed);
    expect(error.message).toBe("boom");
    expect(error.details).toEqual({ name: "TypeError" });
    expect(error.cause).toBe(cause);
  });

  test("wraps non-Error values", () => {
    const error = toCodegenError("string failure");
    expect(error.code).toBe(ErrorCodes.generationFailed);
    expect(error.message).toBe("string failure");
    expect(error.details).toEqual({});
  });
});

describe("formatErrorJson", () => {
  test("prints exactly code, message and details on one line", () => {
    const error = new CodegenError(
      ErrorCodes.inputNotFound,
      "missing",
      { input: "a.yaml" },
      { cause: new Error("hidden") },
    );
    const text = formatErrorJson(error);
    expect(text).not.toContain("\n");
    expect(JSON.parse(text)).toEqual({
      code: "INPUT_NOT_FOUND",
      message: "missing",
      details: { input: "a.yaml" },
    });
  });
});

describe("formatErrorText", () => {
  test("prints code and message", () => {
    expect(
      formatErrorText(new CodegenError(ErrorCodes.inputNotFound, "missing")),
    ).toBe("error [INPUT_NOT_FOUND]: missing");
  });

  test("keeps the stack trace for unexpected failures", () => {
    const cause = new Error("boom");
    expect(formatErrorText(toCodegenError(cause))).toBe(
      `error [GENERATION_FAILED]: ${cause.stack}`,
    );
  });

  test("falls back to the message when there is no stack", () => {
    const cause = new Error("boom");
    cause.stack = undefined;
    expect(formatErrorText(toCodegenError(cause))).toBe(
      "error [GENERATION_FAILED]: boom",
    );
  });
});

describe("mapClientError", () => {
  test("passes CodegenError through", () => {
    const error = new CodegenError(ErrorCodes.inputNotFound, "missing");
    expect(mapClientError(error, "a.yaml")).toBe(error);
  });

  test("maps InputError to INPUT_NOT_FOUND", () => {
    const error = Object.assign(new Error("Input file not found"), {
      name: "InputError",
    });
    expect(mapClientError(error, "a.yaml")).toMatchObject({
      code: ErrorCodes.inputNotFound,
      details: { input: "a.yaml", reason: "Input file not found" },
    });
  });

  test("maps a parser JobError to INPUT_PARSE_ERROR", () => {
    const error = Object.assign(new Error(""), {
      name: "JobError",
      originalError: {
        error: { code: "EPARSER", message: "bad yaml" },
        jobIndex: 0,
      },
    });
    expect(mapClientError(error, "a.yaml")).toMatchObject({
      code: ErrorCodes.inputParseError,
      details: { input: "a.yaml", reason: "bad yaml" },
    });
  });

  test("maps other failures to CLIENT_GENERATION_FAILED", () => {
    const error = Object.assign(new Error(""), {
      name: "JobError",
      originalError: { error: { message: "plugin crashed" } },
    });
    expect(mapClientError(error, "a.yaml")).toMatchObject({
      code: ErrorCodes.clientGenerationFailed,
      message:
        "@hey-api/openapi-ts failed to generate the client: plugin crashed",
      details: { input: "a.yaml", reason: "plugin crashed", name: "JobError" },
    });
  });

  test("handles non-Error values and hides inline specs", () => {
    expect(mapClientError(null, "openapi: 3.0.0\npaths: {}")).toMatchObject({
      code: ErrorCodes.clientGenerationFailed,
      details: {
        input: "(inline specification)",
        reason: "null",
        name: "Error",
      },
    });
  });
});

describe("generate errors", () => {
  const badSpec = path.join(__dirname, "inputs", "broken-for-errors.yaml");
  const baseOptions: LimitedUserConfig = {
    input: "",
    output: path.join("tests", "outputs-errors"),
    client: "@hey-api/client-fetch",
    pageParam: "page",
    nextPageParam: "nextPage",
    initialPageParam: "1",
  };
  const crashLogs = () =>
    readdirSync(process.cwd()).filter((name) =>
      name.startsWith("openapi-ts-error-"),
    );

  afterAll(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(badSpec, { force: true });
    await rm(path.join(__dirname, "outputs-errors"), {
      recursive: true,
      force: true,
    });
  });

  test("a missing input is INPUT_NOT_FOUND instead of an ENOENT crash", async () => {
    await expect(
      generate(
        {
          ...baseOptions,
          input: path.join(__dirname, "inputs", "nope.yaml"),
        },
        "1.0.0",
        { silent: true },
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.inputNotFound });
  });

  test("a failure after client generation is still a CodegenError", async () => {
    // `queries` is a regular file, so writing the hooks fails with ENOTDIR.
    const output = path.join("tests", "outputs-errors");
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "queries"), "");

    const error = await generate(
      {
        ...baseOptions,
        input: path.join(__dirname, "inputs", "petstore.yaml"),
        output,
      },
      "1.0.0",
      { silent: true },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CodegenError);
    expect(error).toMatchObject({
      code: ErrorCodes.generationFailed,
      // ENOTDIR on POSIX, ENOENT on Windows.
      cause: { code: expect.stringMatching(/^E(NOTDIR|NOENT)$/) },
    });
  });

  test("an unparsable input is INPUT_PARSE_ERROR and silent mode writes no crash log", async () => {
    await writeFile(badSpec, "openapi: 3.0.0\ninfo: [broken\n");
    const before = crashLogs();
    await expect(
      generate({ ...baseOptions, input: badSpec }, "1.0.0", { silent: true }),
    ).rejects.toMatchObject({ code: ErrorCodes.inputParseError });
    expect(crashLogs()).toEqual(before);
  });
});
