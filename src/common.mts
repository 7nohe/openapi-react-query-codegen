import type { PathLike } from "node:fs";
import { stat } from "node:fs/promises";
import type {
	JSDoc,
	MethodDeclaration,
	ParameterDeclaration,
	SourceFile,
	Type,
} from "ts-morph";
import ts from "typescript";

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

export const getNameFromMethod = (method: MethodDeclaration) => {
	return method.getName();
};

export type MethodDescription = {
	className: string;
	node: SourceFile;
	method: MethodDeclaration;
	methodBlock: ts.Block;
	httpMethodName: string;
	jsDoc: JSDoc[];
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
