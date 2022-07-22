import ts from "typescript";
import type { OpenAPIV3 } from "openapi-types";
import { createLiteralNodeFromProperties } from "./types";

export function toParamObjects(
  params: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[]
): OpenAPIV3.ParameterObject[] {
  return params?.filter(<typeof isParameterObject>isParameterObject) ?? [];
}

export function isParameterObject(
  param: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject
): param is OpenAPIV3.ParameterObject {
  return "name" in param;
}

export function isReferenceObject(
  item?: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject
): item is OpenAPIV3.ReferenceObject {
  return item !== undefined && "$ref" in item;
}

const unknown = ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);

export function schemaObjectOrRefType(
  schema?: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): { node: ts.TypeNode; id: string } {
  if (!schema) {
    return { node: unknown, id: "unknown" };
  }

  if (isReferenceObject(schema)) {
    return referenceType(schema);
  }

  return schemaObjectType(schema);
}

function schemaObjectType(
  schema: OpenAPIV3.SchemaObject
): ReturnType<typeof schemaObjectOrRefType> {
  if (schema.type === "array") {
    return arrayType(schema.items);
  }

  if (schema.type === "object") {
    return objectType(schema);
  }

  return { node: primitiveType(schema.type), id: "unknown" };
}

function primitiveType(
  type?: Omit<OpenAPIV3.NonArraySchemaObjectType, "object">
) {
  switch (type) {
    case "string":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    case "integer":
    case "number":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    case "boolean":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
    default:
      return unknown;
  }
}

function objectType(
  item: OpenAPIV3.NonArraySchemaObject
): ReturnType<typeof schemaObjectOrRefType> {
  return {
    node: createLiteralNodeFromProperties(item),
    id: "object", // stringify type maybe here
  };
}

function referenceType(
  item: OpenAPIV3.ReferenceObject
): ReturnType<typeof schemaObjectOrRefType> {
  const name = refToTypeName(item.$ref);
  return {
    node: ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(name)),
    id: name,
  };
}

function arrayType(
  items: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): ReturnType<typeof schemaObjectOrRefType> {
  const type = isReferenceObject(items)
    ? referenceType(items)
    : schemaObjectType(items);

  return {
    node: ts.factory.createArrayTypeNode(type.node),
    id: type.id + "[]",
  };
}

export function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function lowercaseFirstLetter(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Normalizes operation id's so there is consistency
 * @param operationId Raw value from openapi file
 * @returns normalized value with underscores and dashes removed, and in camelCase
 * @example normalizeOperationId("helloGoodbye") // helloGoodbye
 * @example normalizeOperationId("test1-test8-test1_test2") // test1Test8Test1Test2
 * @example normalizeOperationId("Test1_test8-test1_test2") // test1Test8Test1Test2
 */
export function normalizeOperationId(operationId: string) {
  const split = operationId
    .split("-")
    .flatMap((x) => x.split("_"))
    .map((x, i) =>
      i === 0 ? lowercaseFirstLetter(x) : capitalizeFirstLetter(x)
    );
  return split.join("");
}

export function isRequestBodyObject(
  obj: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject
): obj is OpenAPIV3.RequestBodyObject {
  return "content" in obj;
}

/**
 * Removes the path in the ref and just returns the last part, which is used as the Type name
 * @param ref The ref in the OpenAPI file
 * @returns The type name
 */
export function refToTypeName(ref: string) {
  if (ref.startsWith("#/components/schemas/")) {
    return ref.slice(21);
  }

  return ref;
}

export function createParams(item: OpenAPIV3.OperationObject) {
  if (!item.parameters) {
    return [];
  }

  const paramObjects = toParamObjects(item.parameters);

  return paramObjects
    .sort((x, y) => (x.required === y.required ? 0 : x.required ? -1 : 1)) // put all optional values at the end
    .map((param) => ({
      required: param.required ?? false,
      name: ts.factory.createIdentifier(param.name),
      arrowFuncParam: ts.factory.createParameterDeclaration(
        /*decorators*/ undefined,
        /*modifiers*/ undefined,
        /*dotDotDotToken*/ undefined,
        /*name*/ ts.factory.createIdentifier(param.name),
        /*questionToken*/ param.required
          ? undefined
          : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        /*type*/ schemaObjectOrRefType(param.schema).node,
        /*initializer*/ undefined
      ),
    }));
}