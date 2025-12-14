import { IndentationText, QuoteKind, StructureKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildAxiosErrorImport,
  buildClientImport,
  buildCommonFileImports,
  buildCommonImport,
  buildHookFileImports,
  buildModelImport,
  buildQueryImport,
  buildServiceImport,
  createGenerationProject,
} from "../../src/tsmorph/projectFactory.mjs";
import type { GenerationContext } from "../../src/types.mjs";

const mockFetchContext: GenerationContext = {
  client: "@hey-api/client-fetch",
  modelNames: ["Pet", "NewPet", "Error"],
  serviceNames: ["findPets", "addPet", "deletePet"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

const mockAxiosContext: GenerationContext = {
  ...mockFetchContext,
  client: "@hey-api/client-axios",
};

const mockEmptyModelsContext: GenerationContext = {
  ...mockFetchContext,
  modelNames: [],
};

describe("projectFactory", () => {
  describe("createGenerationProject", () => {
    it("should create a ts-morph project", () => {
      const project = createGenerationProject();

      expect(project).toBeDefined();
      expect(project.getSourceFiles()).toHaveLength(0);
    });

    it("should use in-memory file system", () => {
      const project = createGenerationProject();
      const sourceFile = project.createSourceFile("test.ts", "const x = 1;");

      expect(sourceFile.getFullText()).toContain("const x = 1;");
    });

    it("should use double quotes", () => {
      const project = createGenerationProject();
      const sourceFile = project.createSourceFile("test.ts", "");
      sourceFile.addImportDeclaration({
        moduleSpecifier: "test-module",
        namedImports: ["Test"],
      });

      const text = sourceFile.getFullText();
      expect(text).toContain('"test-module"');
    });
  });

  describe("buildClientImport", () => {
    it("should build import for fetch client", () => {
      const result = buildClientImport(mockFetchContext);

      expect(result.kind).toBe(StructureKind.ImportDeclaration);
      expect(result.moduleSpecifier).toBe("@hey-api/client-fetch");
      expect(result.namedImports).toEqual([
        { name: "Options", isTypeOnly: true },
      ]);
    });

    it("should build import for axios client", () => {
      const result = buildClientImport(mockAxiosContext);

      expect(result.moduleSpecifier).toBe("@hey-api/client-axios");
    });
  });

  describe("buildQueryImport", () => {
    it("should build import for TanStack Query", () => {
      const result = buildQueryImport();

      expect(result.kind).toBe(StructureKind.ImportDeclaration);
      expect(result.moduleSpecifier).toBe("@tanstack/react-query");
      expect(result.namedImports).toContainEqual({
        name: "QueryClient",
        isTypeOnly: true,
      });
      expect(result.namedImports).toContainEqual({ name: "useQuery" });
      expect(result.namedImports).toContainEqual({ name: "useSuspenseQuery" });
      expect(result.namedImports).toContainEqual({ name: "useMutation" });
      expect(result.namedImports).toContainEqual({ name: "UseQueryResult" });
      expect(result.namedImports).toContainEqual({ name: "UseQueryOptions" });
      expect(result.namedImports).toContainEqual({
        name: "UseMutationOptions",
      });
      expect(result.namedImports).toContainEqual({ name: "UseMutationResult" });
      expect(result.namedImports).toContainEqual({
        name: "UseSuspenseQueryOptions",
      });
    });
  });

  describe("buildServiceImport", () => {
    it("should build import for services", () => {
      const result = buildServiceImport(mockFetchContext);

      expect(result.kind).toBe(StructureKind.ImportDeclaration);
      expect(result.moduleSpecifier).toBe("../requests/services.gen");
      expect(result.namedImports).toContainEqual({ name: "findPets" });
      expect(result.namedImports).toContainEqual({ name: "addPet" });
      expect(result.namedImports).toContainEqual({ name: "deletePet" });
    });
  });

  describe("buildModelImport", () => {
    it("should build import for models", () => {
      const result = buildModelImport(mockFetchContext);

      expect(result).not.toBeNull();
      expect(result?.kind).toBe(StructureKind.ImportDeclaration);
      expect(result?.moduleSpecifier).toBe("../requests/types.gen");
      expect(result?.namedImports).toContainEqual({ name: "Pet" });
      expect(result?.namedImports).toContainEqual({ name: "NewPet" });
      expect(result?.namedImports).toContainEqual({ name: "Error" });
    });

    it("should return null when no models", () => {
      const result = buildModelImport(mockEmptyModelsContext);

      expect(result).toBeNull();
    });
  });

  describe("buildAxiosErrorImport", () => {
    it("should build import for AxiosError", () => {
      const result = buildAxiosErrorImport();

      expect(result.kind).toBe(StructureKind.ImportDeclaration);
      expect(result.moduleSpecifier).toBe("axios");
      expect(result.namedImports).toContainEqual({ name: "AxiosError" });
    });
  });

  describe("buildCommonImport", () => {
    it("should build namespace import for Common", () => {
      const result = buildCommonImport();

      expect(result.kind).toBe(StructureKind.ImportDeclaration);
      expect(result.moduleSpecifier).toBe("./common");
      expect(result.namespaceImport).toBe("Common");
    });
  });

  describe("buildCommonFileImports", () => {
    it("should build imports for common file with fetch client", () => {
      const result = buildCommonFileImports(mockFetchContext);

      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(
        result.some((i) => i.moduleSpecifier === "@hey-api/client-fetch"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "@tanstack/react-query"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/services.gen"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/types.gen"),
      ).toBe(true);
      // Should not have axios import
      expect(result.some((i) => i.moduleSpecifier === "axios")).toBe(false);
    });

    it("should build imports for common file with axios client", () => {
      const result = buildCommonFileImports(mockAxiosContext);

      expect(
        result.some((i) => i.moduleSpecifier === "@hey-api/client-axios"),
      ).toBe(true);
      expect(result.some((i) => i.moduleSpecifier === "axios")).toBe(true);
    });

    it("should not include model import when no models", () => {
      const result = buildCommonFileImports(mockEmptyModelsContext);

      expect(
        result.some((i) => i.moduleSpecifier === "../requests/types.gen"),
      ).toBe(false);
    });
  });

  describe("buildHookFileImports", () => {
    it("should include Common import plus all common file imports", () => {
      const result = buildHookFileImports(mockFetchContext);

      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result[0].moduleSpecifier).toBe("./common");
      expect(result[0].namespaceImport).toBe("Common");
      expect(
        result.some((i) => i.moduleSpecifier === "@hey-api/client-fetch"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "@tanstack/react-query"),
      ).toBe(true);
    });
  });
});
