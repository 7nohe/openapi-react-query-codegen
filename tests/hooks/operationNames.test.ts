import { describe, expect, it } from "vitest";
import {
  dataModels,
  errorModels,
  getDataTypeName,
  getErrorType,
  operationConst,
} from "../../src/hooks/operationNames.mts";
import type { GenerationContext, OperationInfo } from "../../src/types.mts";

const op = (overrides: Partial<OperationInfo> = {}): OperationInfo => ({
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  dataTypeName: "FindPetsData",
  httpMethod: "GET",
  allParamsOptional: true,
  isPaginatable: false,
  ...overrides,
});

const ctx = (
  client: GenerationContext["client"] = "fetch",
): GenerationContext => ({
  client,
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  omitInitialPageParam: false,
  version: "1.0.0",
});

describe("operationNames", () => {
  it("getDataTypeName falls back to unknown", () => {
    expect(getDataTypeName(op())).toBe("FindPetsData");
    expect(getDataTypeName(op({ dataTypeName: undefined }))).toBe("unknown");
  });

  it("uses the error type name chosen by the client generator", () => {
    const named = op({ errorTypeName: "FindPetsError2" });
    expect(getErrorType(named, ctx())).toBe("FindPetsError2");
  });

  it("is unknown without an error type", () => {
    expect(getErrorType(op(), ctx())).toBe("unknown");
  });

  it("wraps the error type for axios", () => {
    expect(
      getErrorType(op({ errorTypeName: "FindPetsError" }), ctx("axios")),
    ).toBe("AxiosError<FindPetsError>");
    expect(getErrorType(op(), ctx("axios"))).toBe("AxiosError<unknown>");
  });

  it("lists the models the two names stand for", () => {
    const named = op({ errorTypeName: "FindPetsError" });
    expect(dataModels(named)).toEqual(["FindPetsData"]);
    expect(errorModels(named)).toEqual(["FindPetsError"]);
    expect(dataModels(op({ dataTypeName: undefined }))).toEqual([]);
    expect(errorModels(op())).toEqual([]);
  });

  it("operationConst declares the SDK function and carries its JSDoc", () => {
    expect(
      operationConst(op({ jsDoc: "/** Finds pets. */" }), "useFindPets", "x", [
        "FindPetsData",
      ]),
    ).toEqual({
      kind: "const",
      jsDoc: "/** Finds pets. */",
      name: "useFindPets",
      initializer: "x",
      service: "findPets",
      models: ["FindPetsData"],
    });
  });
});
