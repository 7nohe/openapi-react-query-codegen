import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildUseMutationHook } from "../../src/tsmorph/buildMutationHooks.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockPostOperation: OperationInfo = {
  methodName: "addPet",
  capitalizedMethodName: "AddPet",
  httpMethod: "POST",
  isDeprecated: false,
  parameters: [{ name: "body", typeName: "NewPet", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockDeleteOperation: OperationInfo = {
  methodName: "deletePet",
  capitalizedMethodName: "DeletePet",
  httpMethod: "DELETE",
  isDeprecated: false,
  parameters: [{ name: "id", typeName: "number", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockPutOperation: OperationInfo = {
  methodName: "updatePet",
  capitalizedMethodName: "UpdatePet",
  httpMethod: "PUT",
  isDeprecated: false,
  parameters: [
    { name: "id", typeName: "number", optional: false },
    { name: "body", typeName: "Pet", optional: false },
  ],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockPatchOperation: OperationInfo = {
  methodName: "patchPet",
  capitalizedMethodName: "PatchPet",
  httpMethod: "PATCH",
  isDeprecated: false,
  parameters: [{ name: "body", typeName: "Partial<Pet>", optional: true }],
  allParamsOptional: true,
  isPaginatable: false,
};

const mockFetchContext: GenerationContext = {
  client: "@hey-api/client-fetch",
  modelNames: [
    "Pet",
    "NewPet",
    "AddPetData",
    "DeletePetData",
    "UpdatePetData",
    "PatchPetData",
  ],
  serviceNames: ["addPet", "deletePet", "updatePet", "patchPet"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

const mockAxiosContext: GenerationContext = {
  ...mockFetchContext,
  client: "@hey-api/client-axios",
};

describe("buildMutationHooks", () => {
  describe("buildUseMutationHook", () => {
    it("should build useMutation hook for POST operation", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("useAddPet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("TData = Common.AddPetMutationResult");
      expect(initializer).toContain("TError = AddPetError");
      expect(initializer).toContain("TContext = unknown");
      expect(initializer).toContain(
        "useMutation<TData, TError, Options<AddPetData, true>, TContext>",
      );
      expect(initializer).toContain("Common.UseAddPetKeyFn(mutationKey)");
      expect(initializer).toContain(
        "addPet(clientOptions) as unknown as Promise<TData>",
      );
    });

    it("should build useMutation hook for DELETE operation", () => {
      const result = buildUseMutationHook(
        mockDeleteOperation,
        mockFetchContext,
      );

      expect(result.declarations[0].name).toBe("useDeletePet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Common.DeletePetMutationResult");
      expect(initializer).toContain("deletePet(clientOptions)");
    });

    it("should build useMutation hook for PUT operation", () => {
      const result = buildUseMutationHook(mockPutOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("useUpdatePet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Common.UpdatePetMutationResult");
      expect(initializer).toContain("updatePet(clientOptions)");
    });

    it("should build useMutation hook for PATCH operation", () => {
      const result = buildUseMutationHook(mockPatchOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("usePatchPet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Common.PatchPetMutationResult");
      expect(initializer).toContain("patchPet(clientOptions)");
    });

    it("should use AxiosError for axios client", () => {
      const result = buildUseMutationHook(mockPostOperation, mockAxiosContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("TError = AxiosError<AddPetError>");
    });

    it("should include mutationKey parameter", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("mutationKey?: TQueryKey");
    });

    it("should include options parameter with Omit type", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        'Omit<UseMutationOptions<TData, TError, Options<AddPetData, true>, TContext>, "mutationKey" | "mutationFn">',
      );
    });

    it("should use unknown for missing data type", () => {
      const opWithoutData: OperationInfo = {
        ...mockPostOperation,
        methodName: "unknownMutation",
        capitalizedMethodName: "UnknownMutation",
      };
      const ctx: GenerationContext = {
        ...mockFetchContext,
        modelNames: ["Pet", "NewPet"], // no UnknownMutationData
      };

      const result = buildUseMutationHook(opWithoutData, ctx);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("Options<unknown, true>");
    });

    it("should spread options at the end", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("...options })");
    });
  });
});
