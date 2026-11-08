import { propertyKey, toTypeName } from "./naming.mjs";
import {
  type Doc,
  getByPointer,
  type Json,
  refSiblingSchema,
} from "./spec.mjs";

const COMPONENT_SCHEMA_PREFIX = "#/components/schemas/";

export interface SchemaCtx {
  doc: Doc;
  /** Component schema key → generated TypeScript type name. */
  names: Map<string, string>;
  /**
   * `read` (default) describes what the API returns: `readOnly` properties
   * are marked `readonly` and `writeOnly` ones are left out. `write` describes
   * what a request sends: `readOnly` properties are left out.
   */
  mode?: "read" | "write";
  /** Component schema key → name of its request-side (`write`) variant. */
  writableNames?: Map<string, string>;
  /** Collects the keys whose request-side variant was referenced. */
  usedWritable?: Set<string>;
}

/** Name of the type generated for `#/components/schemas/<key>`, if any. */
export function componentSchemaKey(ref: string): string | undefined {
  if (!ref.startsWith(COMPONENT_SCHEMA_PREFIX)) return undefined;
  const rest = ref.slice(COMPONENT_SCHEMA_PREFIX.length);
  if (rest.includes("/")) return undefined;
  return decodeURIComponent(rest).replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Render a JSDoc block, or an empty string when there is nothing to say. */
export function docComment(
  parts: { description?: string; deprecated?: boolean },
  indent = "",
): string {
  const lines: string[] = [];
  if (parts.description) {
    lines.push(...parts.description.replace(/\*\//g, "*\\/").split("\n"));
  }
  if (parts.deprecated) {
    if (lines.length > 0) lines.push("");
    lines.push("@deprecated");
  }
  if (lines.length === 0) return "";
  const body = lines
    .map((line) => (line.trim() === "" ? `${indent} *` : `${indent} * ${line}`))
    .join("\n");
  return `${indent}/**\n${body}\n${indent} */\n`;
}

/** `title` and `description` of a schema, as one documentation text. */
export function schemaDescription(schema: Json): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const { title, description } = schema;
  if (typeof title === "string" && title && typeof description === "string") {
    return `${title}\n\n${description}`;
  }
  return (
    (typeof description === "string" ? description : undefined) ??
    (typeof title === "string" && title ? title : undefined)
  );
}

function literal(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "unknown";
}

/** True when `type` contains a `|` that is not nested in brackets or quotes. */
function hasTopLevelUnion(type: string): boolean {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < type.length; i++) {
    const char = type[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("{[(<".includes(char)) depth += 1;
    else if ("}])>".includes(char)) depth -= 1;
    else if (char === "|" && depth === 0) return true;
  }
  return false;
}

function union(types: string[]): string {
  const unique = [...new Set(types)];
  if (unique.length === 0) return "never";
  if (unique.includes("unknown")) return "unknown";
  return unique.join(" | ");
}

function intersection(types: string[]): string {
  const unique = [...new Set(types)].filter((type) => type !== "unknown");
  if (unique.length === 0) return "unknown";
  return unique
    .map((type) =>
      unique.length > 1 && hasTopLevelUnion(type) ? `(${type})` : type,
    )
    .join(" & ");
}

function isNullableSchema(schema: Json): boolean {
  return (
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes("null"))
  );
}

function addNull(type: string, schema: Json): string {
  if (!isNullableSchema(schema) || type === "null") return type;
  return `${type} | null`;
}

type Seen = ReadonlySet<string>;

const generatedNames = new WeakMap<Map<string, string>, Set<string>>();

/**
 * A global type the output refers to. Schemas named `Blob` and `File` are common
 * enough to keep their names, so the global is qualified when one exists.
 */
function globalTypeRef(name: string, ctx: SchemaCtx): string {
  let names = generatedNames.get(ctx.names);
  if (!names) {
    names = new Set(ctx.names.values());
    generatedNames.set(ctx.names, names);
  }
  return names.has(name) ? `globalThis.${name}` : name;
}

/** Render the TypeScript type for an OpenAPI schema object. */
export function renderSchema(
  schema: Json,
  ctx: SchemaCtx,
  indent = "",
  seen: Seen = new Set(),
): string {
  if (schema === true || schema === undefined || schema === null) {
    return "unknown";
  }
  if (schema === false) return "never";
  if (typeof schema !== "object") return "unknown";

  if (typeof schema.$ref === "string") {
    const referenced = renderRef(schema.$ref, ctx, indent, seen);
    const siblings = refSiblingSchema(ctx.doc, schema);
    return siblings
      ? intersection([referenced, renderSchema(siblings, ctx, indent, seen)])
      : referenced;
  }

  if (schema.const !== undefined) {
    return addNull(literal(schema.const), schema);
  }

  if (Array.isArray(schema.enum)) {
    // OpenAPI 3.0 only allows null in an enum that lists it, whatever
    // `nullable` says, so `nullable` is deliberately not applied here.
    return union((schema.enum as unknown[]).map(literal));
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const members = schema.allOf.map((member: Json) =>
      renderSchema(member, ctx, indent, seen),
    );
    if (schema.properties || schema.additionalProperties) {
      members.push(renderObject(schema, ctx, indent, seen));
    }
    return addNull(intersection(members), schema);
  }

  for (const key of ["oneOf", "anyOf"] as const) {
    const options = schema[key];
    if (Array.isArray(options) && options.length > 0) {
      const rendered = union(
        options.map((member: Json) =>
          withDiscriminator(
            member,
            renderSchema(member, ctx, indent, seen),
            schema.discriminator,
            ctx,
          ),
        ),
      );
      const withOwn =
        schema.properties || schema.additionalProperties
          ? intersection([rendered, renderObject(schema, ctx, indent, seen)])
          : rendered;
      return addNull(withOwn, schema);
    }
  }

  if (Array.isArray(schema.type)) {
    const types: string[] = schema.type.filter(
      (type: string) => type !== "null",
    );
    const rendered = types.map((type) =>
      renderSchema({ ...schema, type }, ctx, indent, seen),
    );
    if (schema.type.includes("null")) rendered.push("null");
    return union(rendered);
  }

  let type: string;
  switch (schema.type) {
    case "string":
      type =
        schema.format === "binary"
          ? `${globalTypeRef("Blob", ctx)} | ${globalTypeRef("File", ctx)}`
          : "string";
      break;
    case "number":
    case "integer":
      type = "number";
      break;
    case "boolean":
      type = "boolean";
      break;
    case "null":
      return "null";
    case "array":
      type = renderArray(schema, ctx, indent, seen);
      break;
    case "object":
      type = renderObject(schema, ctx, indent, seen);
      break;
    default:
      if (schema.properties || schema.additionalProperties !== undefined) {
        type = renderObject(schema, ctx, indent, seen);
      } else if (schema.items || schema.prefixItems) {
        type = renderArray(schema, ctx, indent, seen);
      } else {
        type = "unknown";
      }
  }
  return addNull(type, schema);
}

function renderRef(
  ref: string,
  ctx: SchemaCtx,
  indent: string,
  seen: Seen,
): string {
  const key = componentSchemaKey(ref);
  if (key !== undefined) {
    const writable = ctx.writableNames?.get(key);
    if (ctx.mode === "write" && writable !== undefined) {
      ctx.usedWritable?.add(key);
      return writable;
    }
    return ctx.names.get(key) ?? toTypeName(key);
  }
  if (seen.has(ref)) return "unknown";
  return renderSchema(
    getByPointer(ctx.doc, ref),
    ctx,
    indent,
    new Set(seen).add(ref),
  );
}

/** True when the schema pins `property` to literal values (enum or const). */
function pinsProperty(
  schema: Json,
  property: string,
  ctx: SchemaCtx,
  depth = 0,
): boolean {
  if (!schema || typeof schema !== "object" || depth > 16) return false;
  if (typeof schema.$ref === "string") {
    const key = componentSchemaKey(schema.$ref);
    const target =
      key !== undefined
        ? ctx.doc.components?.schemas?.[key]
        : getByPointer(ctx.doc, schema.$ref);
    return pinsProperty(target, property, ctx, depth + 1);
  }
  const declared = schema.properties?.[property];
  if (declared !== undefined) {
    const resolved =
      typeof declared?.$ref === "string"
        ? getByPointer(ctx.doc, declared.$ref)
        : declared;
    return resolved?.const !== undefined || Array.isArray(resolved?.enum);
  }
  return (
    Array.isArray(schema.allOf) &&
    schema.allOf.some((member: Json) =>
      pinsProperty(member, property, ctx, depth + 1),
    )
  );
}

/**
 * Intersect a `oneOf`/`anyOf` member with its discriminator value so the
 * union narrows on the discriminator property. Members that already pin the
 * property to literals are left alone: adding a second literal (from an
 * implicit mapping by schema name) could only make them unreachable.
 */
function withDiscriminator(
  member: Json,
  rendered: string,
  discriminator: Json,
  ctx: SchemaCtx,
): string {
  const property = discriminator?.propertyName;
  if (typeof property !== "string" || typeof member?.$ref !== "string") {
    return rendered;
  }
  const key = componentSchemaKey(member.$ref);
  if (key === undefined || pinsProperty(member, property, ctx)) return rendered;
  // Only object members can carry the property (an array or a primitive
  // intersected with `{ kind: … }` would be unusable).
  const target = ctx.doc.components?.schemas?.[key];
  if (typeof target?.type === "string" && target.type !== "object") {
    return rendered;
  }

  const values = Object.entries(
    (discriminator.mapping ?? {}) as Record<string, string>,
  )
    .filter(
      ([, target]) =>
        target === member.$ref || target === key || target.endsWith(`/${key}`),
    )
    .map(([value]) => value);
  const literals = (values.length > 0 ? values : [key]).map((value) =>
    JSON.stringify(value),
  );
  return `({ ${propertyKey(property)}: ${literals.join(" | ")} } & ${rendered})`;
}

function renderArray(
  schema: Json,
  ctx: SchemaCtx,
  indent: string,
  seen: Seen,
): string {
  if (Array.isArray(schema.prefixItems)) {
    const items = schema.prefixItems.map((item: Json) =>
      renderSchema(item, ctx, indent, seen),
    );
    if (schema.items !== undefined && schema.items !== false) {
      items.push(`...Array<${renderSchema(schema.items, ctx, indent, seen)}>`);
    }
    return `[${items.join(", ")}]`;
  }
  // A fixed-length array (`minItems` equals `maxItems`) is a tuple.
  const length = schema.maxItems;
  if (
    schema.items &&
    typeof length === "number" &&
    length > 0 &&
    length === schema.minItems
  ) {
    const item = renderSchema(schema.items, ctx, indent, seen);
    return `[${Array.from({ length }, () => item).join(", ")}]`;
  }
  return `Array<${renderSchema(schema.items, ctx, indent, seen)}>`;
}

function renderObject(
  schema: Json,
  ctx: SchemaCtx,
  indent: string,
  seen: Seen,
): string {
  const properties: Record<string, Json> = schema.properties ?? {};
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required : [],
  );
  const inner = `${indent}  `;
  const lines: string[] = [];
  const propertyTypes: string[] = [];
  let hasOptional = false;
  const writing = ctx.mode === "write";

  for (const [name, value] of Object.entries(properties)) {
    if (writing ? value?.readOnly === true : value?.writeOnly === true) {
      continue;
    }
    const resolved =
      value && typeof value === "object" && typeof value.$ref === "string"
        ? undefined
        : value;
    const comment = docComment(
      {
        description: schemaDescription(resolved) ?? value?.description,
        deprecated: resolved?.deprecated ?? value?.deprecated,
      },
      inner,
    );
    const type = renderSchema(value, ctx, inner, seen);
    const optional = !required.has(name);
    if (optional) hasOptional = true;
    propertyTypes.push(type);
    const modifier = !writing && value?.readOnly === true ? "readonly " : "";
    lines.push(
      `${comment}${inner}${modifier}${propertyKey(name)}${optional ? "?" : ""}: ${type};`,
    );
  }

  const additional = schema.additionalProperties;
  const hasProperties = lines.length > 0;
  if (additional === true || (additional && typeof additional === "object")) {
    let valueType =
      additional === true || Object.keys(additional).length === 0
        ? "unknown"
        : renderSchema(additional, ctx, inner, seen);
    if (hasProperties && valueType !== "unknown") {
      valueType = union([
        valueType,
        ...propertyTypes,
        ...(hasOptional ? ["undefined"] : []),
      ]);
    }
    lines.push(`${inner}[key: string]: ${valueType};`);
  } else if (Object.keys(properties).length === 0 && additional !== false) {
    lines.push(`${inner}[key: string]: unknown;`);
  }

  if (lines.length === 0) return "{}";
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function scanReadWriteOnly(
  schema: Json,
  found: { direct: boolean; refs: Set<string> },
  depth = 0,
): void {
  if (!schema || typeof schema !== "object" || depth > 64) return;
  if (typeof schema.$ref === "string") {
    const key = componentSchemaKey(schema.$ref);
    if (key !== undefined) found.refs.add(key);
  }
  for (const value of Object.values(
    (schema.properties ?? {}) as Record<string, Json>,
  )) {
    if (value?.readOnly === true || value?.writeOnly === true) {
      found.direct = true;
    }
    scanReadWriteOnly(value, found, depth + 1);
  }
  for (const key of ["allOf", "oneOf", "anyOf", "prefixItems"] as const) {
    if (Array.isArray(schema[key])) {
      for (const member of schema[key]) {
        scanReadWriteOnly(member, found, depth + 1);
      }
    }
  }
  scanReadWriteOnly(schema.items, found, depth + 1);
  scanReadWriteOnly(schema.additionalProperties, found, depth + 1);
}

/**
 * Component schemas that need a separate request-side type: the ones with a
 * `readOnly`/`writeOnly` property, directly or through the schemas they
 * reference.
 */
export function findReadWriteOnlyKeys(doc: Doc): Set<string> {
  const schemas = (doc.components?.schemas ?? {}) as Record<string, Json>;
  const direct = new Set<string>();
  const references = new Map<string, Set<string>>();
  for (const [key, schema] of Object.entries(schemas)) {
    const found = { direct: false, refs: new Set<string>() };
    scanReadWriteOnly(schema, found);
    if (found.direct) direct.add(key);
    references.set(key, found.refs);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, refs] of references) {
      if (direct.has(key)) continue;
      for (const ref of refs) {
        if (direct.has(ref)) {
          direct.add(key);
          changed = true;
          break;
        }
      }
    }
  }
  return direct;
}
