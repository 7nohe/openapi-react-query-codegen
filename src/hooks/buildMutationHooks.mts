import type { GenerationContext } from "../types.mjs";
import { SDK_CALL_ARGS } from "./buildQueryHooks.mjs";
import { type HookOperation, hookNames } from "./hookNames.mjs";
import {
  dataModels,
  errorModels,
  getDataTypeName,
  getErrorType,
  operationConst,
} from "./operationNames.mjs";
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
  op: HookOperation,
  ctx: GenerationContext,
): ConstStatement {
  const hookName = hookNames(op).hook;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `Common.${hookNames(op).mutationResult}`;

  const optionsType = `Options<${getDataTypeName(op)}, true>`;

  const mutationFn = `clientOptions => ${op.methodName}(${SDK_CALL_ARGS}) as unknown as Promise<TData>`;

  const body = `useMutation<TData, TError, ${optionsType}, TContext>({ mutationKey: Common.${hookNames(op).keyFn}(mutationKey), mutationFn: ${mutationFn}, ...options })`;

  return operationConst(
    op,
    hookName,
    `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[], TContext = unknown>(mutationKey?: TQueryKey, options?: Omit<UseMutationOptions<TData, TError, ${optionsType}, TContext>, "mutationKey" | "mutationFn">) => ${body}`,
    [...dataModels(op), ...errorModels(op)],
  );
}
