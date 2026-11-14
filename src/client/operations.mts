import type { PageParamTypeKind } from "../types.mjs";
import {
  nameFromPath,
  toFunctionName,
  toTypeName,
  uniqueName,
} from "./naming.mjs";
import { docComment, findReadWriteOnlyKeys, schemaKinds } from "./schema.mjs";
import { baseMediaType, type Doc, getByPointer, type Json } from "./spec.mjs";

/**
 * Type names a schema or an operation type cannot take: `ClientOptions` and
 * `Options` are exported next to them, and the rest are what the generated hook
 * files import or use, where an imported model of the same name would clash
 * with or shadow them. The last four are the type parameters of the hooks,
 * which would shadow the model instead.
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
  "TContext",
  "TData",
  "TError",
  "TQueryKey",
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
  /** The media type `schema` and `example` are taken from. */
  mediaType?: string;
  /** The body the media type gives as its `example`, or as the first of its `examples`. */
  example?: Json;
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
  const type = baseMediaType(mediaType);
  if (type === "application/json" || type.endsWith("+json")) return "json";
  if (type === "multipart/form-data") return "form-data";
  if (type === "application/x-www-form-urlencoded") return "urlencoded";
  if (type.startsWith("text/")) return "text";
  return "binary";
}

/** The media type a body is typed from: JSON when offered, else the first. */
export function pickContent(
  content: Record<string, Json> | undefined,
): { mediaType: string; media: Json } | undefined {
  if (!content) return undefined;
  const entries = Object.entries(content);
  if (entries.length === 0) return undefined;
  const json = entries.find(([type]) => mediaKind(type) === "json");
  const [mediaType, media] = json ?? entries[0];
  return { mediaType, media };
}

/** The example of a media type: its `example`, or the first of its `examples`. */
function mediaExample(doc: Doc, media: Json): Json {
  if (!media || typeof media !== "object") return undefined;
  if (media.example !== undefined) return media.example;
  const examples =
    media.examples && typeof media.examples === "object"
      ? Object.values(media.examples as Record<string, Json>)
      : [];
  for (const raw of examples) {
    let example: Json;
    try {
      example = deref(doc, raw);
    } catch {
      // An example that is not there is no example.
      continue;
    }
    if (example?.value !== undefined) return example.value;
  }
  return undefined;
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
          mediaType: content?.mediaType,
          example: mediaExample(doc, content?.media),
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

/**
 * Type names for `components.requestBodies`. They are claimed after every
 * other name, so a schema or an operation never gives its name up to one.
 */
export function buildRequestBodyNames(
  doc: Doc,
  taken: Iterable<string>,
): Map<string, string> {
  const used = new Set<string>([...RESERVED_TYPE_NAMES, ...taken]);
  const names = new Map<string, string>();
  for (const key of Object.keys(doc.components?.requestBodies ?? {})) {
    names.set(key, uniqueName(toTypeName(key), used));
  }
  return names;
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
  // `default` stands for whatever is not listed: the data when no 2xx is, and
  // an error otherwise.
  if (fallback) (responses.length === 0 ? responses : errors).push(fallback);
  return { responses, errors };
}

/** The one primitive a schema holds, leaving `null` aside. */
export function schemaPrimitiveKind(doc: Doc, node: Json): PageParamTypeKind {
  const kinds = schemaKinds(doc, node);
  kinds.delete("null");
  const [only] = kinds;
  return kinds.size === 1 && (only === "string" || only === "number")
    ? only
    : "other";
}
