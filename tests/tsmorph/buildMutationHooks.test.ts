import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildUseMutationHook } from "../../src/tsmorph/buildMutationHooks.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockPostOperation: OperationInfo = {
  methodName: "addPet",
  capitalizedMethodName: "AddPet",
  dataTypeName: "AddPetData",
  httpMethod: "POST",
  isDeprecated: false,
  parameters: [{ name: "body", typeName: "NewPet", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockDeleteOperation: OperationInfo = {
  methodName: "deletePet",
  capitalizedMethodName: "DeletePet",
  dataTypeName: "DeletePetData",
  httpMethod: "DELETE",
  isDeprecated: false,
  parameters: [{ name: "id", typeName: "number", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockPutOperation: OperationInfo = {
  methodName: "updatePet",
  capitalizedMethodName: "UpdatePet",
  dataTypeName: "UpdatePetData",
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
  dataTypeName: "PatchPetData",
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
    "AddPetError",
    "DeletePetData",
    "DeletePetError",
    "UpdatePetData",
    "UpdatePetError",
    "PatchPetData",
    "PatchPetError",
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
        "addPet({ ...clientOptions, throwOnError: true }) as unknown as Promise<TData>",
      );
    });

    it("should default to the complete SDK response so headers stay available", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("TData = Common.AddPetMutationResult");
      expect(initializer).not.toContain('AddPetMutationResult["data"]');
      expect(initializer).not.toContain("response.data");
    });

    it("should accept an AbortSignal through mutation client options", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("Options<AddPetData, true>");
      expect(initializer).toContain("...clientOptions");
    });

    it("should build useMutation hook for DELETE operation", () => {
      const result = buildUseMutationHook(
        mockDeleteOperation,
        mockFetchContext,
      );

      expect(result.declarations[0].name).toBe("useDeletePet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Common.DeletePetMutationResult");
      expect(initializer).toContain(
        "deletePet({ ...clientOptions, throwOnError: true })",
      );
    });

    it("should build useMutation hook for PUT operation", () => {
      const result = buildUseMutationHook(mockPutOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("useUpdatePet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Common.UpdatePetMutationResult");
      expect(initializer).toContain(
        "updatePet({ ...clientOptions, throwOnError: true })",
      );
    });

    it("should build useMutation hook for PATCH operation", () => {
      const result = buildUseMutationHook(mockPatchOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("usePatchPet");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("Common.PatchPetMutationResult");
      expect(initializer).toContain(
        "patchPet({ ...clientOptions, throwOnError: true })",
      );
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

    it("should fall back to unknown when the SDK signature exposes no Data type", () => {
      const opWithoutData: OperationInfo = {
        ...mockPostOperation,
        methodName: "unknownMutation",
        capitalizedMethodName: "UnknownMutation",
        dataTypeName: undefined,
      };

      const result = buildUseMutationHook(opWithoutData, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("Options<unknown, true>");
    });

    it("should use the signature Data type for digit-leading operationIds (#213)", () => {
      const op: OperationInfo = {
        ...mockPostOperation,
        methodName: "_123CreateThing",
        capitalizedMethodName: "_123CreateThing",
        dataTypeName: "CreateThingData",
      };

      const result = buildUseMutationHook(op, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("Options<CreateThingData, true>");
      expect(initializer).not.toContain("_123CreateThingData");
    });

    it("should spread options at the end", () => {
      const result = buildUseMutationHook(mockPostOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("...options })");
    });
  });
});
