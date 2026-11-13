import { describe, expect, it } from "vitest";
import {
  getDataTypeName,
  getErrorType,
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
  modelNames: string[],
  client: GenerationContext["client"] = "fetch",
): GenerationContext => ({
  client,
  modelNames,
  serviceNames: [],
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
    expect(getErrorType(named, ctx([]))).toBe("FindPetsError2");
  });

  it("is unknown without an error type, even if a schema has that name", () => {
    expect(getErrorType(op(), ctx(["FindPetsError"]))).toBe("unknown");
  });

  it("wraps the error type for axios", () => {
    expect(
      getErrorType(op({ errorTypeName: "FindPetsError" }), ctx([], "axios")),
    ).toBe("AxiosError<FindPetsError>");
    expect(getErrorType(op(), ctx([], "axios"))).toBe("AxiosError<unknown>");
  });
});
