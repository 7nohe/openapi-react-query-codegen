import type { GenerationContext, OperationInfo } from "../types.mjs";

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
