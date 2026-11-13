import { describe, expect, it } from "vitest";
import {
  buildAxiosErrorImport,
  buildClientImport,
  buildCommonFileImports,
  buildCommonImport,
  buildHookFileImports,
  buildModelImport,
  buildQueryImport,
  buildQueryOptionsFileImports,
  buildServiceImport,
  printImports,
} from "../../src/hooks/imports.mjs";
import type { GenerationContext } from "../../src/types.mjs";

const mockFetchContext: GenerationContext = {
  client: "fetch",
  modelNames: ["Pet", "NewPet", "Error"],
  serviceNames: ["findPets", "addPet", "deletePet"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

const mockAxiosContext: GenerationContext = {
  ...mockFetchContext,
  client: "axios",
};

const mockEmptyModelsContext: GenerationContext = {
  ...mockFetchContext,
  modelNames: [],
};

describe("imports", () => {
  describe("buildClientImport", () => {
    it("should build import for fetch client", () => {
      const result = buildClientImport(mockFetchContext);
      // Options comes from sdk.gen (extended with client/meta properties)
      expect(result.moduleSpecifier).toBe("../requests/sdk.gen");
      expect(result.namedImports).toEqual([
        { name: "Options", isTypeOnly: true },
      ]);
    });

    it("should build import for axios client", () => {
      const result = buildClientImport(mockAxiosContext);

      // In v0.73+, client type doesn't affect the import path
      expect(result.moduleSpecifier).toBe("../requests/sdk.gen");
    });
  });

  describe("buildQueryImport", () => {
    it("should build import for TanStack Query", () => {
      const result = buildQueryImport();
      expect(result.moduleSpecifier).toBe("@tanstack/react-query");
      expect(result.namedImports).toContainEqual({
        name: "QueryClient",
        isTypeOnly: true,
      });
      expect(result.namedImports).toContainEqual({ name: "useQuery" });
      expect(result.namedImports).toContainEqual({ name: "useSuspenseQuery" });
      expect(result.namedImports).toContainEqual({ name: "useMutation" });
      // Type symbols are emitted with `isTypeOnly` so generated code
      // compiles under `verbatimModuleSyntax`.
      expect(result.namedImports).toContainEqual({
        name: "UseQueryResult",
        isTypeOnly: true,
      });
      expect(result.namedImports).toContainEqual({
        name: "UseQueryOptions",
        isTypeOnly: true,
      });
      expect(result.namedImports).toContainEqual({
        name: "UseMutationOptions",
        isTypeOnly: true,
      });
      expect(result.namedImports).toContainEqual({
        name: "UseMutationResult",
        isTypeOnly: true,
      });
      expect(result.namedImports).toContainEqual({
        name: "UseSuspenseQueryOptions",
        isTypeOnly: true,
      });
    });
  });

  describe("buildServiceImport", () => {
    it("should build import for services", () => {
      const result = buildServiceImport(mockFetchContext);
      // In v0.73+, the file is renamed from services.gen to sdk.gen
      expect(result.moduleSpecifier).toBe("../requests/sdk.gen");
      expect(result.namedImports).toContainEqual({ name: "findPets" });
      expect(result.namedImports).toContainEqual({ name: "addPet" });
      expect(result.namedImports).toContainEqual({ name: "deletePet" });
    });
  });

  describe("buildModelImport", () => {
    it("should build import for models", () => {
      const result = buildModelImport(mockFetchContext);

      expect(result).not.toBeNull();
      expect(result?.moduleSpecifier).toBe("../requests/types.gen");
      // Models are pure types; a type-only declaration keeps generated
      // code compatible with `verbatimModuleSyntax`.
      expect(result?.isTypeOnly).toBe(true);
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
      expect(result.moduleSpecifier).toBe("axios");
      expect(result.namedImports).toContainEqual({ name: "AxiosError" });
    });
  });

  describe("buildCommonImport", () => {
    it("should build namespace import for Common", () => {
      const result = buildCommonImport();
      expect(result.moduleSpecifier).toBe("./common");
      expect(result.namespaceImport).toBe("Common");
    });
  });

  describe("buildCommonFileImports", () => {
    it("should build imports for common file with fetch client", () => {
      const result = buildCommonFileImports(mockFetchContext);

      expect(result.length).toBeGreaterThanOrEqual(3);
      // Options is imported from ../requests/sdk.gen
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/sdk.gen"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "@tanstack/react-query"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/sdk.gen"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/types.gen"),
      ).toBe(true);
      // Should not have axios import
      expect(result.some((i) => i.moduleSpecifier === "axios")).toBe(false);
    });

    it("should build imports for common file with axios client", () => {
      const result = buildCommonFileImports(mockAxiosContext);

      // Options is imported from ../requests/sdk.gen regardless of axios
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/sdk.gen"),
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
      // Options is imported from ../requests/sdk.gen
      expect(
        result.some((i) => i.moduleSpecifier === "../requests/sdk.gen"),
      ).toBe(true);
      expect(
        result.some((i) => i.moduleSpecifier === "@tanstack/react-query"),
      ).toBe(true);
    });
  });

  describe("buildQueryOptionsFileImports", () => {
    it("should include Common, the queryOptions helpers, sdk and models", () => {
      const result = buildQueryOptionsFileImports(mockFetchContext);

      // Import order is emitted verbatim, so it is part of the contract
      expect(result.map((i) => i.moduleSpecifier)).toEqual([
        "./common",
        "@tanstack/react-query",
        "../requests/sdk.gen",
        "../requests/sdk.gen",
        "../requests/types.gen",
      ]);
      expect(result[0].namespaceImport).toBe("Common");
      // queryOptions never calls the TanStack hooks, so no hook import
      expect(
        result.some((i) =>
          i.namedImports?.some(
            (n) => typeof n === "object" && n.name === "useQuery",
          ),
        ),
      ).toBe(false);
    });

    it("should not include model import when no models", () => {
      const result = buildQueryOptionsFileImports(mockEmptyModelsContext);

      expect(
        result.some((i) => i.moduleSpecifier === "../requests/types.gen"),
      ).toBe(false);
    });
  });

  describe("printImports", () => {
    const used = (...names: string[]) => new Set(names);

    it("should keep only the names in use", () => {
      expect(
        printImports([buildQueryImport()], used("useQuery", "UseQueryOptions")),
      ).toBe(
        'import { useQuery, type UseQueryOptions } from "@tanstack/react-query";\n',
      );
    });

    it("should drop a declaration left without names", () => {
      expect(printImports([buildQueryImport()], used("findPets"))).toBe("");
      expect(printImports([buildCommonImport()], used("findPets"))).toBe("");
    });

    it("should merge the declarations of one module", () => {
      expect(
        printImports(
          [
            buildClientImport(mockFetchContext),
            buildServiceImport(mockFetchContext),
          ],
          used("Options", "findPets", "deletePet"),
        ),
      ).toBe(
        'import { deletePet, findPets, type Options } from "../requests/sdk.gen";\n',
      );
    });

    it("should sort names regardless of case and of the type modifier", () => {
      expect(
        printImports(
          [
            {
              moduleSpecifier: "m",
              namedImports: [
                { name: "b" },
                { name: "C", isTypeOnly: true },
                { name: "A" },
                { name: "a2" },
              ],
            },
          ],
          used("A", "a2", "b", "C"),
        ),
      ).toBe('import { A, a2, b, type C } from "m";\n');
    });

    it("should put packages before relative modules, each in order", () => {
      expect(
        printImports(
          buildHookFileImports(mockAxiosContext),
          used(
            "Common",
            "Options",
            "useQuery",
            "findPets",
            "Pet",
            "AxiosError",
          ),
        ),
      ).toBe(
        [
          'import { useQuery } from "@tanstack/react-query";',
          'import { AxiosError } from "axios";',
          'import { findPets, type Options } from "../requests/sdk.gen";',
          'import type { Pet } from "../requests/types.gen";',
          'import * as Common from "./common";',
          "",
        ].join("\n"),
      );
    });
  });
});
