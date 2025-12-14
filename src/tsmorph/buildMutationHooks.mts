import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";

/**
 * Get the error type string based on client type.
 */
function getErrorType(op: OperationInfo, ctx: GenerationContext): string {
  const errorTypeName = `${op.capitalizedMethodName}Error`;
  if (ctx.client === "@hey-api/client-axios") {
    return `AxiosError<${errorTypeName}>`;
  }
  return errorTypeName;
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

  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const optionsType = `Options<${dataTypeName}, true>`;

  const mutationFn = `clientOptions => ${op.methodName}(clientOptions) as unknown as Promise<TData>`;

  const body = `useMutation<TData, TError, ${optionsType}, TContext>({ mutationKey: Common.Use${op.capitalizedMethodName}KeyFn(mutationKey), mutationFn: ${mutationFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
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
