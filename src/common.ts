import { type PathLike } from "fs";
import { stat } from "fs/promises";
import ts, { JSDocComment, NodeArray, SourceFile } from "typescript";

export const TData = ts.factory.createIdentifier("TData");
export const TError = ts.factory.createIdentifier("TError");
export const TContext = ts.factory.createIdentifier("TContext");

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

export const getNameFromMethod = (
  method: ts.MethodDeclaration,
  node: ts.SourceFile
) => {
  return method.name.getText(node);
};

export type MethodDescription = {
  className: string;
  node: SourceFile;
  method: ts.MethodDeclaration;
  methodBlock: ts.Block;
  httpMethodName: string;
  jsDoc: (string | NodeArray<JSDocComment> | undefined)[];
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

export function BuildCommonTypeName(name: string | ts.Identifier) {
  if (typeof name === "string") {
    return ts.factory.createIdentifier(`${Common}.${name}`);
  }
  return ts.factory.createIdentifier(`${Common}.${name.text}`);
}
