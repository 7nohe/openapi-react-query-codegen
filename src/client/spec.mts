import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { toTypeName, uniqueName } from "./naming.mjs";

// biome-ignore lint/suspicious/noExplicitAny: an OpenAPI document is untyped JSON
export type Json = any;
export type Doc = Record<string, Json>;

const URL_RE = /^https?:\/\//i;

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
    throw new Error(
      `Failed to parse the OpenAPI specification (${source}): ${(error as Error).message}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
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
  if (URL_RE.test(location)) {
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${location}: ${response.status} ${response.statusText}`,
      );
    }
    return { text: await response.text(), location: response.url || location };
  }
  return { text: await readFile(location, "utf-8"), location };
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
    throw new Error(`OpenAPI specification not found: ${input}`);
  }
  return { doc: parseText(input, "inline content"), location: undefined };
}

/** Resolve a JSON pointer such as `#/components/schemas/Pet`. */
export function getByPointer(root: Json, pointer: string): Json {
  const clean = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (clean === "" || clean === "/") return root;
  let current = root;
  for (const rawSegment of clean.replace(/^\//, "").split("/")) {
    const segment = decodeURIComponent(rawSegment)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
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

/**
 * The discriminator value of an inlined `oneOf`/`anyOf` member, as a schema to
 * intersect it with: once inlined, nothing else tells what it was called.
 */
function narrowInlinedMembers(node: Json, walked: Json): Json {
  const property = node.discriminator?.propertyName;
  if (typeof property !== "string") return walked;
  for (const key of ["oneOf", "anyOf"]) {
    if (!Array.isArray(node[key])) continue;
    walked[key] = node[key].map((member: Json, index: number) => {
      const inlined = walked[key][index];
      const ref = member?.$ref;
      const declared = inlined?.properties?.[property];
      if (
        typeof ref !== "string" ||
        inlined?.$ref !== undefined ||
        (inlined?.type !== undefined && inlined.type !== "object") ||
        declared?.const !== undefined ||
        Array.isArray(declared?.enum)
      ) {
        return inlined;
      }
      const mapped = Object.entries(node.discriminator.mapping ?? {})
        .filter(([, target]) => target === ref)
        .map(([value]) => value);
      const name = ref
        .split(/[#/]/)
        .pop()
        ?.replace(/\.[^.]+$/, "");
      return {
        allOf: [
          inlined,
          {
            type: "object",
            required: [property],
            properties: {
              [property]: { enum: mapped.length > 0 ? mapped : [name] },
            },
          },
        ],
      };
    });
  }
  return walked;
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

/**
 * Inline every external `$ref` (relative files and URLs). Internal `$ref`s of
 * the root document stay untouched. A reference that would recurse forever is
 * hoisted into `components.schemas` and turned into an internal `$ref`.
 */
export async function bundleExternalRefs(loaded: LoadedSpec): Promise<Doc> {
  const { doc, location: rootLocation } = loaded;
  // Promises, so that concurrent references to one file read it once.
  const cache = new Map<string, Promise<{ doc: Doc; location: string }>>();
  if (rootLocation) {
    cache.set(rootLocation, Promise.resolve({ doc, location: rootLocation }));
  }
  const hoisted = new Map<string, string>();
  const hoistedSchemas: Record<string, Json> = {};

  const usedNames = new Set<string>(Object.keys(doc.components?.schemas ?? {}));

  function loadFile(location: string): Promise<{ doc: Doc; location: string }> {
    let file = cache.get(location);
    if (!file) {
      file = loadDocument(location);
      cache.set(location, file);
    }
    return file;
  }

  async function walk(
    node: Json,
    nodeLocation: string | undefined,
    stack: ReadonlySet<string>,
    inNameMap = false,
  ): Promise<Json> {
    if (Array.isArray(node)) {
      return Promise.all(node.map((item) => walk(item, nodeLocation, stack)));
    }
    if (node === null || typeof node !== "object") return node;

    const ref = node.$ref;
    const isExternalFile = nodeLocation !== rootLocation;
    if (typeof ref === "string" && (!ref.startsWith("#") || isExternalFile)) {
      const hashIndex = ref.indexOf("#");
      const filePart = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
      const pointer = hashIndex === -1 ? "" : ref.slice(hashIndex);
      const targetLocation = filePart
        ? resolveLocation(nodeLocation, filePart)
        : (nodeLocation as string);
      const key = `${targetLocation}${pointer}`;
      const siblings = refSiblingSchema(doc, node);
      const walkedSiblings =
        siblings && (await walk(siblings, nodeLocation, stack));

      // A file pointing back into the root keeps the root's named type.
      if (targetLocation === rootLocation && pointer) {
        return { ...walkedSiblings, $ref: pointer };
      }

      if (stack.has(key)) {
        let name = hoisted.get(key);
        if (!name) {
          const base = path.basename(targetLocation).replace(/\.[^.]+$/, "");
          const last = pointer.split("/").pop() ?? "";
          name = uniqueName(toTypeName(last || base), usedNames);
          hoisted.set(key, name);
          const file = await loadFile(targetLocation);
          const target = getByPointer(file.doc, pointer);
          hoistedSchemas[name] = await walk(
            target,
            file.location,
            new Set(stack).add(key),
          );
        }
        return { ...walkedSiblings, $ref: `#/components/schemas/${name}` };
      }

      const file = await loadFile(targetLocation);
      const target = getByPointer(file.doc, pointer);
      if (target === undefined) {
        throw new Error(`Unresolvable $ref: ${ref}`);
      }
      const inlined = await walk(
        target,
        file.location,
        new Set(stack).add(key),
      );
      return walkedSiblings ? { allOf: [inlined, walkedSiblings] } : inlined;
    }

    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(node)) {
      const isData =
        !inNameMap && (DATA_KEYWORDS.has(key) || key.startsWith("x-"));
      result[key] = isData
        ? value
        : await walk(
            value,
            nodeLocation,
            stack,
            !inNameMap && NAME_MAP_KEYWORDS.has(key),
          );
    }
    return narrowInlinedMembers(node, result);
  }

  const bundled = (await walk(doc, rootLocation, new Set())) as Doc;
  if (hoisted.size > 0) {
    bundled.components ??= {};
    bundled.components.schemas = {
      ...bundled.components.schemas,
      ...hoistedSchemas,
    };
  }
  return bundled;
}
