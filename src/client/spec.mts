import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { uniqueName } from "./naming.mjs";

// biome-ignore lint/suspicious/noExplicitAny: an OpenAPI document is untyped JSON
export type Json = any;
export type Doc = Record<string, Json>;

const URL_RE = /^https?:\/\//i;

/**
 * A specification that could not be loaded: because it, or a document it
 * refers to, could not be read (`not-found`), or because what was read is not
 * a JSON or YAML object (`parse`).
 */
export class SpecError extends Error {
  readonly reason: "not-found" | "parse";

  constructor(
    reason: "not-found" | "parse",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SpecError";
    this.reason = reason;
  }
}

/** JSON when it is, which is much faster to parse than YAML. */
function parseJsonOrYaml(text: string): unknown {
  if (text.startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch {
      // A document in YAML's flow style starts the same way.
    }
  }
  return parseYaml(text, { maxAliasCount: -1 });
}

function parseText(text: string, source: string): Doc {
  const trimmed = text.trim();
  let parsed: unknown;
  try {
    parsed = parseJsonOrYaml(trimmed);
  } catch (error) {
    throw new SpecError(
      "parse",
      `Failed to parse the OpenAPI specification (${source}): ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SpecError(
      "parse",
      `The OpenAPI specification (${source}) must be a JSON/YAML object.`,
    );
  }
  return parsed as Doc;
}

/**
 * Read a document. `location` in the result is where it really came from, which
 * after a redirect is not the URL asked for and is what its relative `$ref`s
 * resolve against.
 */
async function readLocation(
  location: string,
): Promise<{ text: string; location: string }> {
  const unreadable = (verb: string, cause: unknown) =>
    new SpecError(
      "not-found",
      `Failed to ${verb} ${location}: ${(cause as Error).message}`,
      { cause },
    );
  if (URL_RE.test(location)) {
    const response = await fetch(location).catch((cause: unknown) => {
      throw unreadable("fetch", cause);
    });
    if (!response.ok) {
      throw new SpecError(
        "not-found",
        `Failed to fetch ${location}: ${response.status} ${response.statusText}`,
      );
    }
    return { text: await response.text(), location: response.url || location };
  }
  const text = await readFile(location, "utf-8").catch((cause: unknown) => {
    throw unreadable("read", cause);
  });
  return { text, location };
}

async function loadDocument(
  location: string,
): Promise<{ doc: Doc; location: string }> {
  const read = await readLocation(location);
  return { doc: parseText(read.text, location), location: read.location };
}

export type LoadedSpec = {
  doc: Doc;
  /** Path or URL the document came from; undefined for inline content. */
  location: string | undefined;
};

/** Load a specification from a file path, a URL or inline JSON/YAML content. */
export async function loadSpec(input: string): Promise<LoadedSpec> {
  if (URL_RE.test(input)) return loadDocument(input);
  if (input.startsWith("file:")) {
    return loadDocument(path.resolve(fileURLToPath(input)));
  }
  const looksInline = input.includes("\n") || input.trimStart().startsWith("{");
  if (!looksInline && existsSync(input)) {
    return loadDocument(path.resolve(input));
  }
  if (!looksInline) {
    throw new SpecError(
      "not-found",
      `OpenAPI specification not found: ${input}`,
    );
  }
  return { doc: parseText(input, "inline content"), location: undefined };
}

/** A media type without its parameters, in lower case. */
export function baseMediaType(mediaType: string): string {
  return mediaType.toLowerCase().split(";")[0].trim();
}

/** Where the component schemas are, as the start of a `$ref`. */
export const COMPONENT_SCHEMA_PREFIX = "#/components/schemas/";

/** One segment of a JSON pointer in a `$ref`, as the key it stands for. */
export function decodePointerSegment(segment: string): string {
  return decodeURIComponent(segment)
    .replaceAll("~1", "/")
    .replaceAll("~0", "~");
}

/** Resolve a JSON pointer such as `#/components/schemas/Pet`. */
export function getByPointer(root: Json, pointer: string): Json {
  const clean = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (clean === "" || clean === "/") return root;
  let current = root;
  for (const rawSegment of clean.replace(/^\//, "").split("/")) {
    const segment = decodePointerSegment(rawSegment);
    if (current === null || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

const REF_SIBLING_KEYWORDS = [
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "enum",
  "items",
  "oneOf",
  "prefixItems",
  "properties",
  "required",
];

/**
 * The part of a schema that sits next to its `$ref` and changes the type, as a
 * schema of its own. OpenAPI 3.1 applies such keywords together with the
 * reference, while 3.0 says they are ignored.
 */
export function refSiblingSchema(doc: Doc, node: Json): Json | undefined {
  if (typeof doc.openapi !== "string" || doc.openapi.startsWith("3.0")) {
    return undefined;
  }
  if (!REF_SIBLING_KEYWORDS.some((key) => node[key] !== undefined)) {
    return undefined;
  }
  const { $ref: _ref, ...siblings } = node;
  return siblings;
}

/** Follow a chain of `$ref`s. The result is undefined if one dangles. */
export function resolveRef(doc: Doc, node: Json, depth = 0): Json {
  return typeof node?.$ref === "string" && depth < 32
    ? resolveRef(doc, getByPointer(doc, node.$ref), depth + 1)
    : node;
}

/** Keywords holding data, where a `$ref` key is not a reference. */
const DATA_KEYWORDS = new Set([
  "const",
  "default",
  "enum",
  "example",
  "examples",
]);

/**
 * Keywords whose keys are names the author chose, so that a property called
 * `example` or a `default` response is not mistaken for a data keyword.
 */
const NAME_MAP_KEYWORDS = new Set([
  "$defs",
  "callbacks",
  "definitions",
  "dependentSchemas",
  "encoding",
  "headers",
  "links",
  "parameters",
  "pathItems",
  "paths",
  "patternProperties",
  "properties",
  "requestBodies",
  "responses",
  "schemas",
  "securitySchemes",
  "webhooks",
]);

/** The name maps among them whose values are schemas. */
const SCHEMA_MAP_KEYWORDS = new Set([
  "$defs",
  "definitions",
  "dependentSchemas",
  "patternProperties",
  "properties",
  "schemas",
]);

/**
 * What a node is, which decides how a `$ref` in it is bundled and whether its
 * keys are keywords: a schema, a map of names to schemas, a map of names to
 * anything else, or any other object.
 */
type Position = "schema" | "schemaMap" | "nameMap" | "other";

function childPosition(position: Position, key: string): Position {
  if (position === "schemaMap") return "schema";
  if (position === "nameMap") return "other";
  if (SCHEMA_MAP_KEYWORDS.has(key)) return "schemaMap";
  if (position === "schema") return "schema";
  if (key === "schema") return "schema";
  return NAME_MAP_KEYWORDS.has(key) ? "nameMap" : "other";
}

function resolveLocation(base: string | undefined, target: string): string {
  if (URL_RE.test(target)) return target;
  if (target.startsWith("file:")) return fileURLToPath(target);
  if (!base) {
    throw new Error(
      `Cannot resolve the external $ref "${target}" because the specification was passed as inline content.`,
    );
  }
  if (URL_RE.test(base)) return new URL(target, base).toString();
  return path.resolve(path.dirname(base), decodeReference(target));
}

/** A `$ref` is a URI reference, so a file name in it can be percent-encoded. */
function decodeReference(reference: string): string {
  try {
    return decodeURIComponent(reference);
  } catch {
    return reference;
  }
}

/** The file a `$ref` points into and the pointer inside it. */
function locateRef(ref: string, nodeLocation: string | undefined) {
  const hashIndex = ref.indexOf("#");
  const filePart = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const pointer = hashIndex === -1 ? "" : ref.slice(hashIndex);
  const location = filePart
    ? resolveLocation(nodeLocation, filePart)
    : (nodeLocation as string);
  return { location, pointer, key: `${location}${pointer}` };
}

/** What an external schema is called: its key, or else the name of its file. */
function externalSchemaName(location: string, pointer: string): string {
  const last = pointer.slice(pointer.lastIndexOf("/") + 1);
  if (pointer.includes("/") && last) {
    return decodeReference(last).replaceAll("~1", "/").replaceAll("~0", "~");
  }
  const file = path.basename(location.replace(/[?#].*$/, ""));
  return file.replace(/\.[^.]+$/, "") || "Schema";
}

function componentSchemaRef(name: string): string {
  const segment = name.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${COMPONENT_SCHEMA_PREFIX}${encodeURIComponent(segment)}`;
}

/**
 * Bundle every external `$ref` (relative files and URLs) into the root
 * document. Internal `$ref`s of the root document stay untouched.
 *
 * An external schema becomes a named entry of `components.schemas` and the
 * reference an internal one, so that it is one type however often it is used,
 * a recursive one included. Everything else (parameters, responses, path
 * items) is inlined.
 */
export async function bundleExternalRefs(loaded: LoadedSpec): Promise<Doc> {
  const { doc, location: rootLocation } = loaded;
  const cache = new Map<string, Promise<{ doc: Doc; location: string }>>();
  if (rootLocation) {
    cache.set(rootLocation, Promise.resolve({ doc, location: rootLocation }));
  }
  /** The name in `components.schemas` of each external schema. */
  const hoisted = new Map<string, string>();
  const hoistedSchemas = new Map<string, Json>();
  /** Discriminator mappings, whose targets are rewritten once all are named. */
  const mappings: { mapping: Json; location: string | undefined }[] = [];

  const rootSchemas: Record<string, Json> = doc.components?.schemas ?? {};
  const usedNames = new Set<string>(Object.keys(rootSchemas));
  // A root schema that is nothing but an external reference names its target,
  // rather than being an alias of a second type with a made-up name.
  for (const [name, schema] of Object.entries(rootSchemas)) {
    const ref = schema?.$ref;
    if (typeof ref !== "string" || ref.startsWith("#")) continue;
    if (Object.keys(schema).length > 1) continue;
    const target = locateRef(ref, rootLocation);
    if (target.location !== rootLocation && !hoisted.has(target.key)) {
      hoisted.set(target.key, name);
    }
  }

  function loadFile(location: string): Promise<{ doc: Doc; location: string }> {
    let file = cache.get(location);
    if (!file) {
      file = loadDocument(location);
      cache.set(location, file);
    }
    return file;
  }

  async function loadTarget(
    target: { location: string; pointer: string },
    ref: string,
  ): Promise<{ node: Json; location: string }> {
    const file = await loadFile(target.location);
    const node = getByPointer(file.doc, target.pointer);
    if (node === undefined) {
      throw new Error(`Unresolvable $ref: ${ref}`);
    }
    return { node, location: file.location };
  }

  /** Make the target a named schema of the root, once, and refer to it. */
  async function hoist(
    target: { location: string; pointer: string; key: string },
    ref: string,
    stack: ReadonlySet<string>,
  ): Promise<string> {
    let name = hoisted.get(target.key);
    if (name === undefined) {
      name = uniqueName(
        externalSchemaName(target.location, target.pointer),
        usedNames,
      );
      hoisted.set(target.key, name);
    }
    if (!hoistedSchemas.has(name)) {
      // Taken before the target is read, so that the schemas come out in the
      // order they are first used and a recursive one refers to itself.
      hoistedSchemas.set(name, {});
      const { node, location } = await loadTarget(target, ref);
      hoistedSchemas.set(
        name,
        await walk(node, location, new Set(stack).add(target.key), "schema"),
      );
    }
    return componentSchemaRef(name);
  }

  // One node after the other, so that the names given to hoisted schemas do
  // not depend on which file happens to be read first.
  async function walk(
    node: Json,
    nodeLocation: string | undefined,
    stack: ReadonlySet<string>,
    position: Position,
  ): Promise<Json> {
    if (Array.isArray(node)) {
      const itemPosition = childPosition(position, "");
      const items: Json[] = [];
      for (const item of node) {
        items.push(await walk(item, nodeLocation, stack, itemPosition));
      }
      return items;
    }
    if (node === null || typeof node !== "object") return node;

    const ref = node.$ref;
    const isExternalFile = nodeLocation !== rootLocation;
    if (typeof ref === "string" && (!ref.startsWith("#") || isExternalFile)) {
      const target = locateRef(ref, nodeLocation);
      const isBackReference =
        target.location === rootLocation && target.pointer !== "";

      // A file pointing back into the root keeps the root's named type, and an
      // external schema gets one. What sits next to the reference stays there,
      // as it does next to an internal one.
      if (isBackReference || position === "schema" || stack.has(target.key)) {
        const { $ref: _ref, ...rest } = node;
        const siblings =
          Object.keys(rest).length > 0
            ? await walk(rest, nodeLocation, stack, position)
            : undefined;
        return {
          ...siblings,
          $ref: isBackReference
            ? target.pointer
            : await hoist(target, ref, stack),
        };
      }

      const loadedTarget = await loadTarget(target, ref);
      return walk(
        loadedTarget.node,
        loadedTarget.location,
        new Set(stack).add(target.key),
        position,
      );
    }

    const isNameMap = position === "schemaMap" || position === "nameMap";
    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(node)) {
      const isData =
        !isNameMap && (DATA_KEYWORDS.has(key) || key.startsWith("x-"));
      result[key] = isData
        ? value
        : await walk(value, nodeLocation, stack, childPosition(position, key));
    }
    const mapping = result.discriminator?.mapping;
    if (!isNameMap && mapping !== null && typeof mapping === "object") {
      mappings.push({ mapping, location: nodeLocation });
    }
    return result;
  }

  const bundled = (await walk(doc, rootLocation, new Set(), "other")) as Doc;

  // A mapping names its targets the way a `$ref` does, or by schema name.
  for (const { mapping, location } of mappings) {
    for (const [value, target] of Object.entries(mapping)) {
      if (typeof target !== "string") continue;
      if (target.startsWith("#") && location === rootLocation) continue;
      let name: string | undefined;
      try {
        const located = locateRef(target, location);
        if (located.location === rootLocation && located.pointer !== "") {
          mapping[value] = located.pointer;
          continue;
        }
        name =
          hoisted.get(located.key) ??
          hoisted.get(`${location}${componentSchemaRef(target)}`) ??
          hoisted.get(`${location}${COMPONENT_SCHEMA_PREFIX}${target}`);
      } catch {
        // Not a reference that can be resolved, so a schema name.
      }
      if (name !== undefined && hoistedSchemas.has(name)) {
        mapping[value] = componentSchemaRef(name);
      }
    }
  }

  if (hoistedSchemas.size > 0) {
    bundled.components ??= {};
    bundled.components.schemas = {
      ...bundled.components.schemas,
      ...Object.fromEntries(hoistedSchemas),
    };
  }
  return bundled;
}
