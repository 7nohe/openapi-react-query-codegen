import { describe, expect, it } from "vitest";
import type {
  GeneratedFile,
  GenerationContext,
  OperationInfo,
} from "../src/types.mjs";

describe("types", () => {
  describe("OperationInfo", () => {
    it("should define correct structure for GET operation", () => {
      const op: OperationInfo = {
        methodName: "findPets",
        capitalizedMethodName: "FindPets",
        httpMethod: "GET",
        jsDoc: "/** Find all pets */",
        allParamsOptional: true,
        isPaginatable: false,
      };

      expect(op.methodName).toBe("findPets");
      expect(op.capitalizedMethodName).toBe("FindPets");
      expect(op.httpMethod).toBe("GET");
      expect(op.allParamsOptional).toBe(true);
      expect(op.isPaginatable).toBe(false);
    });

    it("should define correct structure for POST operation", () => {
      const op: OperationInfo = {
        methodName: "addPet",
        capitalizedMethodName: "AddPet",
        httpMethod: "POST",
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
        allParamsOptional: true,
        isPaginatable: false,
      };

      expect(op.jsDoc).toContain("@deprecated");
    });

    it("should define correct structure for paginatable operation", () => {
      const op: OperationInfo = {
        methodName: "listItems",
        capitalizedMethodName: "ListItems",
        httpMethod: "GET",
        allParamsOptional: true,
        isPaginatable: true,
      };

      expect(op.isPaginatable).toBe(true);
    });
  });

  describe("GenerationContext", () => {
    it("should define context for fetch client", () => {
      const ctx: GenerationContext = {
        client: "fetch",
        pageParam: "page",
        nextPageParam: "nextPage",
        initialPageParam: "1",
        version: "1.0.0",
      };

      expect(ctx.client).toBe("fetch");
      expect(ctx.pageParam).toBe("page");
    });

    it("should define context for axios client", () => {
      const ctx: GenerationContext = {
        client: "axios",
        pageParam: "offset",
        nextPageParam: "next",
        initialPageParam: "0",
        version: "2.0.0",
      };

      expect(ctx.client).toBe("axios");
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
