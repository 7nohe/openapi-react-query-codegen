import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";
import {
  buildClientOptionsParam,
  buildNestedNextPageType,
  getDataTypeName,
} from "./buildQueryHooks.mjs";

/**
 * Build a queryOptions factory for a GET operation.
 * The factory centralizes queryKey and queryFn so they can be reused with
 * every TanStack Query utility (useQuery, useQueries, prefetchQuery,
 * ensureQueryData, setQueryData, ...) with full type safety.
 * Example:
 * export const findPetsOptions = (clientOptions: Options<FindPetsData, true> = {}, queryKey?: Array<unknown>) =>
 *   queryOptions({
 *     queryKey: Common.UseFindPetsKeyFn(clientOptions, queryKey),
 *     queryFn: () => findPets({ ...clientOptions }).then(response => response.data),
 *   });
 */
export function buildQueryOptionsFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const fnName = `${op.methodName}Options`;
  const clientOptionsParam = buildClientOptionsParam(op, ctx);

  const queryFn = `() => ${op.methodName}({ ...clientOptions }).then(response => response.data)`;
  const body = `queryOptions({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn} })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(${clientOptionsParam}, queryKey?: Array<unknown>) => ${body}`,
      },
    ],
  };
}

/**
 * Build an infiniteQueryOptions factory for a paginatable GET operation.
 * Uses the dedicated infinite query key and page-less options type.
 * Example:
 * export const findPaginatedPetsInfiniteOptions = (clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}, queryKey?: Array<unknown>) =>
 *   infiniteQueryOptions({
 *     queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions, queryKey),
 *     queryFn: ({ pageParam }) => findPaginatedPets({ ...clientOptions, query: { ...clientOptions.query, page: pageParam } } as Options<FindPaginatedPetsData, true>).then(response => response.data),
 *     initialPageParam: 1,
 *     getNextPageParam: (response) => (response as { nextPage: number }).nextPage,
 *   });
 */
export function buildInfiniteQueryOptionsFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure | null {
  if (!op.isPaginatable) {
    return null;
  }

  const fnName = `${op.methodName}InfiniteOptions`;
  const dataTypeName = getDataTypeName(op, ctx);

  const defaultValue = op.allParamsOptional ? " = {}" : "";
  const clientOptionsParam = `clientOptions: Common.${op.capitalizedMethodName}InfiniteClientOptions${defaultValue}`;

  const queryFn = `({ pageParam }) => ${op.methodName}({ ...clientOptions, query: { ...clientOptions.query, ${ctx.pageParam}: pageParam } } as Options<${dataTypeName}, true>).then(response => response.data)`;

  // Emit a numeric literal when possible so the inferred pageParam type
  // matches what getNextPageParam returns
  const initialPageParam = /^-?\d+$/.test(ctx.initialPageParam)
    ? ctx.initialPageParam
    : JSON.stringify(ctx.initialPageParam);

  const nestedType = buildNestedNextPageType(ctx.nextPageParam);
  const getNextPageParam = `(response) => (response as ${nestedType}).${ctx.nextPageParam}`;

  const body = `infiniteQueryOptions({ queryKey: Common.Use${op.capitalizedMethodName}InfiniteKeyFn(clientOptions, queryKey), queryFn: ${queryFn}, initialPageParam: ${initialPageParam}, getNextPageParam: ${getNextPageParam} })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(${clientOptionsParam}, queryKey?: Array<unknown>) => ${body}`,
      },
    ],
  };
}
