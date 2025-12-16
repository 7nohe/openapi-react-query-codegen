import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildLoaderFactory,
  buildWithQueryPrefetch,
} from "../../src/tsmorph/buildRouter.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

// Operation without path parameter (all optional)
const mockOperationNoPath: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "limit", typeName: "number", optional: true }],
  allParamsOptional: true,
  isPaginatable: false,
};

// Operation with path parameter
const mockOperationWithPath: OperationInfo = {
  methodName: "findPetById",
  capitalizedMethodName: "FindPetById",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [
    { name: "path", typeName: "{ petId: number }", optional: false },
  ],
  allParamsOptional: false,
  isPaginatable: false,
};

// Operation with path and other required params
const mockOperationWithPathAndRequired: OperationInfo = {
  methodName: "getPetDetails",
  capitalizedMethodName: "GetPetDetails",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [
    { name: "path", typeName: "{ petId: number }", optional: false },
    { name: "query", typeName: "{ include: string }", optional: false },
  ],
  allParamsOptional: false,
  isPaginatable: false,
};

// Operation with path: never (no actual path params)
const mockOperationWithPathNever: OperationInfo = {
  methodName: "listPets",
  capitalizedMethodName: "ListPets",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [
    { name: "path", typeName: "never", optional: true },
    { name: "query", typeName: "{ limit: number }", optional: true },
  ],
  allParamsOptional: true,
  isPaginatable: false,
};

const mockFetchContext: GenerationContext = {
  client: "@hey-api/client-fetch",
  modelNames: [
    "Pet",
    "FindPetsData",
    "FindPetByIdData",
    "GetPetDetailsData",
    "ListPetsData",
  ],
  serviceNames: ["findPets", "findPetById", "getPetDetails", "listPets"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

describe("buildRouter", () => {
  describe("buildWithQueryPrefetch", () => {
    it("should build withQueryPrefetch helper", () => {
      const result = buildWithQueryPrefetch();

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("withQueryPrefetch");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("prefetch: () => Promise<unknown>");
      expect(initializer).toContain("onMouseEnter: () => void prefetch()");
      expect(initializer).toContain("onTouchStart: () => void prefetch()");
    });
  });

  describe("buildLoaderFactory", () => {
    it("should build loader factory for operation without path param", () => {
      const result = buildLoaderFactory(mockOperationNoPath, mockFetchContext);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("loaderUseFindPets");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient: QueryClient");
      expect(initializer).toContain("clientOptions?:");
      expect(initializer).toContain("Options<FindPetsData, true>");
      expect(initializer).toContain("async () =>");
      expect(initializer).toContain(
        "ensureUseFindPetsData(deps.queryClient, deps.clientOptions)",
      );
      expect(initializer).toContain("return null");
    });

    it("should build loader factory for operation with path param", () => {
      const result = buildLoaderFactory(
        mockOperationWithPath,
        mockFetchContext,
      );

      expect(result.declarations[0].name).toBe("loaderUseFindPetById");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient: QueryClient");
      expect(initializer).toContain("clientOptions?:");
      expect(initializer).toContain(
        'Omit<Options<FindPetByIdData, true>, "path">',
      );
      expect(initializer).toContain("async ({ params }:");
      expect(initializer).toContain('params: FindPetByIdData["path"]');
      expect(initializer).toContain("...(deps.clientOptions ?? {})");
      expect(initializer).toContain("path: params");
      expect(initializer).toContain(
        "ensureUseFindPetByIdData(deps.queryClient, options)",
      );
    });

    it("should make clientOptions required when non-path required params exist", () => {
      const result = buildLoaderFactory(
        mockOperationWithPathAndRequired,
        mockFetchContext,
      );

      const initializer = result.declarations[0].initializer as string;
      // clientOptions should NOT have ? (required)
      expect(initializer).toContain("clientOptions:");
      expect(initializer).not.toMatch(/clientOptions\?:/);
    });

    it("should treat path: never as no path param", () => {
      const result = buildLoaderFactory(
        mockOperationWithPathNever,
        mockFetchContext,
      );

      expect(result.declarations[0].name).toBe("loaderUseListPets");

      const initializer = result.declarations[0].initializer as string;
      // Should NOT have params in the inner function
      expect(initializer).toContain("async () =>");
      expect(initializer).not.toContain("{ params }");
      // clientOptions should be optional since all params are optional
      expect(initializer).toContain("clientOptions?:");
    });

    it("should use unknown for missing Data type", () => {
      const contextWithoutDataType: GenerationContext = {
        ...mockFetchContext,
        modelNames: [],
      };

      const result = buildLoaderFactory(
        mockOperationNoPath,
        contextWithoutDataType,
      );

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Options<unknown, true>");
    });
  });
});
