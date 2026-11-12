import { HEADER } from "./emitSdk.mjs";
import { propertyKey, uniqueName } from "./naming.mjs";
import { componentSchemaKey, hasFlag, type SchemaCtx } from "./schema.mjs";
import type { Json } from "./spec.mjs";

/** `form` leaves out what only documents a schema, for use in form libraries. */
export type SchemasMode = "json" | "form";

const DOCUMENTATION_KEYWORDS = [
  "description",
  "title",
  "x-enum-descriptions",
  "x-enum-varnames",
  "x-enumNames",
];

/** The keywords that hold one schema, a list of them, or a map of them. */
const SCHEMA_KEYWORDS = ["additionalProperties", "items", "not"];
const SCHEMA_LIST_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];
const SCHEMA_MAP_KEYWORDS = ["patternProperties", "properties"];

type Variant = {
  /** The side whose properties are left out: `writeOnly` when reading. */
  hidden: "readOnly" | "writeOnly";
  /** Component key → key its references are rewritten to. */
  renamed: ReadonlyMap<string, string>;
  mode: SchemasMode;
};

/**
 * Copy a schema for one side of the API: without the properties the other side
 * owns, and with its references pointing at that side's schemas.
 */
function project(schema: Json, ctx: SchemaCtx, variant: Variant): Json {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }
  const entries: Array<[string, Json]> = [];
  const removed = new Set<string>();
  for (const [keyword, value] of Object.entries(
    schema as Record<string, Json>,
  )) {
    if (variant.mode === "form" && DOCUMENTATION_KEYWORDS.includes(keyword)) {
      continue;
    }
    if (keyword === "$ref" && typeof value === "string") {
      const key = componentSchemaKey(value);
      const renamed = key === undefined ? undefined : variant.renamed.get(key);
      entries.push([
        keyword,
        renamed === undefined ? value : `#/components/schemas/${renamed}`,
      ]);
    } else if (SCHEMA_KEYWORDS.includes(keyword)) {
      entries.push([keyword, project(value, ctx, variant)]);
    } else if (SCHEMA_LIST_KEYWORDS.includes(keyword) && Array.isArray(value)) {
      entries.push([
        keyword,
        value.map((member) => project(member, ctx, variant)),
      ]);
    } else if (
      SCHEMA_MAP_KEYWORDS.includes(keyword) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const members: Array<[string, Json]> = [];
      for (const [name, member] of Object.entries(
        value as Record<string, Json>,
      )) {
        if (
          keyword === "properties" &&
          hasFlag(ctx.doc, member, variant.hidden)
        ) {
          removed.add(name);
        } else {
          members.push([name, project(member, ctx, variant)]);
        }
      }
      entries.push([keyword, Object.fromEntries(members)]);
    } else {
      entries.push([keyword, value]);
    }
  }
  return Object.fromEntries(
    entries.flatMap(([keyword, value]): Array<[string, Json]> => {
      if (keyword !== "required" || removed.size === 0) {
        return [[keyword, value]];
      }
      if (!Array.isArray(value)) return [[keyword, value]];
      const required = value.filter((name: string) => !removed.has(name));
      return required.length > 0 ? [[keyword, required]] : [];
    }),
  );
}

function literal(value: Json, indent = ""): string {
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${inner}${literal(item, inner)},`);
    return `[\n${items.join("\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, Json>).filter(
    ([, item]) => item !== undefined,
  );
  if (entries.length === 0) return "{}";
  const lines = entries.map(
    ([name, item]) => `${inner}${propertyKey(name)}: ${literal(item, inner)},`,
  );
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** `my-schema` → `my_schema`, as v3 named the constants. */
function constantName(schemaKey: string): string {
  const name = schemaKey.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^\d/.test(name) ? `_${name}` : name;
}

/**
 * Generate `schemas.gen.ts`: every component schema as a constant, the way the
 * specification writes it. A schema with `readOnly` or `writeOnly` properties
 * comes in two: what the API returns, and `…WritableSchema` for what it takes.
 */
export function emitSchemas(
  ctx: SchemaCtx,
  mode: SchemasMode,
): string | undefined {
  const schemas = (ctx.doc.components?.schemas ?? {}) as Record<string, Json>;
  const keys = Object.keys(schemas);
  if (keys.length === 0) return undefined;

  const used = new Set<string>();
  const blocks: string[] = [];
  const add = (name: string, schema: Json, variant: Variant) => {
    blocks.push(
      `export const ${uniqueName(name, used)} = ${literal(project(schema, ctx, variant))} as const;`,
    );
  };
  for (const schemaKey of keys) {
    add(`${constantName(schemaKey)}Schema`, schemas[schemaKey], {
      hidden: "writeOnly",
      renamed: new Map(),
      mode,
    });
  }
  const writable = keys.filter((schemaKey) =>
    ctx.writableNames?.has(schemaKey),
  );
  const renamed = new Map(
    writable.map((schemaKey) => [schemaKey, `${schemaKey}Writable`]),
  );
  for (const schemaKey of writable) {
    add(`${constantName(schemaKey)}WritableSchema`, schemas[schemaKey], {
      hidden: "readOnly",
      renamed,
      mode,
    });
  }
  return `${HEADER}\n${blocks.join("\n\n")}\n`;
}
