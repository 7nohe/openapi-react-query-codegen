import type { GenerationContext, OperationInfo } from "../types.mjs";
import { SDK_CALL_ARGS } from "./buildQueryHooks.mjs";
import { getDataTypeName, getErrorType } from "./operationNames.mjs";
import type { ConstStatement } from "./statement.mjs";

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
): ConstStatement {
  const hookName = `use${op.capitalizedMethodName}`;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `Common.${op.capitalizedMethodName}MutationResult`;

  const optionsType = `Options<${getDataTypeName(op)}, true>`;

  const mutationFn = `clientOptions => ${op.methodName}(${SDK_CALL_ARGS}) as unknown as Promise<TData>`;

  const body = `useMutation<TData, TError, ${optionsType}, TContext>({ mutationKey: Common.Use${op.capitalizedMethodName}KeyFn(mutationKey), mutationFn: ${mutationFn}, ...options })`;

  return {
    kind: "const",
    // The operation's JSDoc (description and @deprecated), as on the SDK function
    jsDoc: op.jsDoc,
    name: hookName,
    initializer: `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[], TContext = unknown>(mutationKey?: TQueryKey, options?: Omit<UseMutationOptions<TData, TError, ${optionsType}, TContext>, "mutationKey" | "mutationFn">) => ${body}`,
  };
}
