import { describe, expect, test, vi } from "vitest";
import {
  BuildCommonTypeName,
  capitalizeFirstLetter,
  lowercaseFirstLetter,
  safeParseNumber,
  getShortType,
  formatOptions,
  getClassNameFromClassNode,
  getClassesFromService,
  getNameFromMethod,
} from "../src/common.mts";
import { LimitedUserConfig } from "../src/cli.mts";

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

  test("buildCommonTypeName", () => {
    const name = "Name";
    const result = BuildCommonTypeName(name);
    expect(result.escapedText).toBe("Common.Name");
  });

  describe("getShortType", () => {
    test("linux", () => {
      const type = 'import("/my/absolute/path").MyType';
      const result = getShortType(type);
      expect(result).toBe("MyType");
    });

    test("no import", () => {
      const type = "MyType";
      const result = getShortType(type);
      expect(result).toBe("MyType");
    });

    test("windows", () => {
      const type = 'import("D:/types.gen").MyType';
      const result = getShortType(type);
      expect(result).toBe("MyType");
    });

    test("number", () => {
      const type = 'import("C:/Projekt/test_3.0/path").MyType';
      const result = getShortType(type);
      expect(result).toBe("MyType");
    });

    test("underscore", () => {
      const type = 'import("C:/Projekt/test_one/path").MyType';
      const result = getShortType(type);
      expect(result).toBe("MyType");
    });

    test("dash", () => {
      const type = 'import("C:/Projekt/test-one/path").MyType';
      const result = getShortType(type);
      expect(result).toBe("MyType");
    });
  });

  test("formatOptions - converts string boolean to boolean (false)", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: "false" as any,
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(false);
  });

  test("formatOptions - converts string boolean to boolean (true)", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: "true" as any,
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(true);
  });

  test("formatOptions - converts string boolean to boolean (undefined)", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(undefined);
  });

  test("formatOptions - converts string number to number", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: "123" as any,
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(123);
  });

  test("formatOptions - leaves other values unchanged", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: "123" as any,
      lint: "eslint",
    };
    const formatted = formatOptions(options);

    expect(formatted.lint).toStrictEqual("eslint");
  });

  test("formatOptions - converts string number to number", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: Number.NaN as any,
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(Number.NaN);
  });

  test("formatOptions - handle boolean true", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: true,
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(true);
  });

  test("formatOptions - handle boolean false", () => {
    const options: LimitedUserConfig = {
      input: "input",
      output: "output",
      debug: false,
    };
    const formatted = formatOptions(options);

    expect(formatted.debug).toStrictEqual(false);
  });

  test("getClassNameFromClassNode - get's name", () => {
    const klass = {
      getName: () => "Test",
    } as any;
    const result = getClassNameFromClassNode(klass);
    expect(result).toBe("Test");
  });

  test("getClassNameFromClassNode - no name", () => {
    const klass = {
      getName: () => undefined,
    } as any;
    expect(() => getClassNameFromClassNode(klass)).toThrowError(
      "Class name not found"
    );
  });

  test("getClassesFromService - returns class name and class", () => {
    const klass = {
      getName: vi.fn(() => "Test"),
    };
    const node = {
      getClasses: vi.fn(() => [klass]),
    } as any;
    const result = getClassesFromService(node);
    expect(result).toStrictEqual([
      {
        className: "Test",
        klass,
      },
    ]);
  });

  test("getClassesFromService - no classes", () => {
    const node = {
      getClasses: vi.fn(() => []),
    } as any;
    expect(() => getClassesFromService(node)).toThrowError("No classes found");
  });

  test("getClassesFromService - no name", () => {
    const klass = {
      getName: vi.fn(() => undefined),
    };
    const node = {
      getClasses: vi.fn(() => [klass]),
    } as any;
    expect(() => getClassesFromService(node)).toThrowError(
      "Class name not found"
    );
  });

  test("getNameFromMethod - get method name", () => {
    const method = {
      getName: vi.fn(() => "test"),
    } as any;
    const result = getNameFromMethod(method);
    expect(result).toBe("test");
  });

  test("getNameFromMethod - no method name", () => {
    const method = {
      getName: vi.fn(() => undefined),
    } as any;
    expect(() => getNameFromMethod(method)).toThrowError(
      "Method name not found"
    );
  });
});
