import type { PathLike } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type {
  ClassDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  SourceFile,
  Type,
} from "ts-morph";
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

export const getNameFromMethod = (method: MethodDeclaration) => {
  const methodName = method.getName();
  if (!methodName) {
    throw new Error("Method name not found");
  }
  return methodName;
};

export type MethodDescription = {
  className: string;
  node: SourceFile;
  method: MethodDeclaration;
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
    .map((prop) => ({
      name: prop.getName(),
      optional: prop.isOptional(),
      type: prop.getValueDeclaration()?.getType() as Type<ts.Type>,
    }));
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
  return type.replaceAll(/import\(".*"\)\./g, "");
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
        (acc as unknown as Record<string, string | undefined | boolean>)[
          typedKey
        ] = typedValue;
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
