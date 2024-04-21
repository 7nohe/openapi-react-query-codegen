import { describe, expect, test } from "vitest";
import { safeParseNumber } from "../src/common.mts";

describe("common", () => {
  test("safeParseNumber", () => {
    const parsed = safeParseNumber("123");
    expect(parsed).toBe(123);

    const nan = safeParseNumber("abc");
    expect(nan).toBeNaN();
  });
});