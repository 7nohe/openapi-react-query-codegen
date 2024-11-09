import type { PathLike } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type {
  ClassDeclaration,
  ParameterDeclaration,
  SourceFile,
  Type,
  VariableDeclaration,
} from "ts-morph";
import { ArrowFunction } from "ts-morph";
import ts from "typescript";
import type { LimitedUserConfig } from "./cli.mjs";
import { queriesOutputPath, requestsOutputPath } from "./constants.mjs";

export const TData = ts.factory.createIdentifier("TData");
export const TError = ts.factory.createIdentifier("TError");
export const TContext = ts.factory.createIdentifier("TContext");

export const EqualsOrGreaterThanToken = ts.factory.createToken(
  ts.SyntaxKind.EqualsGreaterThanToken,
);

export const QuestionToken = ts.factory.createToken(
  ts.SyntaxKind.QuestionToken,
);

export const queryKeyGenericType =
  ts.factory.createTypeReferenceNode("TQueryKey");
export const queryKeyConstraint = ts.factory.createTypeReferenceNode("Array", [
  ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
]);

export const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const lowercaseFirstLetter = (str: string) => {
  return str.charAt(0).toLowerCase() + str.slice(1);
};

export const getVariableArrowFunctionParameters = (
  variable: VariableDeclaration,
) => {
  const initializer = variable.getInitializer();
  if (!initializer) {
    throw new Error("Initializer not found");
  }
  if (!ArrowFunction.isArrowFunction(initializer)) {
    throw new Error("Initializer is not an arrow function");
  }
  return initializer.getParameters();
};

export const getNameFromVariable = (variable: VariableDeclaration) => {
  const variableName = variable.getName();
  if (!variableName) {
    throw new Error("Variable name not found");
  }
  return variableName;
};

export type FunctionDescription = {
  node: SourceFile;
  method: VariableDeclaration;
  methodBlock: ts.Block;
  httpMethodName: string;
  jsDoc: string;
  isDeprecated: boolean;
};

export async function exists(f: PathLike) {
  try {
    await stat(f);
    return true;
  } catch {
    return false;
  }
}

const Common = "Common";

/**
 * Build a common type name by prepending the Common namespace.
 */
export function BuildCommonTypeName(name: string | ts.Identifier) {
  if (typeof name === "string") {
    return ts.factory.createIdentifier(`${Common}.${name}`);
  }
  return ts.factory.createIdentifier(`${Common}.${name.text}`);
}

/**
 * Safely parse a value into a number. Checks for NaN and Infinity.
 * Returns NaN if the string is not a valid number.
 * @param value The value to parse.
 * @returns The parsed number or NaN if the value is not a valid number.
 */
export function safeParseNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    return parsed;
  }
  return Number.NaN;
}

export function extractPropertiesFromObjectParam(param: ParameterDeclaration) {
  const referenced = param.findReferences()[0];
  const def = referenced.getDefinition();
  const paramNodes = def
    .getNode()
    .getType()
    .getProperties()
    .filter((prop) => prop.getValueDeclaration()?.getType())
    .map((prop) => {
      return {
        name: prop.getName(),
        optional: prop.isOptional(),
        type: prop.getValueDeclaration()?.getType(),
      };
    });
  return paramNodes;
}

/**
 * Replace the import("...") surrounding the type if there is one.
 * This can happen when the type is imported from another file, but
 * we are already importing all the types from that file.
 *
 * https://regex101.com/r/3DyHaQ/1
 *
 * TODO: Replace with a more robust solution.
 */
export function getShortType(type: string) {
  return type.replaceAll(/import\(".*?"\)\./g, "");
}

export function getClassesFromService(node: SourceFile) {
  const klasses = node.getClasses();

  if (!klasses.length) {
    throw new Error("No classes found");
  }

  return klasses.map((klass) => {
    const className = klass.getName();
    if (!className) {
      throw new Error("Class name not found");
    }
    return {
      className,
      klass,
    };
  });
}

export function getClassNameFromClassNode(klass: ClassDeclaration) {
  const className = klass.getName();

  if (!className) {
    throw new Error("Class name not found");
  }
  return className;
}

export function formatOptions(options: LimitedUserConfig) {
  // loop through properties on the options object
  // if the property is a string of number then convert it to a number
  // if the property is a string of boolean then convert it to a boolean
  const formattedOptions = Object.entries(options).reduce(
    (acc, [key, value]) => {
      const typedKey = key as keyof LimitedUserConfig;
      const typedValue = value as (typeof options)[keyof LimitedUserConfig];
      const parsedNumber = safeParseNumber(typedValue);
      if (value === "true" || value === true) {
        (acc as unknown as Record<string, boolean>)[typedKey] = true;
      } else if (value === "false" || value === false) {
        (acc as unknown as Record<string, boolean>)[typedKey] = false;
      } else if (!Number.isNaN(parsedNumber)) {
        (acc as unknown as Record<string, number>)[typedKey] = parsedNumber;
      } else {
        (
          acc as unknown as Record<
            string,
            string | number | undefined | boolean
          >
        )[typedKey] = typedValue;
      }
      return acc;
    },
    options,
  );
  return formattedOptions;
}

export function buildRequestsOutputPath(outputPath: string) {
  return path.join(outputPath, requestsOutputPath);
}

export function buildQueriesOutputPath(outputPath: string) {
  return path.join(outputPath, queriesOutputPath);
}

export function getQueryKeyFnName(queryKey: string) {
  return `${capitalizeFirstLetter(queryKey)}Fn`;
}

/**
 * Create QueryKey/MutationKey exports
 */
export function createQueryKeyExport({
  methodName,
  queryKey,
}: {
  methodName: string;
  queryKey: string;
}) {
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(queryKey),
          undefined,
          undefined,
          ts.factory.createStringLiteral(
            `${capitalizeFirstLetter(methodName)}`,
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

export function createQueryKeyFnExport(
  queryKey: string,
  method: VariableDeclaration,
  type: "query" | "mutation" = "query",
  modelNames: string[] = [],
) {
  // Mutation keys don't require clientOptions
  const params = type === "query" ? getRequestParamFromMethod(method, undefined, modelNames) : null;

  // override key is used to allow the user to override the the queryKey values
  const overrideKey = ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier(type === "query" ? "queryKey" : "mutationKey"),
    QuestionToken,
    ts.factory.createTypeReferenceNode("Array<unknown>", []),
  );

  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(getQueryKeyFnName(queryKey)),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            params ? [params, overrideKey] : [overrideKey],
            undefined,
            EqualsOrGreaterThanToken,
            type === "query"
              ? queryKeyFn(queryKey, method)
              : mutationKeyFn(queryKey),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

function queryKeyFn(
  queryKey: string,
  method: VariableDeclaration,
): ts.Expression {
  return ts.factory.createArrayLiteralExpression(
    [
      ts.factory.createIdentifier(queryKey),
      ts.factory.createSpreadElement(
        ts.factory.createParenthesizedExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier("queryKey"),
            ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
            getVariableArrowFunctionParameters(method)
              ? // [...clientOptions]
                ts.factory.createArrayLiteralExpression([
                  ts.factory.createIdentifier("clientOptions"),
                ])
              : // []
                ts.factory.createArrayLiteralExpression(),
          ),
        ),
      ),
    ],
    false,
  );
}

function mutationKeyFn(mutationKey: string): ts.Expression {
  return ts.factory.createArrayLiteralExpression(
    [
      ts.factory.createIdentifier(mutationKey),
      ts.factory.createSpreadElement(
        ts.factory.createParenthesizedExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier("mutationKey"),
            ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
            ts.factory.createArrayLiteralExpression(),
          ),
        ),
      ),
    ],
    false,
  );
}

export function getRequestParamFromMethod(
  method: VariableDeclaration,
  pageParam?: string,
  modelNames: string[] = [],
) {
  if (!getVariableArrowFunctionParameters(method).length) {
    return null;
  }
  const methodName = getNameFromVariable(method);

  const params = getVariableArrowFunctionParameters(method).flatMap((param) => {
    const paramNodes = extractPropertiesFromObjectParam(param);

    return paramNodes
      .filter((p) => p.name !== pageParam)
      .map((refParam) => ({
        name: refParam.name,
        // TODO: Client<Request, Response, unknown, RequestOptions> -> Client<Request, Response, unknown>
        typeName: getShortType(refParam.type?.getText() ?? ""),
        optional: refParam.optional,
      }));
  });

  const areAllPropertiesOptional = params.every((param) => param.optional);

  return ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier("clientOptions"),
    undefined,
    ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Options"), [
      ts.factory.createTypeReferenceNode(
        modelNames.includes(`${capitalizeFirstLetter(methodName)}Data`)
          ? `${capitalizeFirstLetter(methodName)}Data`
          : "unknown",
      ),
      ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("true")),
    ]),
    // if all params are optional, we create an empty object literal
    // so the hook can be called without any parameters
    areAllPropertiesOptional
      ? ts.factory.createObjectLiteralExpression()
      : undefined,
  );
}
