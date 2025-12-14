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
