import { describe, expect, it } from "vitest";
import type {
  GeneratedFile,
  GenerationContext,
  OperationInfo,
  OperationParameter,
} from "../src/types.mjs";

describe("types", () => {
  describe("OperationInfo", () => {
    it("should define correct structure for GET operation", () => {
      const op: OperationInfo = {
        methodName: "findPets",
        capitalizedMethodName: "FindPets",
        httpMethod: "GET",
        jsDoc: "/** Find all pets */",
        isDeprecated: false,
        parameters: [
          { name: "limit", typeName: "number", optional: true },
          { name: "tags", typeName: "string[]", optional: true },
        ],
        allParamsOptional: true,
        isPaginatable: false,
      };

      expect(op.methodName).toBe("findPets");
      expect(op.capitalizedMethodName).toBe("FindPets");
      expect(op.httpMethod).toBe("GET");
      expect(op.isDeprecated).toBe(false);
      expect(op.parameters).toHaveLength(2);
      expect(op.allParamsOptional).toBe(true);
      expect(op.isPaginatable).toBe(false);
    });

    it("should define correct structure for POST operation", () => {
      const op: OperationInfo = {
        methodName: "addPet",
        capitalizedMethodName: "AddPet",
        httpMethod: "POST",
        isDeprecated: false,
        parameters: [{ name: "body", typeName: "NewPet", optional: false }],
        allParamsOptional: false,
        isPaginatable: false,
      };

      expect(op.httpMethod).toBe("POST");
      expect(op.allParamsOptional).toBe(false);
      expect(op.jsDoc).toBeUndefined();
    });

    it("should define correct structure for deprecated operation", () => {
      const op: OperationInfo = {
        methodName: "oldEndpoint",
        capitalizedMethodName: "OldEndpoint",
        httpMethod: "GET",
        jsDoc: "/** @deprecated Use newEndpoint instead */",
        isDeprecated: true,
        parameters: [],
        allParamsOptional: true,
        isPaginatable: false,
      };

      expect(op.isDeprecated).toBe(true);
    });

    it("should define correct structure for paginatable operation", () => {
      const op: OperationInfo = {
        methodName: "listItems",
        capitalizedMethodName: "ListItems",
        httpMethod: "GET",
        isDeprecated: false,
        parameters: [{ name: "page", typeName: "number", optional: true }],
        allParamsOptional: true,
        isPaginatable: true,
      };

      expect(op.isPaginatable).toBe(true);
    });
  });

  describe("OperationParameter", () => {
    it("should define required parameter", () => {
      const param: OperationParameter = {
        name: "id",
        typeName: "number",
        optional: false,
      };

      expect(param.name).toBe("id");
      expect(param.typeName).toBe("number");
      expect(param.optional).toBe(false);
    });

    it("should define optional parameter", () => {
      const param: OperationParameter = {
        name: "limit",
        typeName: "number",
        optional: true,
      };

      expect(param.optional).toBe(true);
    });
  });

  describe("GenerationContext", () => {
    it("should define context for fetch client", () => {
      const ctx: GenerationContext = {
        client: "@hey-api/client-fetch",
        modelNames: ["Pet", "NewPet", "Error"],
        serviceNames: ["findPets", "addPet"],
        pageParam: "page",
        nextPageParam: "nextPage",
        initialPageParam: "1",
        version: "1.0.0",
      };

      expect(ctx.client).toBe("@hey-api/client-fetch");
      expect(ctx.modelNames).toContain("Pet");
      expect(ctx.serviceNames).toContain("findPets");
    });

    it("should define context for axios client", () => {
      const ctx: GenerationContext = {
        client: "@hey-api/client-axios",
        modelNames: [],
        serviceNames: ["getData"],
        pageParam: "offset",
        nextPageParam: "next",
        initialPageParam: "0",
        version: "2.0.0",
      };

      expect(ctx.client).toBe("@hey-api/client-axios");
    });
  });

  describe("GeneratedFile", () => {
    it("should define generated file structure", () => {
      const file: GeneratedFile = {
        name: "queries.ts",
        content: "export const useFindPets = ...",
      };

      expect(file.name).toBe("queries.ts");
      expect(file.content).toContain("useFindPets");
    });
  });
});
