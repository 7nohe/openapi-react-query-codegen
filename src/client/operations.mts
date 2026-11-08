import {
  nameFromPath,
  toFunctionName,
  toTypeName,
  uniqueName,
} from "./naming.mjs";
import type { SchemaCtx } from "./schema.mjs";
import { componentSchemaKey, docComment, renderSchema } from "./schema.mjs";
import { type Doc, getByPointer, type Json } from "./spec.mjs";

export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type ParameterLocation = "path" | "query" | "header" | "cookie";

export interface ParameterIR {
  name: string;
  in: ParameterLocation;
  required: boolean;
  schema: Json;
  description?: string;
  deprecated?: boolean;
  style?: string;
  explode?: boolean;
}

export type BodyKind = "json" | "form-data" | "urlencoded" | "text" | "binary";

export interface BodyIR {
  required: boolean;
  description?: string;
  mediaType: string;
  kind: BodyKind;
  schema: Json;
}

export interface ResponseIR {
  /** `200`, `404`, `2XX` or `default` */
  status: string;
  description?: string;
  schema?: Json;
  mediaType?: string;
}

export interface SecurityIR {
  type: "http" | "apiKey" | "oauth2" | "openIdConnect";
  scheme?: string;
  in?: "header" | "query" | "cookie";
  name?: string;
}

export interface OperationIR {
  /** Generated function name, e.g. `findPets` */
  functionName: string;
  /** PascalCase stem shared by the generated types, e.g. `FindPets` */
  typeStem: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  parameters: ParameterIR[];
  body?: BodyIR;
  responses: ResponseIR[];
  security: SecurityIR[];
  /** `/** ... *\/` block, or undefined when the operation has no docs */
  jsDoc?: string;
}

/**
 * Follow a `$ref` that points outside `components.schemas` (parameters,
 * request bodies, responses, path items …). Schema refs are kept as they are.
 */
export function deref(doc: Doc, node: Json, depth = 0): Json {
  if (
    node &&
    typeof node === "object" &&
    typeof node.$ref === "string" &&
    depth < 32
  ) {
    const target = getByPointer(doc, node.$ref);
    if (target === undefined) {
      throw new Error(`Unresolvable $ref: ${node.$ref}`);
    }
    return deref(doc, target, depth + 1);
  }
  return node;
}

function mediaKind(mediaType: string): BodyKind {
  const type = mediaType.toLowerCase().split(";")[0].trim();
  if (type === "application/json" || type.endsWith("+json")) return "json";
  if (type === "multipart/form-data") return "form-data";
  if (type === "application/x-www-form-urlencoded") return "urlencoded";
  if (type.startsWith("text/")) return "text";
  return "binary";
}

function pickContent(
  content: Record<string, Json> | undefined,
): { mediaType: string; media: Json } | undefined {
  if (!content) return undefined;
  const entries = Object.entries(content);
  if (entries.length === 0) return undefined;
  const json = entries.find(([type]) => mediaKind(type) === "json");
  const [mediaType, media] = json ?? entries[0];
  return { mediaType, media };
}

function buildJsDoc(
  summary: string | undefined,
  description: string | undefined,
  deprecated: boolean,
): string | undefined {
  const text = description ?? summary;
  const block = docComment({ description: text, deprecated });
  return block ? block.trimEnd() : undefined;
}

function mergeParameters(doc: Doc, pathItem: Json, operation: Json) {
  const merged = new Map<string, ParameterIR>();
  for (const list of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const parameter = deref(doc, raw);
      if (!parameter?.name || !parameter.in) continue;
      const location = parameter.in as ParameterLocation;
      merged.set(`${location}:${parameter.name}`, {
        name: parameter.name,
        in: location,
        required: location === "path" ? true : parameter.required === true,
        schema:
          parameter.schema ?? parameter.content?.["application/json"]?.schema,
        description: parameter.description,
        deprecated: parameter.deprecated === true,
        style: parameter.style,
        explode: parameter.explode,
      });
    }
  }
  return [...merged.values()];
}

function collectSecurity(doc: Doc, requirements: Json): SecurityIR[] {
  const schemes = doc.components?.securitySchemes ?? {};
  const result: SecurityIR[] = [];
  const seen = new Set<string>();
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    for (const name of Object.keys(requirement ?? {})) {
      const scheme = deref(doc, schemes[name]);
      if (!scheme?.type) continue;
      const entry: SecurityIR = { type: scheme.type };
      if (scheme.type === "http")
        entry.scheme = String(scheme.scheme).toLowerCase();
      if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
        entry.type = "http";
        entry.scheme = "bearer";
      }
      if (scheme.type === "apiKey") {
        entry.in = scheme.in;
        entry.name = scheme.name;
      }
      const id = JSON.stringify(entry);
      if (!seen.has(id)) {
        seen.add(id);
        result.push(entry);
      }
    }
  }
  return result;
}

/** Walk `paths` and normalise every operation. */
export function collectOperations(
  doc: Doc,
  options: { useOperationId?: boolean } = {},
): OperationIR[] {
  const useOperationId = options.useOperationId ?? true;
  const operations: OperationIR[] = [];
  const usedNames = new Set<string>();
  const paths: Record<string, Json> = doc.paths ?? {};

  for (const [pathKey, rawPathItem] of Object.entries(paths)) {
    const pathItem = deref(doc, rawPathItem) ?? {};
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const baseName =
        useOperationId && operation.operationId
          ? String(operation.operationId)
          : nameFromPath(method, pathKey);
      const functionName = uniqueName(toFunctionName(baseName), usedNames);
      const typeStem =
        functionName.charAt(0).toUpperCase() + functionName.slice(1);

      const parameters = mergeParameters(doc, pathItem, operation);

      let body: BodyIR | undefined;
      const requestBody = deref(doc, operation.requestBody);
      const bodyContent = pickContent(requestBody?.content);
      if (requestBody && bodyContent) {
        body = {
          required: requestBody.required === true,
          description: requestBody.description,
          mediaType: bodyContent.mediaType,
          kind: mediaKind(bodyContent.mediaType),
          schema: bodyContent.media?.schema,
        };
      }

      const responses: ResponseIR[] = [];
      for (const [status, rawResponse] of Object.entries(
        (operation.responses ?? {}) as Record<string, Json>,
      )) {
        const response = deref(doc, rawResponse) ?? {};
        const content = pickContent(response.content);
        responses.push({
          status:
            status.toUpperCase() === "DEFAULT"
              ? "default"
              : status.toUpperCase(),
          description: response.description,
          schema: content?.media?.schema,
          mediaType: content?.mediaType,
        });
      }

      const deprecated = operation.deprecated === true;
      operations.push({
        functionName,
        typeStem,
        method,
        path: pathKey,
        summary: operation.summary,
        description: operation.description,
        deprecated,
        parameters,
        body,
        responses,
        security: collectSecurity(doc, operation.security ?? doc.security),
        jsDoc: buildJsDoc(operation.summary, operation.description, deprecated),
      });
    }
  }
  return operations;
}

/** Map every component schema key to its generated type name. */
export function buildSchemaNames(doc: Doc): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const key of Object.keys(doc.components?.schemas ?? {})) {
    names.set(key, uniqueName(toTypeName(key), used));
  }
  return names;
}

export type SuccessKind = "success" | "error";

/** Split responses into the ones exposed as data and as errors. */
export function classifyResponses(operation: OperationIR): {
  responses: ResponseIR[];
  errors: ResponseIR[];
} {
  const responses: ResponseIR[] = [];
  const errors: ResponseIR[] = [];
  for (const response of operation.responses) {
    if (response.status === "default") continue;
    if (/^[45]/.test(response.status)) errors.push(response);
    else responses.push(response);
  }
  const fallback = operation.responses.find(
    (response) => response.status === "default",
  );
  if (fallback) {
    errors.push(fallback);
    if (responses.length === 0) responses.push(fallback);
  }
  return { responses, errors };
}

export function parameterType(parameter: ParameterIR, ctx: SchemaCtx): string {
  return renderSchema(parameter.schema, ctx);
}

/** Resolve a schema (following `$ref` chains) down to its leading primitive. */
export function schemaPrimitiveKind(
  doc: Doc,
  schema: Json,
  depth = 0,
): "string" | "number" | "other" {
  if (!schema || typeof schema !== "object" || depth > 16) return "other";
  if (typeof schema.$ref === "string") {
    const key = componentSchemaKey(schema.$ref);
    const target =
      key !== undefined
        ? doc.components?.schemas?.[key]
        : getByPointer(doc, schema.$ref);
    return schemaPrimitiveKind(doc, target, depth + 1);
  }
  const kinds = new Set<string>();
  const collect = (value: Json) => {
    if (value === null) return;
    if (typeof value === "string") kinds.add("string");
    else if (typeof value === "number") kinds.add("number");
    else kinds.add("other");
  };
  if (Array.isArray(schema.enum)) {
    for (const value of schema.enum) collect(value);
  } else {
    const types = (
      Array.isArray(schema.type) ? schema.type : [schema.type]
    ).filter((type: string) => type !== "null");
    for (const type of types) {
      if (type === "string") kinds.add("string");
      else if (type === "number" || type === "integer") kinds.add("number");
      else kinds.add("other");
    }
  }
  if (kinds.size === 1) {
    const [only] = kinds;
    if (only === "string" || only === "number") return only;
  }
  return "other";
}
