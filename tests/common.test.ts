import {
  type ClassDeclaration,
  Project,
  type SourceFile,
  type VariableDeclaration,
} from "ts-morph";
import { factory } from "typescript";
import { describe, expect, test, vi } from "vitest";
import type { LimitedUserConfig } from "../src/cli.mts";
import {
  BuildCommonTypeName,
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  capitalizeFirstLetter,
  exists,
  extractPropertiesFromObjectParam,
  formatOptions,
  getClassNameFromClassNode,
  getClassesFromService,
  getNameFromVariable,
  getShortType,
  getVariableArrowFunctionParameters,
  lowercaseFirstLetter,
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

  test("buildCommonTypeName - identifier", () => {
    const name = factory.createIdentifier("Name");
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

    test("json", () => {
      const type =
        '{ import1?: import("/path/to/import1").Import1; import2: import("/path/to/import2").Import2; import3: import("/path/to/import3").Import3; }';
      const result = getShortType(type);
      expect(result).toBe(
        "{ import1?: Import1; import2: Import2; import3: Import3; }",
      );
    });
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

  test("getClassNameFromClassNode - get's name", () => {
    const klass = {
      getName: () => "Test",
    } as unknown as ClassDeclaration;
    const result = getClassNameFromClassNode(klass);
    expect(result).toBe("Test");
  });

  test("getClassNameFromClassNode - no name", () => {
    const klass = {
      getName: () => undefined,
    } as unknown as ClassDeclaration;
    expect(() => getClassNameFromClassNode(klass)).toThrowError(
      "Class name not found",
    );
  });

  test("getClassesFromService - returns class name and class", () => {
    const klass = {
      getName: vi.fn(() => "Test"),
    };
    const node = {
      getClasses: vi.fn(() => [klass]),
    } as unknown as SourceFile;
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
    } as unknown as SourceFile;
    expect(() => getClassesFromService(node)).toThrowError("No classes found");
  });

  test("getClassesFromService - no name", () => {
    const klass = {
      getName: vi.fn(() => undefined),
    };
    const node = {
      getClasses: vi.fn(() => [klass]),
    } as unknown as SourceFile;
    expect(() => getClassesFromService(node)).toThrowError(
      "Class name not found",
    );
  });

  test("getNameFromMethod - get method name", () => {
    const method = {
      getName: vi.fn(() => "test"),
    } as unknown as VariableDeclaration;
    const result = getNameFromVariable(method);
    expect(result).toBe("test");
  });

  test("getNameFromMethod - no method name", () => {
    const method = {
      getName: vi.fn(() => undefined),
    } as unknown as VariableDeclaration;
    expect(() => getNameFromVariable(method)).toThrowError(
      "Variable name not found",
    );
  });

  test("getVariableArrowFunctionParameters", async () => {
    const source = "const test = (queryClient: QueryClient) => {}";
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);
    const method = sourceFile.getVariableDeclarations()[0];
    const result = getVariableArrowFunctionParameters(method);
    expect(result[0].getName()).toStrictEqual("queryClient");
  });

  test('getVariableArrowFunctionParameters - throw error "Initializer is not an arrow function"', async () => {
    const source = 'const foo = "bar"';
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);
    const method = sourceFile.getVariableDeclarations()[0];
    expect(() => getVariableArrowFunctionParameters(method)).toThrowError(
      "Initializer is not an arrow function",
    );
  });

  test('getVariableArrowFunctionParameters - throw error "Initializer not found"', async () => {
    const source = "const foo";
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);
    const method = sourceFile.getVariableDeclarations()[0];
    expect(() => getVariableArrowFunctionParameters(method)).toThrowError(
      "Initializer not found",
    );
  });

  test("extractPropertiesFromObjectParam", async () => {
    const source = `
    type Params = { limit: number; offset: number; };
    const test = (params: Params) => {}
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);
    const method = sourceFile.getVariableDeclarations()[0];
    const params = getVariableArrowFunctionParameters(method);
    const props = extractPropertiesFromObjectParam(params[0]);
    expect(props.map((p) => p.name)).toStrictEqual(["limit", "offset"]);
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
