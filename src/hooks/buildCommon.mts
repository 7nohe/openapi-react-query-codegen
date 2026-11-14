import type { GenerationContext } from "../types.mjs";
import { buildClientOptionsParam } from "./buildQueryHooks.mjs";
import { type HookOperation, hookNames } from "./hookNames.mjs";
import { dataModels, getDataTypeName } from "./operationNames.mjs";
import type { ConstStatement, TypeStatement } from "./statement.mjs";

/**
 * Build the default response type alias.
 * Example: export type FindPetsDefaultResponse = Awaited<ReturnType<typeof findPets>>["data"];
 */
export function buildDefaultResponseType(op: HookOperation): TypeStatement {
  return {
    kind: "type",
    name: hookNames(op).defaultResponse,
    type: `Awaited<ReturnType<typeof ${op.methodName}>>["data"]`,
    service: op.methodName,
  };
}

/**
 * Build the query result type alias.
 * Example: export type FindPetsQueryResult<TData = FindPetsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
 */
export function buildQueryResultType(op: HookOperation): TypeStatement {
  return {
    kind: "type",
    name: hookNames(op).queryResult,
    typeParameters: [
      { name: "TData", default: hookNames(op).defaultResponse },
      { name: "TError", default: "unknown" },
    ],
    type: "UseQueryResult<TData, TError>",
  };
}

/**
 * Build the mutation result type alias.
 * Example: export type AddPetMutationResult = Awaited<ReturnType<typeof addPet>>;
 */
export function buildMutationResultType(op: HookOperation): TypeStatement {
  return {
    kind: "type",
    name: hookNames(op).mutationResult,
    type: `Awaited<ReturnType<typeof ${op.methodName}>>`,
    service: op.methodName,
  };
}

/**
 * Build the key constant of a query or a mutation.
 * Example: export const useFindPetsKey = "FindPets";
 */
export function buildKeyConst(op: HookOperation): ConstStatement {
  return {
    kind: "const",
    name: hookNames(op).key,
    initializer: `"${op.capitalizedMethodName}"`,
  };
}

/**
 * Build query key function.
 * Example: export const UseFindPetsKeyFn = (clientOptions: Options<FindPetsData, true> = {}, queryKey?: Array<unknown>) =>
 *   [useFindPetsKey, ...(queryKey ?? [clientOptions])];
 */
export function buildQueryKeyFn(op: HookOperation): ConstStatement {
  return {
    kind: "const",
    name: hookNames(op).keyFn,
    initializer: `(${buildClientOptionsParam(op)}, queryKey?: Array<unknown>) => [${hookNames(op).key}, ...(queryKey ?? [clientOptions])]`,
    models: dataModels(op),
  };
}

/**
 * Build mutation key function.
 * Example: export const UseAddPetKeyFn = (mutationKey?: Array<unknown>) =>
 *   [useAddPetKey, ...(mutationKey ?? [])];
 */
export function buildMutationKeyFn(op: HookOperation): ConstStatement {
  return {
    kind: "const",
    name: hookNames(op).keyFn,
    initializer: `(mutationKey?: Array<unknown>) => [${hookNames(op).key}, ...(mutationKey ?? [])]`,
  };
}

/**
 * Build the client options type for infinite queries.
 * The page parameter is excluded because TanStack Query supplies it via the
 * pageParam mechanism (#140).
 * Example:
 * export type FindPaginatedPetsInfiniteClientOptions = Omit<Options<FindPaginatedPetsData, true>, "query"> &
 *   { query?: Omit<NonNullable<FindPaginatedPetsData["query"]>, "page"> };
 */
export function buildInfiniteClientOptionsType(
  op: HookOperation,
  ctx: GenerationContext,
): TypeStatement {
  const dataTypeName = getDataTypeName(op);
  const type = `Omit<Options<${dataTypeName}, true>, "query"> & { query?: Omit<NonNullable<${dataTypeName}["query"]>, "${ctx.pageParam}"> }`;

  return {
    kind: "type",
    name: hookNames(op).infiniteClientOptions,
    type,
    models: dataModels(op),
  };
}

/**
 * Build the infinite query key constant.
 * Shares the plain query key as its first segment so a single
 * `invalidateQueries({ queryKey: [useXKey] })` matches both the plain and the
 * infinite cache entries of an operation (#174), while the extra "infinite"
 * segment keeps cached InfiniteData from colliding with plain query data (#140).
 * Example: export const useFindPaginatedPetsInfiniteKey = [useFindPaginatedPetsKey, "infinite"] as const;
 */
export function buildInfiniteQueryKeyConst(op: HookOperation): ConstStatement {
  return {
    kind: "const",
    name: hookNames(op).infiniteKey,
    initializer: `[${hookNames(op).key}, "infinite"] as const`,
  };
}

/**
 * Build the infinite query key function.
 * The custom queryKey argument only replaces the params segment — the
 * hierarchical [opKey, "infinite"] prefix is always preserved so
 * prefix-based invalidation keeps working.
 * Example: export const UseFindPaginatedPetsInfiniteKeyFn = (clientOptions: FindPaginatedPetsInfiniteClientOptions = {}, queryKey?: Array<unknown>) =>
 *   [...useFindPaginatedPetsInfiniteKey, ...(queryKey ?? [clientOptions])];
 */
export function buildInfiniteQueryKeyFn(op: HookOperation): ConstStatement {
  const names = hookNames(op);
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  const params = [
    `clientOptions: ${names.infiniteClientOptions}${defaultValue}`,
    "queryKey?: Array<unknown>",
  ];

  return {
    kind: "const",
    name: names.infiniteKeyFn,
    initializer: `(${params.join(", ")}) => [...${names.infiniteKey}, ...(queryKey ?? [clientOptions])]`,
  };
}
