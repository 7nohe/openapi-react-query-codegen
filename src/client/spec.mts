import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

async function readLocation(location: string): Promise<string> {
  if (URL_RE.test(location)) {
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${location}: ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }
  return readFile(location, "utf-8");
}

export type LoadedSpec = {
  doc: Doc;
  /** Path or URL the document came from; undefined for inline content. */
  location: string | undefined;
};

/** Load a specification from a file path, a URL or inline JSON/YAML content. */
export async function loadSpec(input: string): Promise<LoadedSpec> {
  if (URL_RE.test(input)) {
    return {
      doc: parseText(await readLocation(input), input),
      location: input,
    };
  }
  const looksInline = input.includes("\n") || input.trimStart().startsWith("{");
  if (!looksInline && existsSync(input)) {
    const location = path.resolve(input);
    return {
      doc: parseText(await readLocation(location), location),
      location,
    };
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
  const cache = new Map<string, Doc>();
  const hoisted = new Map<string, string>();

  const usedNames = new Set<string>(Object.keys(doc.components?.schemas ?? {}));

  async function loadFile(location: string): Promise<Doc> {
    const cached = cache.get(location);
    if (cached) return cached;
    const parsed = parseText(await readLocation(location), location);
    cache.set(location, parsed);
    return parsed;
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

      if (stack.has(key)) {
        let name = hoisted.get(key);
        if (!name) {
          const base = path.basename(targetLocation).replace(/\.[^.]+$/, "");
          const last = pointer.split("/").pop() ?? "";
          name = uniqueName(toTypeName(last || base), usedNames);
          hoisted.set(key, name);
          const targetDoc = await loadFile(targetLocation);
          const target = getByPointer(targetDoc, pointer);
          doc.components ??= {};
          doc.components.schemas ??= {};
          doc.components.schemas[name] = await walk(
            target,
            targetLocation,
            new Set(stack).add(key),
          );
        }
        return { $ref: `#/components/schemas/${name}` };
      }

      const targetDoc =
        targetLocation === rootLocation && doc
          ? doc
          : await loadFile(targetLocation);
      const target = getByPointer(targetDoc, pointer);
      if (target === undefined) {
        throw new Error(`Unresolvable $ref: ${ref}`);
      }
      return walk(target, targetLocation, new Set(stack).add(key));
    }

    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = await walk(value, nodeLocation, stack);
    }
    return result;
  }

  const bundled = (await walk(doc, rootLocation, new Set())) as Doc;
  // Hoisted schemas were written into the original object while walking.
  if (hoisted.size > 0) {
    bundled.components ??= {};
    bundled.components.schemas = {
      ...bundled.components.schemas,
      ...doc.components?.schemas,
    };
  }
  return bundled;
}

export function fileUrl(location: string): string {
  return URL_RE.test(location) ? location : pathToFileURL(location).toString();
}
