import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { toTypeName, uniqueName } from "./naming.mjs";

// biome-ignore lint/suspicious/noExplicitAny: an OpenAPI document is untyped JSON
export type Json = any;
export type Doc = Record<string, Json>;

const URL_RE = /^https?:\/\//i;

function parseText(text: string, source: string): Doc {
  const trimmed = text.trim();
  let parsed: unknown;
  try {
    parsed = trimmed.startsWith("{")
      ? JSON.parse(trimmed)
      : parseYaml(trimmed, { maxAliasCount: -1 });
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
 * reference, while 3.0 says they are ignored. A name that `required` lists
 * without declaring it becomes a property of unknown type.
 */
export function refSiblingSchema(doc: Doc, node: Json): Json | undefined {
  if (typeof doc.openapi !== "string" || doc.openapi.startsWith("3.0")) {
    return undefined;
  }
  if (!REF_SIBLING_KEYWORDS.some((key) => node[key] !== undefined)) {
    return undefined;
  }
  const { $ref: _ref, ...siblings } = node;
  if (!Array.isArray(siblings.required)) return siblings;
  const properties = { ...siblings.properties };
  for (const name of siblings.required) properties[name] ??= {};
  return { ...siblings, properties };
}

function resolveLocation(base: string | undefined, target: string): string {
  if (URL_RE.test(target)) return target;
  if (!base) {
    throw new Error(
      `Cannot resolve the external $ref "${target}" because the specification was passed as inline content.`,
    );
  }
  if (URL_RE.test(base)) return new URL(target, base).toString();
  return path.resolve(path.dirname(base), target);
}

/**
 * Inline every external `$ref` (relative files and URLs). Internal `$ref`s of
 * the root document stay untouched. A reference that would recurse forever is
 * hoisted into `components.schemas` and turned into an internal `$ref`.
 */
export async function bundleExternalRefs(loaded: LoadedSpec): Promise<Doc> {
  const { doc, location: rootLocation } = loaded;
  const cache = new Map<string, { doc: Doc; location: string }>();
  const hoisted = new Map<string, string>();
  const hoistedSchemas: Record<string, Json> = {};

  const usedNames = new Set<string>(Object.keys(doc.components?.schemas ?? {}));

  async function loadFile(
    location: string,
  ): Promise<{ doc: Doc; location: string }> {
    const cached = cache.get(location);
    if (cached) return cached;
    const loadedFile = await loadDocument(location);
    cache.set(location, loadedFile);
    return loadedFile;
  }

  async function walk(
    node: Json,
    nodeLocation: string | undefined,
    stack: ReadonlySet<string>,
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

      const file =
        targetLocation === rootLocation
          ? { doc, location: targetLocation }
          : await loadFile(targetLocation);
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
      result[key] = await walk(value, nodeLocation, stack);
    }
    return result;
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
