import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";

/**
 * Build query key constant name (e.g., "findPetsQueryKey").
 */
export function getQueryKeyName(op: OperationInfo): string {
  return `${op.methodName}QueryKey`;
}

/**
 * Build mutation key constant name (e.g., "addPetMutationKey").
 */
export function getMutationKeyName(op: OperationInfo): string {
  return `${op.methodName}MutationKey`;
}

/**
 * Build query key fn name (e.g., "FindPetsQueryKeyFn").
 */
export function getQueryKeyFnName(op: OperationInfo): string {
  return `${op.capitalizedMethodName}QueryKeyFn`;
}

/**
 * Build mutation key fn name (e.g., "AddPetMutationKeyFn").
 */
export function getMutationKeyFnName(op: OperationInfo): string {
  return `${op.capitalizedMethodName}MutationKeyFn`;
}

/**
 * Build the query key constant export.
 * Example: export const findPetsQueryKey = "FindPets";
 */
export function buildQueryKeyExport(
  op: OperationInfo,
): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: getQueryKeyName(op),
        initializer: `"${op.capitalizedMethodName}"`,
      },
    ],
  };
}

/**
 * Build the mutation key constant export.
 * Example: export const addPetMutationKey = "AddPet";
 */
export function buildMutationKeyExport(
  op: OperationInfo,
): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: getMutationKeyName(op),
        initializer: `"${op.capitalizedMethodName}"`,
      },
    ],
  };
}

/**
 * Build the query key function export.
 * Example:
 * export const FindPetsQueryKeyFn = (clientOptions: Options<FindPetsData, true>, queryKey?: Array<unknown>) =>
 *   [findPetsQueryKey, ...(queryKey ?? [clientOptions])] as const;
 */
export function buildQueryKeyFnExport(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const hasParams = op.parameters.length > 0;
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const params: string[] = [];
  if (hasParams) {
    const defaultValue = op.allParamsOptional ? " = {}" : "";
    params.push(`clientOptions: Options<${dataTypeName}, true>${defaultValue}`);
  }
  params.push("queryKey?: Array<unknown>");

  const fallbackArray = hasParams ? "[clientOptions]" : "[]";
  const body = `[${getQueryKeyName(op)}, ...(queryKey ?? ${fallbackArray})] as const`;

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: getQueryKeyFnName(op),
        initializer: `(${params.join(", ")}) => ${body}`,
      },
    ],
  };
}

/**
 * Build the mutation key function export.
 * Example:
 * export const AddPetMutationKeyFn = (mutationKey?: Array<unknown>) =>
 *   [addPetMutationKey, ...(mutationKey ?? [])] as const;
 */
export function buildMutationKeyFnExport(
  op: OperationInfo,
): VariableStatementStructure {
  const body = `[${getMutationKeyName(op)}, ...(mutationKey ?? [])] as const`;

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: getMutationKeyFnName(op),
        initializer: `(mutationKey?: Array<unknown>) => ${body}`,
      },
    ],
  };
}
