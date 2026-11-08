import { describe, expect, test } from "vitest";
import type { LimitedUserConfig } from "../src/cli.mts";
import {
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  exists,
  formatOptions,
  safeParseNumber,
} from "../src/common.mts";

describe("common", () => {
  test("safeParseNumber", () => {
    const parsed = safeParseNumber("123");
    expect(parsed).toBe(123);

    const nan = safeParseNumber("abc");
    expect(nan).toBeNaN();

    const trueVal = safeParseNumber(true);
    expect(trueVal).toBe(1);

    const falseVal = safeParseNumber(false);
    expect(falseVal).toBe(0);

    const emptyString = safeParseNumber("");
    expect(emptyString).toBeNaN();

    const blankString = safeParseNumber("   ");
    expect(blankString).toBeNaN();
  });

  test("formatOptions - converts string boolean to boolean (false)", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      // biome-ignore lint: test
      debug: "false" as any,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(false);
  });

  test("formatOptions - converts string boolean to boolean (true)", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      // biome-ignore lint: test
      debug: "true" as any,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(true);
  });

  test("formatOptions - converts string boolean to boolean (undefined)", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(undefined);
  });

  test("formatOptions - converts string number to number", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      // biome-ignore lint: test
      debug: "123" as any,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(123);
  });

  test("formatOptions - preserves a blank initial page parameter", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "",
    };
    const formatted = formatOptions(options);

    expect(formatted.initialPageParam).toBe("");
  });

  test("formatOptions - leaves other values unchanged", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      // biome-ignore lint: test
      debug: "123" as any,
      lint: "eslint",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.lint).toStrictEqual("eslint");
  });

  test("formatOptions - converts string number to number", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      // biome-ignore lint: test
      debug: Number.NaN as any,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(Number.NaN);
  });

  test("formatOptions - handle boolean true", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: true,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(true);
  });

  test("formatOptions - handle boolean false", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: false,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(false);
  });

  test("exists - file exists", async () => {
    const f = "tests/common.test.ts";
    const result = await exists(f);
    expect(result).toBe(true);
  });

  test("exists - file does not exist", async () => {
    const f = "tests/nonexistent.test.ts";
    const result = await exists(f);
    expect(result).toBe(false);
  });

  test("buildRequestsOutputPath", async () => {
    const output = "output";
    const result = buildRequestsOutputPath(output);
    // windows: output\requests | linux/mac: output/requests
    expect(result).toMatch(/output[/\\]requests/);
  });

  test("buildQueriesOutputPath", async () => {
    const output = "output";
    const result = buildQueriesOutputPath(output);
    // windows: output\queries | linux/mac: output/queries
    expect(result).toMatch(/output[/\\]queries/);
  });
});
