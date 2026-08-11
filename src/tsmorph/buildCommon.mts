import {
  StructureKind,
  type TypeAliasDeclarationStructure,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";

/**
 * Build the default response type alias.
 * Example: export type FindPetsDefaultResponse = Awaited<ReturnType<typeof findPets>>["data"];
 */
export function buildDefaultResponseType(
  op: OperationInfo,
): TypeAliasDeclarationStructure {
  return {
    kind: StructureKind.TypeAlias,
    isExported: true,
    name: `${op.capitalizedMethodName}DefaultResponse`,
    type: `Awaited<ReturnType<typeof ${op.methodName}>>["data"]`,
  };
}

/**
 * Build the query result type alias.
 * Example: export type FindPetsQueryResult<TData = FindPetsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
 */
export function buildQueryResultType(
  op: OperationInfo,
): TypeAliasDeclarationStructure {
  return {
    kind: StructureKind.TypeAlias,
    isExported: true,
    name: `${op.capitalizedMethodName}QueryResult`,
    typeParameters: [
      { name: "TData", default: `${op.capitalizedMethodName}DefaultResponse` },
      { name: "TError", default: "unknown" },
    ],
    type: "UseQueryResult<TData, TError>",
  };
}

/**
 * Build the mutation result type alias.
 * Example: export type AddPetMutationResult = Awaited<ReturnType<typeof addPet>>;
 */
export function buildMutationResultType(
  op: OperationInfo,
): TypeAliasDeclarationStructure {
  return {
    kind: StructureKind.TypeAlias,
    isExported: true,
    name: `${op.capitalizedMethodName}MutationResult`,
    type: `Awaited<ReturnType<typeof ${op.methodName}>>`,
  };
}

/**
 * Build query key constant.
 * Example: export const useFindPetsKey = "FindPets";
 */
export function buildQueryKeyConst(
  op: OperationInfo,
): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `use${op.capitalizedMethodName}Key`,
        initializer: `"${op.capitalizedMethodName}"`,
      },
    ],
  };
}

/**
 * Build mutation key constant.
 * Example: export const useAddPetKey = "AddPet";
 */
export function buildMutationKeyConst(
  op: OperationInfo,
): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `use${op.capitalizedMethodName}Key`,
        initializer: `"${op.capitalizedMethodName}"`,
      },
    ],
  };
}

/**
 * Build query key function.
 * Example: export const UseFindPetsKeyFn = (clientOptions: Options<FindPetsData, true> = {}, queryKey?: Array<unknown>) =>
 *   [useFindPetsKey, ...(queryKey ?? [clientOptions])];
 */
export function buildQueryKeyFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const params: string[] = [];
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  params.push(`clientOptions: Options<${dataTypeName}, true>${defaultValue}`);
  params.push("queryKey?: Array<unknown>");

  const fallbackArray = "[clientOptions]";

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `Use${op.capitalizedMethodName}KeyFn`,
        initializer: `(${params.join(", ")}) => [use${op.capitalizedMethodName}Key, ...(queryKey ?? ${fallbackArray})]`,
      },
    ],
  };
}

/**
 * Build mutation key function.
 * Example: export const UseAddPetKeyFn = (mutationKey?: Array<unknown>) =>
 *   [useAddPetKey, ...(mutationKey ?? [])];
 */
export function buildMutationKeyFn(
  op: OperationInfo,
): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `Use${op.capitalizedMethodName}KeyFn`,
        initializer: `(mutationKey?: Array<unknown>) => [use${op.capitalizedMethodName}Key, ...(mutationKey ?? [])]`,
      },
    ],
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
  op: OperationInfo,
  ctx: GenerationContext,
): TypeAliasDeclarationStructure {
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const type =
    dataTypeName === "unknown"
      ? "Options<unknown, true>"
      : `Omit<Options<${dataTypeName}, true>, "query"> & { query?: Omit<NonNullable<${dataTypeName}["query"]>, "${ctx.pageParam}"> }`;

  return {
    kind: StructureKind.TypeAlias,
    isExported: true,
    name: `${op.capitalizedMethodName}InfiniteClientOptions`,
    type,
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
export function buildInfiniteQueryKeyConst(
  op: OperationInfo,
): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `use${op.capitalizedMethodName}InfiniteKey`,
        initializer: `[use${op.capitalizedMethodName}Key, "infinite"] as const`,
      },
    ],
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
export function buildInfiniteQueryKeyFn(
  op: OperationInfo,
): VariableStatementStructure {
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  const params = [
    `clientOptions: ${op.capitalizedMethodName}InfiniteClientOptions${defaultValue}`,
    "queryKey?: Array<unknown>",
  ];

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `Use${op.capitalizedMethodName}InfiniteKeyFn`,
        initializer: `(${params.join(", ")}) => [...use${op.capitalizedMethodName}InfiniteKey, ...(queryKey ?? [clientOptions])]`,
      },
    ],
  };
}
