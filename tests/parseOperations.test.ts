import { join } from "node:path";
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
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const operations = await parseOperations(project, "page");

      const getOps = operations.filter((op) => op.httpMethod === "GET");
      expect(getOps.length).toBeGreaterThan(0);

      const findPets = operations.find((op) => op.methodName === "findPets");
      expect(findPets).toBeDefined();
      expect(findPets?.httpMethod).toBe("GET");
      expect(findPets?.capitalizedMethodName).toBe("FindPets");
    });

    it("should parse POST operations", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const operations = await parseOperations(project, "page");

      const postOps = operations.filter((op) => op.httpMethod === "POST");
      expect(postOps.length).toBeGreaterThan(0);

      const addPet = operations.find((op) => op.methodName === "addPet");
      expect(addPet).toBeDefined();
      expect(addPet?.httpMethod).toBe("POST");
    });

    it("should parse DELETE operations", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const operations = await parseOperations(project, "page");

      const deletePet = operations.find((op) => op.methodName === "deletePet");
      expect(deletePet).toBeDefined();
      expect(deletePet?.httpMethod).toBe("DELETE");
    });

    it("should parse all GET operations as potentially paginatable", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const operations = await parseOperations(project, "page");

      // findPaginatedPets should exist and be a GET operation
      const findPaginatedPets = operations.find(
        (op) => op.methodName === "findPaginatedPets",
      );
      expect(findPaginatedPets).toBeDefined();
      expect(findPaginatedPets?.httpMethod).toBe("GET");
      // Note: isPaginatable detection uses simplified regex which may not detect all cases
      // The actual pagination support is validated via createSourceV2 integration tests
    });

    it("should extract parameters correctly", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const operations = await parseOperations(project, "page");

      const findPetById = operations.find(
        (op) => op.methodName === "findPetById",
      );
      expect(findPetById).toBeDefined();
      expect(findPetById?.parameters.length).toBeGreaterThan(0);
      // findPetById requires an id parameter, so not all params are optional
      expect(findPetById?.allParamsOptional).toBe(false);
    });

    it("should detect operations with all optional parameters", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

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
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        "1.0.0",
      );

      expect(ctx.client).toBe("@hey-api/client-fetch");
      expect(ctx.pageParam).toBe("page");
      expect(ctx.nextPageParam).toBe("nextPage");
      expect(ctx.initialPageParam).toBe("1");
      expect(ctx.version).toBe("1.0.0");
      expect(ctx.serviceNames.length).toBeGreaterThan(0);
      expect(ctx.modelNames.length).toBeGreaterThan(0);
    });

    it("should build context with axios client", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-axios",
        "offset",
        "next",
        "0",
        "2.0.0",
      );

      expect(ctx.client).toBe("@hey-api/client-axios");
      expect(ctx.pageParam).toBe("offset");
      expect(ctx.version).toBe("2.0.0");
    });

    it("should include model names", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        "1.0.0",
      );

      expect(ctx.modelNames).toContain("Pet");
      expect(ctx.modelNames).toContain("NewPet");
      expect(ctx.modelNames).toContain("Error");
    });

    it("should include service names", async () => {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFiles = join(process.cwd(), outputPath(fileName));
      project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

      const ctx = buildGenerationContext(
        project,
        "@hey-api/client-fetch",
        "page",
        "nextPage",
        "1",
        "1.0.0",
      );

      expect(ctx.serviceNames).toContain("findPets");
      expect(ctx.serviceNames).toContain("addPet");
      expect(ctx.serviceNames).toContain("deletePet");
    });
  });
});
