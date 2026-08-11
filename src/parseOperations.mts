import {
  Node,
  type ParameterDeclaration,
  type Project,
  type VariableDeclaration,
} from "ts-morph";
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
  PageParamTypeKind,
} from "./types.mjs";

type PageParamInfo = {
  type: string;
  typeKind: PageParamTypeKind;
};

function getPageParamTypeKind(type: ts.Type): PageParamTypeKind {
  const types = type.isUnion()
    ? type.types.filter(
        (item) => !(item.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
      )
    : [type];

  if (
    types.length > 0 &&
    types.every((item) => item.flags & ts.TypeFlags.StringLike)
  ) {
    return "string";
  }
  if (
    types.length > 0 &&
    types.every((item) => item.flags & ts.TypeFlags.NumberLike)
  ) {
    return "number";
  }
  return "other";
}

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
 * Read the operation's Data type name from the first type argument of the
 * SDK options parameter (`Options<XData, ThrowOnError>`).
 * See OperationInfo.dataTypeName for why the name is read from the signature
 * instead of derived from the method name (#213).
 */
function getDataTypeNameFromSignature(
  optionsParam: ParameterDeclaration | undefined,
): string | undefined {
  const typeNode = optionsParam?.getTypeNode();
  if (!typeNode || !Node.isTypeReference(typeNode)) return undefined;
  if (typeNode.getTypeName().getText() !== "Options") return undefined;
  const [dataTypeArg] = typeNode.getTypeArguments();
  return dataTypeArg?.getText();
}

/**
 * Get paginatable Data types by checking if they have the pageParam in their query property.
 * Uses TypeScript compiler API for accurate AST traversal.
 * The map is keyed by the Data type name (e.g., "FindPetsData") so callers can
 * look it up with the name read from the SDK signature.
 */
function getPaginatableMethods(
  project: Project,
  pageParam: string,
): Map<string, PageParamInfo> {
  const modelsFile = project
    .getSourceFiles()
    .find((sf) => sf.getFilePath().includes(modelsFileName));

  if (!modelsFile) return new Map();

  const paginatableMethods = new Map<string, PageParamInfo>();
  const typeChecker = project.getTypeChecker().compilerObject;
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

    const pageParamNode = (queryType as ts.TypeLiteralNode).members.find(
      (m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && m.name?.getText() === pageParam,
    );

    if (pageParamNode) {
      const pageParamType = pageParamNode.type?.getText(
        modelsFile.compilerNode,
      );
      const resolvedType = typeChecker.getTypeAtLocation(
        pageParamNode.type ?? pageParamNode,
      );
      paginatableMethods.set(key, {
        type: pageParamType ?? "unknown",
        typeKind: getPageParamTypeKind(resolvedType),
      });
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
    // Use the SDK function's parameter optionality as the authoritative check.
    // Generic types like Options<XData, ThrowOnError> may not resolve correctly
    // via extractPropertiesFromObjectParam for type alias properties (path, url).
    const sdkParams = getVariableArrowFunctionParameters(desc.method);
    const allParamsOptional =
      sdkParams.length === 0 || sdkParams[0].isOptional();
    const dataTypeName = getDataTypeNameFromSignature(sdkParams[0]);
    const pageParamInfo = dataTypeName
      ? paginatableMethods.get(dataTypeName)
      : undefined;
    const isPaginatable = httpMethod === "GET" && pageParamInfo !== undefined;

    return {
      methodName,
      capitalizedMethodName: capitalizeFirstLetter(methodName),
      dataTypeName,
      httpMethod,
      jsDoc: desc.jsDoc,
      isDeprecated: desc.isDeprecated,
      parameters,
      allParamsOptional,
      isPaginatable,
      pageParamType: isPaginatable ? pageParamInfo.type : undefined,
      pageParamTypeKind: isPaginatable ? pageParamInfo.typeKind : undefined,
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
  omitInitialPageParam: boolean,
  version: string,
): GenerationContext {
  const modelsFile = project
    .getSourceFiles()
    .find((sf) => sf.getFilePath().includes(modelsFileName));

  const serviceFile = project
    .getSourceFiles()
    .find((sf) => sf.getFilePath().includes(serviceFileName));

  if (!serviceFile) {
    throw new Error("No service node found");
  }

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
    omitInitialPageParam,
    version,
  };
}
