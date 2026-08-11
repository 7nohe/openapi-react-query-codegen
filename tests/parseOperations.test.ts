import { Project } from "ts-morph";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildGenerationContext,
  parseOperations,
} from "../src/parseOperations.mjs";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";

const fileName = "parseOperations";

describe("parseOperations", () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  describe("parseOperations", () => {
    it("should parse GET operations", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");

      const getOps = operations.filter((op) => op.httpMethod === "GET");
      expect(getOps.length).toBeGreaterThan(0);

      const findPets = operations.find((op) => op.methodName === "findPets");
      expect(findPets).toBeDefined();
      expect(findPets?.httpMethod).toBe("GET");
      expect(findPets?.capitalizedMethodName).toBe("FindPets");
      // Read from the SDK signature's Options<XData, ThrowOnError> type argument
      expect(findPets?.dataTypeName).toBe("FindPetsData");
    });

    it("should parse POST operations", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");

      const postOps = operations.filter((op) => op.httpMethod === "POST");
      expect(postOps.length).toBeGreaterThan(0);

      const addPet = operations.find((op) => op.methodName === "addPet");
      expect(addPet).toBeDefined();
      expect(addPet?.httpMethod).toBe("POST");
    });

    it("should parse DELETE operations", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");

      const deletePet = operations.find((op) => op.methodName === "deletePet");
      expect(deletePet).toBeDefined();
      expect(deletePet?.httpMethod).toBe("DELETE");
    });

    it("should parse all GET operations as potentially paginatable", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");

      // findPaginatedPets should exist and be a GET operation
      const findPaginatedPets = operations.find(
        (op) => op.methodName === "findPaginatedPets",
      );
      expect(findPaginatedPets).toBeDefined();
      expect(findPaginatedPets?.httpMethod).toBe("GET");
      expect(findPaginatedPets?.isPaginatable).toBe(true);
      expect(findPaginatedPets?.pageParamType).toBe("number");
      expect(findPaginatedPets?.pageParamTypeKind).toBe("number");
    });

    // Pins the invariant the infinite-query builders rely on: every paginatable
    // operation has a dataTypeName that exists among the exported model names.
    it("should expose a Data type in modelNames for every paginatable operation", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");
      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        false,
        "1.0.0",
      );

      const paginatable = operations.filter((op) => op.isPaginatable);
      expect(paginatable.length).toBeGreaterThan(0);

      for (const op of paginatable) {
        expect(ctx.modelNames).toContain(op.dataTypeName);
      }
    });

    it("should extract parameters correctly", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");

      const findPetById = operations.find(
        (op) => op.methodName === "findPetById",
      );
      expect(findPetById).toBeDefined();
      expect(findPetById?.parameters.length).toBeGreaterThan(0);
      // In 0.92+, the SDK options parameter is required when the operation
      // has required parameters (e.g. path params)
      expect(findPetById?.allParamsOptional).toBe(false);
    });

    it("should detect operations with all optional parameters", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const operations = await parseOperations(project, "page");

      const findPets = operations.find((op) => op.methodName === "findPets");
      expect(findPets).toBeDefined();
      // findPets has optional limit and tags parameters
      expect(findPets?.allParamsOptional).toBe(true);
    });
  });

  describe("buildGenerationContext", () => {
    it("should build context with fetch client", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        false,
        "1.0.0",
      );

      expect(ctx.client).toBe("@hey-api/client-fetch");
      expect(ctx.pageParam).toBe("page");
      expect(ctx.nextPageParam).toBe("nextPage");
      expect(ctx.initialPageParam).toBe("1");
      expect(ctx.omitInitialPageParam).toBe(false);
      expect(ctx.version).toBe("1.0.0");
      expect(ctx.serviceNames.length).toBeGreaterThan(0);
      expect(ctx.modelNames.length).toBeGreaterThan(0);
    });

    it("should build context with axios client", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-axios",
        "offset",
        "next",
        "0",
        false,
        "2.0.0",
      );

      expect(ctx.client).toBe("@hey-api/client-axios");
      expect(ctx.pageParam).toBe("offset");
      expect(ctx.version).toBe("2.0.0");
    });

    it("should include model names", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        false,
        "1.0.0",
      );

      expect(ctx.modelNames).toContain("Pet");
      expect(ctx.modelNames).toContain("NewPet");
      // hey-api 0.92+ exports the Error schema under its original name
      expect(ctx.modelNames).toContain("Error");
    });

    it("should include service names", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths(`${outputPath(fileName)}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        false,
        "1.0.0",
      );

      expect(ctx.serviceNames).toContain("findPets");
      expect(ctx.serviceNames).toContain("addPet");
      expect(ctx.serviceNames).toContain("deletePet");
    });

    it("should throw when the service file is missing", () => {
      const project = new Project();

      expect(() =>
        buildGenerationContext(
          project,
          "@hey-api/client-fetch",
          "page",
          "nextPage",
          "1",
          false,
          "1.0.0",
        ),
      ).toThrow("No service node found");
    });

    it("should fall back to empty model names when the models file is missing", () => {
      const project = new Project();
      project.createSourceFile("sdk.gen.ts", "export const findPets = 1;");

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        false,
        "1.0.0",
      );

      expect(ctx.modelNames).toEqual([]);
      expect(ctx.serviceNames).toContain("findPets");
    });
  });
});

describe("parseOperations - digit-leading operationId (#213)", () => {
  const digitFileName = "parseOperations-digit-leading";

  beforeAll(
    async () => await generateTSClients(digitFileName, "digit-leading.yaml"),
  );
  afterAll(async () => await cleanOutputs(digitFileName));

  // hey-api names the SDK function `_123NumericLead` but the Data type
  // `NumericLeadData`, so deriving the type from the method name misses.
  // The name must come from the SDK signature for pagination to be detected
  // and for the generated output to compile.
  it("should resolve the Data type from the SDK signature and keep pagination", async () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths(`${outputPath(digitFileName)}/**/*`);

    const operations = await parseOperations(project, "page");
    const op = operations.find((o) => o.httpMethod === "GET");

    expect(op).toBeDefined();
    expect(op?.methodName).toBe("_123NumericLead");
    expect(op?.dataTypeName).toBe("NumericLeadData");
    expect(op?.isPaginatable).toBe(true);
    expect(op?.pageParamTypeKind).toBe("number");

    const postOp = operations.find((o) => o.httpMethod === "POST");
    expect(postOp?.methodName).toBe("_456CreateThing");
    expect(postOp?.dataTypeName).toBe("CreateThingData");
  });

  // Pins the naming assumption getErrorType's stem derivation relies on:
  // hey-api mints the Error type from the same stem as the Data type.
  it("should generate Error types sharing the Data type stem", async () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths(`${outputPath(digitFileName)}/**/*`);

    const ctx = buildGenerationContext(
      project,
      "@hey-api/client-fetch",
      "page",
      "nextPage",
      "1",
      false,
      "1.0.0",
    );

    expect(ctx.modelNames).toContain("NumericLeadError");
    expect(ctx.modelNames).toContain("CreateThingError");
  });
});

describe("parseOperations - string pagination", () => {
  const stringFileName = "parseOperations-string-pagination";

  beforeAll(
    async () =>
      await generateTSClients(stringFileName, "string-pagination.yaml"),
  );
  afterAll(async () => await cleanOutputs(stringFileName));

  it("should preserve a string page parameter type", async () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths(`${outputPath(stringFileName)}/**/*`);

    const operations = await parseOperations(project, "cursor");
    const listItems = operations.find((op) => op.methodName === "listItems");

    expect(listItems?.isPaginatable).toBe(true);
    expect(listItems?.pageParamType).toBe("Cursor");
    expect(listItems?.pageParamTypeKind).toBe("string");
  });
});
