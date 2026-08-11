import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";
import { getDataTypeName, SDK_CALL_ARGS } from "./buildQueryHooks.mjs";

/**
 * Get the error type string based on client type.
 */
function getErrorType(op: OperationInfo, ctx: GenerationContext): string {
  const errorTypeName = `${op.capitalizedMethodName}Error`;
  // Operations without error responses have no generated Error type
  const errorType = ctx.modelNames.includes(errorTypeName)
    ? errorTypeName
    : "unknown";
  if (ctx.client === "@hey-api/client-axios") {
    return `AxiosError<${errorType}>`;
  }
  return errorType;
}

/**
 * Build useMutation hook.
 * Example:
 * export const useAddPet = <TData = Common.AddPetMutationResult, TError = AddPetError, TQueryKey extends Array<unknown> = unknown[], TContext = unknown>(
 *   mutationKey?: TQueryKey,
 *   options?: Omit<UseMutationOptions<TData, TError, Options<AddPetData, true>, TContext>, "mutationKey" | "mutationFn">
 * ) => useMutation<TData, TError, Options<AddPetData, true>, TContext>({
 *   mutationKey: Common.UseAddPetKeyFn(mutationKey),
 *   mutationFn: clientOptions => addPet(clientOptions) as unknown as Promise<TData>,
 *   ...options
 * });
 */
export function buildUseMutationHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const hookName = `use${op.capitalizedMethodName}`;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `Common.${op.capitalizedMethodName}MutationResult`;

  const optionsType = `Options<${getDataTypeName(op)}, true>`;

  const mutationFn = `clientOptions => ${op.methodName}(${SDK_CALL_ARGS}) as unknown as Promise<TData>`;

  const body = `useMutation<TData, TError, ${optionsType}, TContext>({ mutationKey: Common.Use${op.capitalizedMethodName}KeyFn(mutationKey), mutationFn: ${mutationFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: hookName,
        initializer: `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[], TContext = unknown>(mutationKey?: TQueryKey, options?: Omit<UseMutationOptions<TData, TError, ${optionsType}, TContext>, "mutationKey" | "mutationFn">) => ${body}`,
      },
    ],
  };
}
