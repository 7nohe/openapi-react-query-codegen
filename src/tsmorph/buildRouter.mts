import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";

/**
 * Build the withQueryPrefetch helper.
 * This helper provides event handlers for hover/touch prefetching.
 *
 * Example output:
 * export const withQueryPrefetch = (prefetch: () => Promise<unknown>) => ({
 *   onMouseEnter: () => void prefetch(),
 *   onTouchStart: () => void prefetch(),
 * });
 */
export function buildWithQueryPrefetch(): VariableStatementStructure {
  const initializer = `(prefetch: () => Promise<unknown>) => ({
  onMouseEnter: () => void prefetch(),
  onTouchStart: () => void prefetch(),
})`;

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: "withQueryPrefetch",
        initializer,
      },
    ],
  };
}

/**
 * Check if an operation has a path parameter that is not `never`.
 */
function hasPathParam(op: OperationInfo): boolean {
  const pathParam = op.parameters.find((p) => p.name === "path");
  return Boolean(pathParam && pathParam.typeName !== "never");
}

/**
 * Get required top-level keys (non-optional, non-never).
 */
function getRequiredTopLevelKeys(op: OperationInfo): string[] {
  return op.parameters
    .filter((p) => !p.optional && p.typeName !== "never")
    .map((p) => p.name);
}

/**
 * Build loader factory for a GET operation.
 *
 * For operations without path parameter:
 * export const loaderUseFindPets = (deps: {
 *   queryClient: QueryClient;
 *   clientOptions?: Options<FindPetsData, true>;
 * }) => async () => {
 *   await ensureUseFindPetsData(deps.queryClient, deps.clientOptions);
 *   return null;
 * };
 *
 * For operations with path parameter:
 * export const loaderUseFindPetById = (deps: {
 *   queryClient: QueryClient;
 *   clientOptions?: Omit<Options<FindPetByIdData, true>, "path">;
 * }) => async ({ params }: { params: FindPetByIdData["path"] }) => {
 *   const options: Options<FindPetByIdData, true> = { ...(deps.clientOptions ?? {}), path: params };
 *   await ensureUseFindPetByIdData(deps.queryClient, options);
 *   return null;
 * };
 */
export function buildLoaderFactory(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const loaderName = `loaderUse${op.capitalizedMethodName}`;
  const ensureFnName = `ensureUse${op.capitalizedMethodName}Data`;

  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const hasPath = hasPathParam(op);
  const requiredTopLevelKeys = getRequiredTopLevelKeys(op);
  const requiredNonPathKeys = requiredTopLevelKeys.filter((k) => k !== "path");

  // Determine if clientOptions should be optional
  const clientOptionsOptional = hasPath
    ? requiredNonPathKeys.length === 0
    : requiredTopLevelKeys.length === 0;

  const optionalMark = clientOptionsOptional ? "?" : "";

  let initializer: string;

  if (hasPath) {
    // Has path parameter - needs params in returned function
    const clientOptionsType = `Omit<Options<${dataTypeName}, true>, "path">`;
    initializer = `(deps: { queryClient: QueryClient; clientOptions${optionalMark}: ${clientOptionsType} }) => async ({ params }: { params: ${dataTypeName}["path"] }) => {
  const options: Options<${dataTypeName}, true> = { ...(deps.clientOptions ?? {}), path: params };
  await ${ensureFnName}(deps.queryClient, options);
  return null;
}`;
  } else {
    // No path parameter - simpler factory
    const clientOptionsType = `Options<${dataTypeName}, true>`;
    initializer = `(deps: { queryClient: QueryClient; clientOptions${optionalMark}: ${clientOptionsType} }) => async () => {
  await ${ensureFnName}(deps.queryClient, deps.clientOptions);
  return null;
}`;
  }

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: loaderName,
        initializer,
      },
    ],
  };
}
