import type { GenerationContext, OperationInfo } from "../types.mjs";

/**
 * Resolve the generated Data type name for an operation, falling back to
 * unknown when the SDK signature exposes no Data type.
 * See OperationInfo.dataTypeName for why the name is read from the signature
 * instead of derived from the method name (#213).
 */
export function getDataTypeName(op: OperationInfo): string {
  return op.dataTypeName ?? "unknown";
}

/**
 * Get the error type string based on client type.
 * The Error type shares its stem with the Data type — hey-api mints both from
 * the operationId (see OperationInfo.dataTypeName, #213) — so the stem comes
 * from `dataTypeName` rather than the method name. The modelNames probe stays
 * because operations without error responses have no generated Error type.
 */
export function getErrorType(
  op: OperationInfo,
  ctx: GenerationContext,
): string {
  const stem = op.dataTypeName
    ? op.dataTypeName.replace(/Data$/, "")
    : op.capitalizedMethodName;
  const errorTypeName = `${stem}Error`;
  const errorType = ctx.modelNames.includes(errorTypeName)
    ? errorTypeName
    : "unknown";
  if (ctx.client === "@hey-api/client-axios") {
    return `AxiosError<${errorType}>`;
  }
  return errorType;
}
