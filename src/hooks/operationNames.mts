import type { GenerationContext, OperationInfo } from "../types.mjs";
import type { ConstStatement } from "./statement.mjs";

/** The generated Data type name, or unknown when there is none. */
export function getDataTypeName(op: OperationInfo): string {
  return op.dataTypeName ?? "unknown";
}

/** The error type of an operation's hooks, wrapped for axios. */
export function getErrorType(
  op: OperationInfo,
  ctx: GenerationContext,
): string {
  const errorType = op.errorTypeName ?? "unknown";
  return ctx.client === "axios" ? `AxiosError<${errorType}>` : errorType;
}

/** The model `getDataTypeName` names, for a statement's `models`. */
export function dataModels(op: OperationInfo): string[] {
  return op.dataTypeName ? [op.dataTypeName] : [];
}

/** The model `getErrorType` names, for a statement's `models`. */
export function errorModels(op: OperationInfo): string[] {
  return op.errorTypeName ? [op.errorTypeName] : [];
}

/**
 * A `const` that calls the operation's SDK function. It carries the JSDoc
 * (description and `@deprecated`) the SDK function has.
 */
export function operationConst(
  op: OperationInfo,
  name: string,
  initializer: string,
  models: string[],
): ConstStatement {
  return {
    kind: "const",
    jsDoc: op.jsDoc,
    name,
    initializer,
    service: op.methodName,
    models,
  };
}
