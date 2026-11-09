import {
  nameFromPath,
  toFunctionName,
  toTypeName,
  uniqueName,
} from "./naming.mjs";
import { docComment, findReadWriteOnlyKeys } from "./schema.mjs";
import { type Doc, getByPointer, type Json, resolveRef } from "./spec.mjs";

/**
 * Type names a schema or an operation type cannot take: `ClientOptions` and
 * `Options` are exported next to them, and the rest are what the generated hook
 * files import or use, where an imported model of the same name would clash
 * with or shadow them.
 */
const RESERVED_TYPE_NAMES: readonly string[] = [
  "ClientOptions",
  "Options",
  "Common",
  "AxiosError",
  "EnsureQueryDataOptions",
  "FetchInfiniteQueryOptions",
  "FetchQueryOptions",
  "GetNextPageParamFunction",
  "InfiniteData",
  "QueryClient",
  "UseInfiniteQueryOptions",
  "UseMutationOptions",
  "UseMutationResult",
  "UseQueryOptions",
  "UseQueryResult",
  "UseSuspenseInfiniteQueryOptions",
  "UseSuspenseQueryOptions",
  "Array",
  "Awaited",
  "NonNullable",
  "Omit",
  "Partial",
  "Pick",
  "Promise",
  "Record",
  "ReturnType",
];

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

type ParameterLocation = "path" | "query" | "header";

export interface ParameterIR {
  name: string;
  in: ParameterLocation;
  required: boolean;
  schema: Json;
  description?: string;
  deprecated?: boolean;
  style?: string;
  explode?: boolean;
  /** Declared with `content` as JSON, so the value is sent as a JSON text. */
  json?: boolean;
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
  /** Every media type the response declares. */
  mediaTypes: string[];
}

export interface SecurityIR {
  type: "http" | "apiKey";
  scheme?: "basic" | "bearer";
  in?: "header" | "query" | "cookie";
  name?: string;
  /** The scheme's name, when another scheme would look the same at runtime. */
  key?: string;
}

export interface OperationTypeNames {
  data: string;
  errors: string;
  error: string;
  responses: string;
  response: string;
}

export interface OperationIR {
  /** Generated function name, e.g. `findPets` */
  functionName: string;
  /**
   * Names of the operation's generated types. Each is the capitalized function
   * name plus a suffix; a name that collides with a schema or another
   * operation's type gets a number appended on its own (`ListRunsResponse2`),
   * so the other names stay what users expect.
   */
  typeNames: OperationTypeNames;
  method: HttpMethod;
  path: string;
  parameters: ParameterIR[];
  body?: BodyIR;
  responses: ResponseIR[];
  /**
   * Alternative ways to authenticate. Any one of them is enough, and each lists
   * the schemes it needs together.
   */
  security: SecurityIR[][];
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

export function mediaKind(mediaType: string): BodyKind {
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
      // Nothing can send a cookie parameter: the SDK has no option for it.
      if (!parameter?.name || !parameter.in || parameter.in === "cookie") {
        continue;
      }
      const location = parameter.in as ParameterLocation;
      const content = parameter.schema
        ? undefined
        : pickContent(parameter.content);
      merged.set(`${location}:${parameter.name}`, {
        name: parameter.name,
        in: location,
        required: location === "path" ? true : parameter.required === true,
        schema: parameter.schema ?? content?.media?.schema,
        description: parameter.description,
        deprecated: parameter.deprecated === true,
        style: parameter.style,
        explode: parameter.explode,
        json: content !== undefined && mediaKind(content.mediaType) === "json",
      });
    }
  }
  return [...merged.values()];
}

/**
 * The scheme as a request carries it. The others (`mutualTLS`, HTTP `digest` and
 * so on) happen outside the SDK, and must not be sent as a bearer token.
 */
function toSecurityIR(scheme: Json): SecurityIR | undefined {
  switch (scheme?.type) {
    case "apiKey":
      return { type: "apiKey", in: scheme.in, name: scheme.name };
    case "oauth2":
    case "openIdConnect":
      return { type: "http", scheme: "bearer" };
    case "http": {
      const name = String(scheme.scheme).toLowerCase();
      return name === "basic" || name === "bearer"
        ? { type: "http", scheme: name }
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Schemes that would look the same at runtime, which need their name for an
 * `auth` callback to tell them apart.
 */
function findAmbiguousSchemes(doc: Doc): Set<string> {
  const namesByShape = new Map<string, string[]>();
  for (const [name, raw] of Object.entries(
    (doc.components?.securitySchemes ?? {}) as Record<string, Json>,
  )) {
    const shape = JSON.stringify(toSecurityIR(deref(doc, raw)));
    namesByShape.set(shape, [...(namesByShape.get(shape) ?? []), name]);
  }
  return new Set(
    [...namesByShape.values()].filter((names) => names.length > 1).flat(),
  );
}

function collectSecurity(
  doc: Doc,
  requirements: Json,
  ambiguous: ReadonlySet<string>,
): SecurityIR[][] {
  const schemes = doc.components?.securitySchemes ?? {};
  const result: SecurityIR[][] = [];
  const seen = new Set<string>();
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const group: SecurityIR[] = [];
    for (const name of Object.keys(requirement ?? {})) {
      const entry = toSecurityIR(deref(doc, schemes[name]));
      if (entry)
        group.push(ambiguous.has(name) ? { ...entry, key: name } : entry);
    }
    const id = JSON.stringify(group);
    if (group.length > 0 && !seen.has(id)) {
      seen.add(id);
      result.push(group);
    }
  }
  return result;
}

/** Claim a distinct name for each of the operation's types. */
function claimTypeNames(stem: string, used: Set<string>): OperationTypeNames {
  return {
    data: uniqueName(`${stem}Data`, used),
    errors: uniqueName(`${stem}Errors`, used),
    error: uniqueName(`${stem}Error`, used),
    responses: uniqueName(`${stem}Responses`, used),
    response: uniqueName(`${stem}Response`, used),
  };
}

/** Walk `paths` and normalise every operation. */
export function collectOperations(
  doc: Doc,
  options: {
    useOperationId?: boolean;
    reservedTypeNames?: Iterable<string>;
  } = {},
): OperationIR[] {
  const useOperationId = options.useOperationId ?? true;
  const operations: OperationIR[] = [];
  // Functions and types share one set: `index.ts` re-exports both, and
  // digit-leading names (`_1Abc`) look the same in either case.
  const usedNames = new Set<string>([
    ...RESERVED_TYPE_NAMES,
    ...(options.reservedTypeNames ?? []),
  ]);
  const paths: Record<string, Json> = doc.paths ?? {};
  const ambiguousSchemes = findAmbiguousSchemes(doc);

  for (const [pathKey, rawPathItem] of Object.entries(paths)) {
    const pathItem = deref(doc, rawPathItem) ?? {};
    for (const method of Object.keys(pathItem)) {
      if (!isHttpMethod(method)) continue;
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;

      const baseName =
        useOperationId && operation.operationId
          ? String(operation.operationId)
          : nameFromPath(method, pathKey);
      const functionName = uniqueName(toFunctionName(baseName), usedNames);
      const typeNames = claimTypeNames(toTypeName(functionName), usedNames);

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
          mediaTypes: Object.keys(response.content ?? {}),
        });
      }

      const deprecated = operation.deprecated === true;
      operations.push({
        functionName,
        typeNames,
        method,
        path: pathKey,
        parameters,
        body,
        responses,
        security: collectSecurity(
          doc,
          operation.security ?? doc.security,
          ambiguousSchemes,
        ),
        jsDoc: buildJsDoc(operation.summary, operation.description, deprecated),
      });
    }
  }
  return operations;
}

/** Names of the request-side variants (`PetWritable`) of schemas that need one. */
export function buildWritableNames(
  doc: Doc,
  names: Map<string, string>,
): Map<string, string> {
  const used = new Set<string>([...RESERVED_TYPE_NAMES, ...names.values()]);
  const writable = new Map<string, string>();
  for (const key of findReadWriteOnlyKeys(doc)) {
    writable.set(
      key,
      uniqueName(`${names.get(key) ?? toTypeName(key)}Writable`, used),
    );
  }
  return writable;
}

/** Map every component schema key to its generated type name. */
export function buildSchemaNames(doc: Doc): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>(RESERVED_TYPE_NAMES);
  for (const key of Object.keys(doc.components?.schemas ?? {})) {
    names.set(key, uniqueName(toTypeName(key), used));
  }
  return names;
}

/** Split responses into the ones exposed as data and as errors. */
export function classifyResponses(operation: OperationIR): {
  responses: ResponseIR[];
  errors: ResponseIR[];
} {
  const responses: ResponseIR[] = [];
  const errors: ResponseIR[] = [];
  for (const response of operation.responses) {
    if (response.status === "default") continue;
    // 2xx carries the data the caller asked for and 4xx/5xx the error. Other
    // statuses (a 304 on a conditional request, say) are neither, and listing
    // them would only widen `data` and the error type.
    if (/^2/.test(response.status)) responses.push(response);
    else if (/^[45]/.test(response.status)) errors.push(response);
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

/** Resolve a schema (following `$ref` chains) down to its leading primitive. */
export function schemaPrimitiveKind(
  doc: Doc,
  node: Json,
): "string" | "number" | "other" {
  const schema = resolveRef(doc, node);
  if (!schema || typeof schema !== "object") return "other";
  const alternatives: Json[] | undefined =
    schema.anyOf ?? schema.oneOf ?? schema.allOf;
  if (Array.isArray(alternatives)) {
    const kinds = new Set(
      alternatives
        .filter((member) => resolveRef(doc, member)?.type !== "null")
        .map((member) => schemaPrimitiveKind(doc, member)),
    );
    const [only] = kinds;
    return kinds.size === 1 ? only : "other";
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
