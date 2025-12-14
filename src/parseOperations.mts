import type { Project, VariableDeclaration } from "ts-morph";
import ts from "typescript";
import {
  capitalizeFirstLetter,
  extractPropertiesFromObjectParam,
  getNameFromVariable,
  getShortType,
  getVariableArrowFunctionParameters,
} from "./common.mjs";
import { modelsFileName, serviceFileName } from "./constants.mjs";
import { getServices } from "./service.mjs";
import type {
  GenerationContext,
  OperationInfo,
  OperationParameter,
} from "./types.mjs";

/**
 * Extract parameter information from a method's variable declaration.
 */
function extractParameters(
  method: VariableDeclaration,
  pageParam?: string,
): OperationParameter[] {
  const arrowParams = getVariableArrowFunctionParameters(method);
  if (!arrowParams.length) {
    return [];
  }

  return arrowParams.flatMap((param) => {
    const paramNodes = extractPropertiesFromObjectParam(param);
    return paramNodes
      .filter((p) => p.name !== pageParam)
      .map((refParam) => ({
        name: refParam.name,
        typeName: getShortType(refParam.type?.getText() ?? ""),
        optional: refParam.optional,
      }));
  });
}

/**
 * Get paginatable methods by checking if their Data type has the pageParam in query property.
 * Uses TypeScript compiler API for accurate AST traversal.
 */
function getPaginatableMethods(project: Project, pageParam: string): string[] {
  const modelsFile = project
    .getSourceFiles()
    .find((sf) => sf.getFilePath().includes(modelsFileName));

  if (!modelsFile) return [];

  const paginatableMethods: string[] = [];
  const modelDeclarations = modelsFile.getExportedDeclarations();
  const entries = modelDeclarations.entries();

  for (const [key, value] of entries) {
    // Check if this is a *Data type (e.g., FindPetsData)
    if (!key.endsWith("Data")) continue;

    const node = value[0].compilerNode;
    if (!ts.isTypeAliasDeclaration(node)) continue;

    const typeAliasDeclaration = node.type;
    if (typeAliasDeclaration.kind !== ts.SyntaxKind.TypeLiteral) continue;

    // Look for 'query' property in the type literal
    const query = (typeAliasDeclaration as ts.TypeLiteralNode).members.find(
      (m) =>
        m.kind === ts.SyntaxKind.PropertySignature &&
        m.name?.getText() === "query",
    );

    if (!query) continue;

    // Check if query type has the pageParam
    const queryType = (query as ts.PropertySignature).type;
    if (!queryType || queryType.kind !== ts.SyntaxKind.TypeLiteral) continue;

    const hasPageParam = (queryType as ts.TypeLiteralNode).members.some(
      (m) => m.name?.getText() === pageParam,
    );

    if (hasPageParam) {
      // Extract method name from Data type name (e.g., "FindPetsData" -> "findPets")
      const methodName = key.slice(0, -4); // Remove "Data" suffix
      // Convert first letter to lowercase
      const methodNameLower =
        methodName.charAt(0).toLowerCase() + methodName.slice(1);
      paginatableMethods.push(methodNameLower);
    }
  }

  return paginatableMethods;
}

/**
 * Parse operations from the OpenAPI-generated service file and return normalized DTOs.
 */
export async function parseOperations(
  project: Project,
  pageParam: string,
): Promise<OperationInfo[]> {
  const service = await getServices(project);
  const { methods } = service;
  const paginatableMethods = getPaginatableMethods(project, pageParam);

  return methods.map((desc) => {
    const methodName = getNameFromVariable(desc.method);
    const httpMethod = desc.httpMethodName.toUpperCase();
    const parameters = extractParameters(desc.method);
    const allParamsOptional = parameters.every((p) => p.optional);
    const isPaginatable =
      httpMethod === "GET" && paginatableMethods.includes(methodName);

    return {
      methodName,
      capitalizedMethodName: capitalizeFirstLetter(methodName),
      httpMethod,
      jsDoc: desc.jsDoc,
      isDeprecated: desc.isDeprecated,
      parameters,
      allParamsOptional,
      isPaginatable,
    };
  });
}

/**
 * Build generation context from project configuration.
 */
export function buildGenerationContext(
  project: Project,
  client: GenerationContext["client"],
  pageParam: string,
  nextPageParam: string,
  initialPageParam: string,
  version: string,
): GenerationContext {
  const modelsFile = project
    .getSourceFiles()
    .find((sf) => sf.getFilePath().includes(modelsFileName));

  const serviceFile = project.getSourceFileOrThrow(`${serviceFileName}.ts`);

  const modelNames = modelsFile
    ? Array.from(modelsFile.getExportedDeclarations().keys())
    : [];

  const serviceNames = Array.from(serviceFile.getExportedDeclarations().keys());

  return {
    client,
    modelNames,
    serviceNames,
    pageParam,
    nextPageParam,
    initialPageParam,
    version,
  };
}
