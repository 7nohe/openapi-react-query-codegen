import type { GeneratedFile } from "../types.mjs";
import { HEADER } from "./emitSdk.mjs";
import { type EnumsMode, isEnumDeclaration } from "./emitTypes.mjs";
import { exampleValue, type MockValueCtx, mockValue } from "./mockValue.mjs";
import { uniqueName } from "./naming.mjs";
import {
  classifyResponses,
  mediaKind,
  type OperationIR,
  type ResponseIR,
} from "./operations.mjs";
import {
  componentSchemaView,
  hasObjectKeywords,
  isNullableSchema,
  isRequiredOnly,
  renderSchema,
  type SchemaCtx,
} from "./schema.mjs";
import { type Doc, type Json, resolveRef } from "./spec.mjs";

/**
 * The major version of MSW the handlers are written for. Version 3 moved
 * `http` and `HttpResponse` from `msw` to `msw/http`; nothing else differs in
 * what is generated.
 */
export type MswMajor = 2 | 3;

export interface MocksOptions {
  mswMajor: MswMajor;
  enums?: EnumsMode;
  /** `.js` for Node16/NodeNext module resolution, otherwise empty. */
  ext: "" | ".js";
}

export interface EmittedMocks {
  files: GeneratedFile[];
  /** What could not be mocked as the specification describes it. */
  warnings: string[];
}

/** Statuses whose response cannot have a body. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** The methods `http` of MSW has a handler for. */
const MSW_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
]);

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Whether the schema is one object type, which `Partial` of it can override
 * property by property. A union is not: a part of one member spread over
 * another member is a value of neither.
 */
function isPlainObject(doc: Doc, schema: Json, depth = 0): boolean {
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object" || depth > 16) return false;
  if (
    resolved.oneOf !== undefined ||
    resolved.anyOf !== undefined ||
    resolved.enum !== undefined ||
    resolved.const !== undefined ||
    isNullableSchema(resolved)
  ) {
    return false;
  }
  const members: Json[] = Array.isArray(resolved.allOf)
    ? resolved.allOf.filter((member: Json) => !isRequiredOnly(member))
    : [];
  if (resolved.type !== undefined && resolved.type !== "object") return false;
  if (
    resolved.type === undefined &&
    !hasObjectKeywords(resolved) &&
    members.length === 0
  ) {
    return false;
  }
  return members.every((member) => isPlainObject(doc, member, depth + 1));
}

const PATH_PARAMETER = /\{([^{}]+)\}/g;

/**
 * What a handler matches the path with, as an expression. `*` stands for the
 * base URL, so the handlers match wherever the API is.
 *
 * MSW reads `:` and a few other characters in a path as its own syntax, so a
 * path that has one outside its parameters (`/pets:count`) is matched with a
 * regular expression instead, which gives the resolver no named parameters.
 */
function mswPath(path: string): string {
  const fixed = path.replace(PATH_PARAMETER, "");
  if (/^[\w/.~-]*$/.test(fixed)) {
    return JSON.stringify(
      `*${path.replace(PATH_PARAMETER, (_match, name: string) => {
        // A parameter name is made of word characters and starts with none
        // of the digits.
        const safe = name.replace(/\W/g, "_");
        return `:${/^\d/.test(safe) ? "_" : ""}${safe}`;
      })}`,
    );
  }
  const source = path
    .split(PATH_PARAMETER)
    // Every other part is the name of a parameter.
    .map((part, index) =>
      index % 2 === 1 ? "([^/]+)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  // As in a path given as text, a trailing slash is only required when the
  // path has one.
  return `new RegExp(${JSON.stringify(`${source}${path.endsWith("/") ? "" : "/?"}$`)})`;
}

/**
 * Where a path sorts among the handlers. MSW answers with the first handler
 * that matches, so a segment has to come before a looser one in its place:
 * `/pets/mine` and `/pets/{id}:archive` before `/pets/{id}`.
 */
function specificity(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      /^\{[^{}]+\}$/.test(segment) ? "2" : segment.includes("{") ? "1" : "0",
    )
    .join("");
}

/** The response a handler answers with: the lowest of the successful ones. */
function pickResponse(operation: OperationIR): ResponseIR | undefined {
  // A range (`2XX`) comes after the statuses it stands for. `default` is only
  // ever here alone.
  const rank = (status: string) =>
    /^\d+$/.test(status) ? Number(status) : 999;
  return [...classifyResponses(operation).responses].sort(
    (a, b) => rank(a.status) - rank(b.status),
  )[0];
}

/** The body of a mock that no value can be written for. */
function noValue(type: string): string {
  return `{} as unknown as ${type}`;
}

function declareFunction(
  name: string,
  parameters: string,
  type: string,
  body: string,
): string {
  return `export function ${name}(${parameters}): ${type} {\n  return ${body};\n}`;
}

const DATA_INTRO = `/**
 * Mock data for the schemas and the responses of the API. The values are fixed:
 * an \`example\` or a \`default\` from the specification where it has one, and
 * otherwise the first \`enum\` value or a value made up from the type.
 */`;

const HANDLERS_INTRO = `/**
 * MSW request handlers for the API. Each answers with the mock of its
 * operation's successful response. Pass a handler another body, or a resolver
 * of your own, to answer with something else:
 *
 *   setupWorker(findPetsHandler([]), ...handlers)
 *
 * MSW uses the first handler that matches, so yours go before \`handlers\`.
 */`;

/** Emit the files of `<output>/mocks`: the mock data and the MSW handlers. */
export function emitMocks(
  operations: OperationIR[],
  ctx: SchemaCtx,
  options: MocksOptions,
): EmittedMocks {
  const { doc } = ctx;
  const readCtx: SchemaCtx = { ...ctx, mode: "read", onRef: undefined };
  const schemas = (doc.components?.schemas ?? {}) as Record<string, Json>;
  const warnings: string[] = [];
  const used = new Set<string>();

  const typeOf = (key: string) => `Types.${ctx.names.get(key) as string}`;
  const mockNames = new Map<string, string>();
  for (const key of Object.keys(schemas)) {
    mockNames.set(
      key,
      uniqueName(`${lowerFirst(ctx.names.get(key) as string)}Mock`, used),
    );
  }

  // The mocks call each other, so a schema that holds itself would never
  // return. Schemas are built depth first, and a reference back to one that is
  // still being built is cut: left out, an empty array or `null`, whichever the
  // schema allows there. A mock only ever calls mocks finished before it.
  const bodies = new Map<string, string>();
  const building = new Set<string>();
  const unbuildable: string[] = [];
  let attempts = 0;
  const valueCtx: MockValueCtx = {
    schema: readCtx,
    callMock: (key) =>
      buildComponent(key) === undefined
        ? undefined
        : `${mockNames.get(key) as string}()`,
    enumCast: (key) =>
      options.enums === "typescript" &&
      isEnumDeclaration(schemas[key], options.enums)
        ? typeOf(key)
        : undefined,
  };

  function buildComponent(key: string): string | undefined {
    const done = bodies.get(key);
    if (done !== undefined) return done;
    if (building.has(key)) return undefined;
    building.add(key);
    attempts += 1;
    const view = componentSchemaView(schemas[key], key, readCtx);
    let body = mockValue(view, valueCtx, "  ");
    building.delete(key);
    if (body === undefined) {
      // Under another schema the cut can fall where this one cannot take it,
      // so it is tried again from the top. The limit keeps a specification
      // that is full of such schemas from being built over and over.
      const retry = attempts <= Object.keys(schemas).length * 20;
      if (building.size > 0 && retry) return undefined;
      unbuildable.push(key);
      body = noValue(typeOf(key));
    } else {
      const cast = valueCtx.enumCast(key);
      if (cast !== undefined) body = `${body} as ${cast}`;
    }
    bodies.set(key, body);
    return body;
  }

  const dataBlocks: string[] = [];
  for (const key of Object.keys(schemas)) {
    const body = buildComponent(key) as string;
    const name = mockNames.get(key) as string;
    const type = typeOf(key);
    const view = componentSchemaView(schemas[key], key, readCtx);
    if (!unbuildable.includes(key) && isPlainObject(doc, view)) {
      const base =
        body === "{}"
          ? ""
          : body.startsWith("{\n")
            ? body.slice(2, body.lastIndexOf("\n"))
            : `    ...${body},`;
      const literal = `{\n${base === "" ? "" : `${base}\n`}    ...overrides,\n  }`;
      dataBlocks.push(
        declareFunction(name, `overrides?: Partial<${type}>`, type, literal),
      );
    } else {
      dataBlocks.push(declareFunction(name, "", type, body));
    }
  }
  if (unbuildable.length > 0) {
    warnings.push(
      `--mock: these schemas require themselves, so no value of them ends. Their mocks return an empty object:\n${unbuildable
        .map((key) => `  - ${key}`)
        .join("\n")}`,
    );
  }

  const sorted = operations
    .map((operation, index) => ({ operation, index }))
    .sort((a, b) => {
      const [left, right] = [a, b].map((entry) =>
        specificity(entry.operation.path),
      );
      return left < right ? -1 : left > right ? 1 : a.index - b.index;
    })
    .map((entry) => entry.operation);

  const helpers = new Set<"answer" | "json" | "text" | "empty">();
  const handlerBlocks: string[] = [];
  const handlerNames: string[] = [];
  const skipped: string[] = [];
  let usesTypes = false;

  for (const operation of sorted) {
    if (!MSW_METHODS.has(operation.method)) {
      skipped.push(`${operation.method.toUpperCase()} ${operation.path}`);
      continue;
    }
    const response = pickResponse(operation);
    const status =
      response && /^\d+$/.test(response.status) ? Number(response.status) : 200;
    const kind = response?.mediaType
      ? mediaKind(response.mediaType)
      : undefined;
    const hasBody =
      response?.schema !== undefined &&
      operation.method !== "head" &&
      !NULL_BODY_STATUSES.has(status) &&
      (kind === "json" || kind === "text") &&
      // A body typed `unknown` has nothing for a mock to follow.
      renderSchema(response.schema, readCtx) !== "unknown";

    const name = `${operation.functionName}Handler`;
    handlerNames.push(name);
    const path = mswPath(operation.path);
    const call = `http.${operation.method}`;

    if (!response || !hasBody) {
      helpers.add("empty");
      handlerBlocks.push(
        `export const ${name} = (override?: HttpResponseResolver) =>\n  ${call}(${path}, override ?? empty(${status}));`,
      );
      continue;
    }

    const statusIndex = /^\d+$/.test(response.status)
      ? response.status
      : JSON.stringify(response.status);
    const type = `Types.${operation.typeNames.responses}[${statusIndex}]`;
    const mockName = uniqueName(`${operation.functionName}ResponseMock`, used);
    const value =
      (response.example === undefined
        ? undefined
        : exampleValue(response.schema, response.example, valueCtx, "  ")) ??
      mockValue(response.schema, valueCtx, "  ");
    dataBlocks.push(
      declareFunction(mockName, "", type, value ?? noValue(type)),
    );

    usesTypes = true;
    helpers.add("answer");
    helpers.add(kind === "text" ? "text" : "json");
    handlerBlocks.push(
      `export const ${name} = (override?: ${type} | HttpResponseResolver) =>\n  ${call}(\n    ${path},\n    answer(override, mocks.${mockName}, ${kind === "text" ? "text" : "json"}(${status})),\n  );`,
    );
  }
  if (skipped.length > 0) {
    warnings.push(
      `--mock: MSW has no handler for these methods, so the operations are left out:\n${skipped
        .map((where) => `  - ${where}`)
        .join("\n")}`,
    );
  }

  const { ext } = options;
  const typesImport = `import type * as Types from "../requests/types.gen${ext}";`;
  const data = [
    HEADER.trimEnd(),
    DATA_INTRO,
    // With nothing to mock the file still has to be a module.
    ...(dataBlocks.length > 0 ? [typesImport, ...dataBlocks] : ["export {};"]),
  ].join("\n\n");

  const mswModule = options.mswMajor === 2 ? "msw" : "msw/http";
  const hasHandlers = handlerBlocks.length > 0;
  const mswImport = hasHandlers
    ? `import {\n  type HttpHandler,\n  HttpResponse,\n  type HttpResponseResolver,\n  http,\n} from "${mswModule}";`
    : `import type { HttpHandler } from "${mswModule}";`;
  const imports = [
    mswImport,
    ...(usesTypes
      ? [typesImport, `import * as mocks from "./data${ext}";`]
      : []),
  ].join("\n");
  const helperBlocks: string[] = [];
  if (helpers.has("answer")) {
    helperBlocks.push(
      `/** Answers with \`override\` when it is a body, and lets it answer when it is a resolver. */
const answer = <T>(
  override: T | HttpResponseResolver | undefined,
  mock: () => T,
  respond: (body: T) => Response,
): HttpResponseResolver =>
  typeof override === "function"
    ? (override as HttpResponseResolver)
    : () => respond(override === undefined ? mock() : (override as T));`,
    );
  }
  if (helpers.has("json")) {
    helperBlocks.push(
      `const json = (status: number) => (body: unknown) =>
  HttpResponse.json(body as Parameters<typeof HttpResponse.json>[0], {
    status,
  });`,
    );
  }
  if (helpers.has("text")) {
    helperBlocks.push(
      `const text = (status: number) => (body: unknown) =>
  HttpResponse.text(String(body), { status });`,
    );
  }
  if (helpers.has("empty")) {
    helperBlocks.push(
      `const empty =
  (status: number): HttpResponseResolver =>
  () =>
    new HttpResponse(null, { status });`,
    );
  }
  const list = hasHandlers
    ? `export const handlers: HttpHandler[] = [\n${handlerNames
        .map((name) => `  ${name}(),`)
        .join("\n")}\n];`
    : "export const handlers: HttpHandler[] = [];";
  const handlers = [
    HEADER.trimEnd(),
    HANDLERS_INTRO,
    imports,
    ...helperBlocks,
    ...handlerBlocks,
    list,
  ].join("\n\n");

  return {
    files: [
      { name: "data.ts", content: `${data}\n` },
      { name: "handlers.ts", content: `${handlers}\n` },
      {
        name: "index.ts",
        content: `${HEADER}\nexport * from "./data${ext}";\nexport * from "./handlers${ext}";\n`,
      },
    ],
    warnings,
  };
}
