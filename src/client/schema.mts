import { propertyKey, toTypeName } from "./naming.mjs";
import { type Doc, getByPointer, type Json } from "./spec.mjs";

const COMPONENT_SCHEMA_PREFIX = "#/components/schemas/";

export interface SchemaCtx {
  doc: Doc;
  /** Component schema key → generated TypeScript type name. */
  names: Map<string, string>;
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
    const key = componentSchemaKey(schema.$ref);
    if (key !== undefined) {
      return ctx.names.get(key) ?? toTypeName(key);
    }
    if (seen.has(schema.$ref)) return "unknown";
    const target = getByPointer(ctx.doc, schema.$ref);
    return renderSchema(target, ctx, indent, new Set(seen).add(schema.$ref));
  }

  if (schema.const !== undefined) {
    return addNull(literal(schema.const), schema);
  }

  if (Array.isArray(schema.enum)) {
    const values: unknown[] = [...schema.enum];
    if (schema.nullable === true && !values.includes(null)) values.push(null);
    return union(values.map(literal));
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
        options.map((member: Json) => renderSchema(member, ctx, indent, seen)),
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
      type = schema.format === "binary" ? "Blob | File" : "string";
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

  for (const [name, value] of Object.entries(properties)) {
    const resolved =
      value && typeof value === "object" && typeof value.$ref === "string"
        ? undefined
        : value;
    const comment = docComment(
      {
        description: resolved?.description ?? value?.description,
        deprecated: resolved?.deprecated ?? value?.deprecated,
      },
      inner,
    );
    const type = renderSchema(value, ctx, inner, seen);
    const optional = !required.has(name);
    if (optional) hasOptional = true;
    propertyTypes.push(type);
    lines.push(
      `${comment}${inner}${propertyKey(name)}${optional ? "?" : ""}: ${type};`,
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
  } else if (!hasProperties && additional !== false) {
    lines.push(`${inner}[key: string]: unknown;`);
  }

  if (lines.length === 0) return "{}";
  return `{\n${lines.join("\n")}\n${indent}}`;
}
