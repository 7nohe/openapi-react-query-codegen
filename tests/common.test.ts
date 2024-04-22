import { describe, expect, test } from "vitest";
import { BuildCommonTypeName, capitalizeFirstLetter, lowercaseFirstLetter, safeParseNumber } from "../src/common.mts";

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
  });

  test("capitalizeFirstLetter", () => {
    const capitalized = capitalizeFirstLetter("testTestTest");
    expect(capitalized).toBe("TestTestTest");
  });

  test("lowercaseFirstLetter", () => {
    const lowercased = lowercaseFirstLetter("TestTestTest");
    expect(lowercased).toBe("testTestTest");
  });

  test('buildCommonTypeName', () => {
    const name = 'Name';
    const result = BuildCommonTypeName(name);
    expect(result.escapedText).toBe('Common.Name');
  });
});
