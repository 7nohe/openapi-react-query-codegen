import { propertyKey, toTypeName } from "./naming.mjs";
import {
  type Doc,
  getByPointer,
  type Json,
  refSiblingSchema,
  resolveRef,
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
  /** Type `date` and `date-time` strings as `Date` (`--useDateType`). */
  dates?: boolean;
}

/** Name of the type generated for `#/components/schemas/<key>`, if any. */
export function componentSchemaKey(ref: string): string | undefined {
  if (!ref.startsWith(COMPONENT_SCHEMA_PREFIX)) return undefined;
  const rest = ref.slice(COMPONENT_SCHEMA_PREFIX.length);
  if (rest.includes("/")) return undefined;
  return decodeURIComponent(rest).replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Whether a discriminator mapping target, a `$ref` or a name, is the schema. */
function isMappingTarget(target: string, key: string): boolean {
  if (target === key || target === `${COMPONENT_SCHEMA_PREFIX}${key}`) {
    return true;
  }
  try {
    return componentSchemaKey(target) === key;
  } catch {
    return false;
  }
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

/**
 * True when `type` contains a `|` that is not nested in brackets or quotes, or
 * in a doc comment, whose text is free to have unbalanced ones.
 */
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
    if (char === "/" && type[i + 1] === "*") {
      const end = type.indexOf("*/", i + 2);
      if (end === -1) return false;
      i = end + 1;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
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

/**
 * A global type the output refers to. Schemas named `Blob` and `File` are common
 * enough to keep their names, so the global is qualified when one exists.
 */
function globalTypeRef(name: string, ctx: SchemaCtx): string {
  return [...ctx.names.values()].includes(name) ? `globalThis.${name}` : name;
}

/** Marks a `$ref` member of an `allOf` whose discriminator literal is replaced. */
const OMITTED_PROPERTY = "x-orqc-omit";

/** The discriminator of what an `allOf` builds on, if any. */
function findInheritedDiscriminator(
  doc: Doc,
  schema: Json,
  visited = new Set<Json>(),
): Json {
  const members: Json[] = Array.isArray(schema?.allOf) ? schema.allOf : [];
  for (const member of members) {
    const resolved = resolveRef(doc, member);
    if (!resolved || typeof resolved !== "object" || visited.has(resolved)) {
      continue;
    }
    visited.add(resolved);
    if (typeof resolved.discriminator?.propertyName === "string") {
      return resolved.discriminator;
    }
    const found = findInheritedDiscriminator(doc, resolved, visited);
    if (found) return found;
  }
  return undefined;
}

/** True when a schema or what it is composed of requires `name`. */
function requiresProperty(
  doc: Doc,
  schema: Json,
  name: string,
  visited = new Set<Json>(),
): boolean {
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object" || visited.has(resolved)) {
    return false;
  }
  visited.add(resolved);
  if (Array.isArray(resolved.required) && resolved.required.includes(name)) {
    return true;
  }
  const members: Json[] = Array.isArray(resolved.allOf) ? resolved.allOf : [];
  return members.some((member) => requiresProperty(doc, member, name, visited));
}

/**
 * Render a component schema. A subtype that builds on a schema with a
 * discriminator gets its own value of the discriminator property, from the
 * mapping or else its name, so that a union of subtypes narrows on it.
 */
export function renderComponentSchema(
  schema: Json,
  key: string,
  ctx: SchemaCtx,
): string {
  const discriminator = schema?.discriminator
    ? undefined
    : findInheritedDiscriminator(ctx.doc, schema);
  if (!discriminator) return renderSchema(schema, ctx);

  const property: string = discriminator.propertyName;
  const pinned = pinnedValues(schema, property, ctx);
  const mapped = Object.entries(
    (discriminator.mapping ?? {}) as Record<string, string>,
  )
    .filter(([, target]) => isMappingTarget(target, key))
    .map(([value]) => value);
  const named = mapped.length > 0 ? mapped : [key];
  const allowed = pinned
    ? named.filter((value) => pinned.includes(value))
    : named;
  if (allowed.length === 0 || pinned?.length === 1)
    return renderSchema(schema, ctx);

  const members = schema.allOf.map((member: Json) =>
    // A parent that is a subtype itself has a value of its own to replace.
    typeof member?.$ref === "string" &&
    findInheritedDiscriminator(ctx.doc, resolveRef(ctx.doc, member))
      ? { ...member, [OMITTED_PROPERTY]: property }
      : member,
  );
  const tag = {
    type: "object",
    required: requiresProperty(ctx.doc, schema, property) ? [property] : [],
    properties: { [property]: { enum: allowed } },
  };
  return renderSchema({ ...schema, allOf: [...members, tag] }, ctx);
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
    if (typeof schema[OMITTED_PROPERTY] === "string") {
      const parent = renderRef(schema.$ref, ctx, indent, seen);
      return `Omit<${parent}, ${JSON.stringify(schema[OMITTED_PROPERTY])}>`;
    }
    const siblings = refSiblingSchema(ctx.doc, schema);
    return siblings
      ? renderSchema(
          { allOf: [{ $ref: schema.$ref }, siblings] },
          ctx,
          indent,
          seen,
        )
      : renderRef(schema.$ref, ctx, indent, seen);
  }

  if (schema.const !== undefined) {
    return addNull(literal(schema.const), schema);
  }

  if (Array.isArray(schema.enum)) {
    // OpenAPI 3.0 only allows null in an enum that lists it, whatever
    // `nullable` says, so `nullable` is deliberately not applied here.
    return union((schema.enum as unknown[]).map(literal));
  }

  // A value has to match every keyword, so `oneOf` and `anyOf` narrow what
  // `allOf` and the schema's own properties describe.
  const unions = (["oneOf", "anyOf"] as const)
    .map((key) => schema[key])
    .filter((options) => Array.isArray(options) && options.length > 0)
    .map((options: Json[]) =>
      union(
        options.map((member) =>
          withDiscriminator(
            member,
            renderSchema(member, ctx, indent, seen),
            schema.discriminator,
            ctx,
          ),
        ),
      ),
    );

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const members = schema.allOf
      .filter((member: Json) => !isRequiredOnly(member))
      .map((member: Json) => renderSchema(member, ctx, indent, seen));
    members.push(...unions);
    if (
      schema.properties ||
      schema.patternProperties ||
      schema.additionalProperties
    ) {
      members.push(renderObject(schema, ctx, indent, seen));
    }
    const required = renderInheritedRequired(schema, ctx, indent, seen);
    if (required !== "{}") members.push(required);
    return addNull(intersection(members), schema);
  }

  if (unions.length > 0) {
    const members =
      schema.properties || schema.additionalProperties
        ? [...unions, renderObject(schema, ctx, indent, seen)]
        : unions;
    return addNull(intersection(members), schema);
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
        schema.format === "binary" || hasBinaryContent(schema)
          ? fileType(ctx)
          : ctx.dates && isDateString(schema)
            ? globalTypeRef("Date", ctx)
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
      if (
        schema.properties ||
        schema.patternProperties ||
        schema.additionalProperties !== undefined
      ) {
        type = renderObject(schema, ctx, indent, seen);
      } else if (schema.items || schema.prefixItems) {
        type = renderArray(schema, ctx, indent, seen);
      } else if (hasBinaryContent(schema)) {
        type = fileType(ctx);
      } else {
        type = "unknown";
      }
  }
  return addNull(type, schema);
}

/** Whether a string schema holds a date, which `--useDateType` makes a `Date`. */
export function isDateString(schema: Json): boolean {
  return (
    (schema.format === "date" || schema.format === "date-time") &&
    !hasBinaryContent(schema)
  );
}

function fileType(ctx: SchemaCtx): string {
  return `${globalTypeRef("Blob", ctx)} | ${globalTypeRef("File", ctx)}`;
}

/** Media types whose content is text, which a string can hold as it is. */
const TEXT_MEDIA_TYPE =
  /^(text|multipart)\/|(json|xml|yaml|javascript|ecmascript|html|graphql|x-www-form-urlencoded)$/;

/**
 * Whether the schema is a file the way OpenAPI 3.1 writes one: a media type
 * that is not text, and no `contentEncoding` making a string of it.
 */
function hasBinaryContent(schema: Json): boolean {
  const mediaType = schema.contentMediaType;
  return (
    typeof mediaType === "string" &&
    schema.contentEncoding === undefined &&
    !TEXT_MEDIA_TYPE.test(mediaType.toLowerCase().split(";")[0].trim())
  );
}

/** Keywords that give a schema a type of its own. */
const TYPE_KEYWORDS = [
  "$ref",
  "additionalProperties",
  "anyOf",
  "const",
  "enum",
  "items",
  "oneOf",
  "prefixItems",
  "properties",
];

/** An `allOf` member that declares nothing and only makes properties required. */
function isRequiredOnly(member: Json): boolean {
  if (
    !member ||
    typeof member !== "object" ||
    (member.type !== undefined && member.type !== "object") ||
    TYPE_KEYWORDS.some((key) => member[key] !== undefined)
  ) {
    return false;
  }
  return Array.isArray(member.allOf)
    ? member.allOf.every(isRequiredOnly)
    : Array.isArray(member.required);
}

/** The declaration of `name` in a schema or in what it is composed of. */
function findDeclaredProperty(
  doc: Doc,
  schema: Json,
  name: string,
  visited = new Set<Json>(),
): Json {
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object" || visited.has(resolved)) {
    return undefined;
  }
  visited.add(resolved);
  if (Object.hasOwn(resolved.properties ?? {}, name)) {
    return resolved.properties[name];
  }
  for (const member of Array.isArray(resolved.allOf) ? resolved.allOf : []) {
    const found = findDeclaredProperty(doc, member, name, visited);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * What a schema requires without declaring it, in itself or in what it is
 * composed of. Only the `allOf` around it can know the type of such a property.
 */
function undeclaredRequired(
  doc: Doc,
  schema: Json,
  visited = new Set<Json>(),
): string[] {
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object" || visited.has(resolved)) {
    return [];
  }
  visited.add(resolved);
  const own: string[] = Array.isArray(resolved.required)
    ? resolved.required
    : [];
  const members: Json[] = Array.isArray(resolved.allOf) ? resolved.allOf : [];
  return [
    ...own.filter(
      (name) => findDeclaredProperty(doc, resolved, name) === undefined,
    ),
    ...members.flatMap((member) => undeclaredRequired(doc, member, visited)),
  ];
}

/**
 * The properties an `allOf` requires while another of its members declares them.
 * They are repeated with their own type, because an optional property
 * intersected with `unknown` would stay `undefined`-able. The result is `{}`
 * when there are none.
 */
function renderInheritedRequired(
  schema: Json,
  ctx: SchemaCtx,
  indent: string,
  seen: Seen,
): string {
  const own: string[] = Array.isArray(schema.required) ? schema.required : [];
  const names = new Set<string>([
    ...own.filter((name) => !Object.hasOwn(schema.properties ?? {}, name)),
    ...schema.allOf.flatMap((member: Json) => {
      const required = undeclaredRequired(ctx.doc, member);
      // A named schema drops what it requires and nobody declares, so an
      // `allOf` around it does too.
      return member?.$ref
        ? required.filter(
            (name) => findDeclaredProperty(ctx.doc, schema, name) !== undefined,
          )
        : required;
    }),
  ]);
  const properties = Object.fromEntries(
    [...names].map((name) => [
      name,
      findDeclaredProperty(ctx.doc, schema, name) ?? {},
    ]),
  );
  return names.size === 0
    ? "{}"
    : renderObject({ properties, required: [...names] }, ctx, indent, seen);
}

function renderRef(
  ref: string,
  ctx: SchemaCtx,
  indent: string,
  seen: Seen,
): string {
  const key = componentSchemaKey(ref);
  if (key !== undefined) {
    // A reference to a schema that is not there has no type to name.
    const schemas = ctx.doc.components?.schemas ?? {};
    if (!Object.hasOwn(schemas, key) && !ctx.names.has(key)) return "unknown";
    const writable = ctx.writableNames?.get(key);
    if (ctx.mode === "write" && writable !== undefined) return writable;
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

/** The literal values the schema pins `property` to (enum or const), if any. */
function pinnedValues(
  schema: Json,
  property: string,
  ctx: SchemaCtx,
  depth = 0,
): unknown[] | undefined {
  const resolved = resolveRef(ctx.doc, schema);
  if (!resolved || typeof resolved !== "object" || depth > 16) return undefined;
  const declared = resolved.properties?.[property];
  if (declared !== undefined) {
    const target = resolveRef(ctx.doc, declared);
    if (target?.const !== undefined) return [target.const];
    return Array.isArray(target?.enum) ? target.enum : undefined;
  }
  for (const member of Array.isArray(resolved.allOf) ? resolved.allOf : []) {
    const pinned = pinnedValues(member, property, ctx, depth + 1);
    if (pinned) return pinned;
  }
  return undefined;
}

/**
 * What tells a `oneOf`/`anyOf` member apart: the values its discriminator
 * property may take (`allowed`), and the literals the member pins the property
 * to itself, if it does.
 */
function discriminatorChoice(
  member: Json,
  discriminator: Json,
  ctx: SchemaCtx,
): { allowed: string[]; pinned?: unknown[] } | undefined {
  const property = discriminator?.propertyName;
  if (typeof property !== "string" || typeof member?.$ref !== "string") {
    return undefined;
  }
  const key = componentSchemaKey(member.$ref);
  if (key === undefined) return undefined;
  // Only object members can carry the property (an array or a primitive
  // intersected with `{ kind: … }` would be unusable).
  const target = ctx.doc.components?.schemas?.[key];
  if (typeof target?.type === "string" && target.type !== "object") {
    return undefined;
  }

  const values = Object.entries(
    (discriminator.mapping ?? {}) as Record<string, string>,
  )
    .filter(
      ([, target]) =>
        isMappingTarget(target, key) || target.endsWith(`/${key}`),
    )
    .map(([value]) => value);
  // A member that pins the property keeps it, unless it inherits an enum of all
  // the subtypes, which the discriminator then narrows down.
  const pinned = pinnedValues(member, property, ctx);
  const named = values.length > 0 ? values : [key];
  const allowed = pinned
    ? named.filter((value) => pinned.includes(value))
    : named;
  return { allowed, pinned };
}

/**
 * Intersect a `oneOf`/`anyOf` member with its discriminator value so the
 * union narrows on the discriminator property. Members that already pin the
 * property to other literals are left alone: adding a second literal (from an
 * implicit mapping by schema name) could only make them unreachable.
 */
function withDiscriminator(
  member: Json,
  rendered: string,
  discriminator: Json,
  ctx: SchemaCtx,
): string {
  const choice = discriminatorChoice(member, discriminator, ctx);
  if (!choice || choice.allowed.length === 0 || choice.pinned?.length === 1) {
    return rendered;
  }
  const literals = choice.allowed.map((value) => JSON.stringify(value));
  return `({ ${propertyKey(discriminator.propertyName)}: ${literals.join(" | ")} } & ${rendered})`;
}

/**
 * The values of the discriminator property that a value of `member` has, or
 * undefined when nothing tells the member apart.
 */
export function discriminatorValues(
  member: Json,
  discriminator: Json,
  ctx: SchemaCtx,
): unknown[] | undefined {
  const choice = discriminatorChoice(member, discriminator, ctx);
  if (!choice) return undefined;
  if (choice.pinned?.length === 1) return choice.pinned;
  return choice.allowed.length > 0 ? choice.allowed : undefined;
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

/** A flag on a property, next to its `$ref` or on what the `$ref` points to. */
export function hasFlag(
  doc: Doc,
  property: Json,
  flag: "readOnly" | "writeOnly",
): boolean {
  return (
    property?.[flag] === true || resolveRef(doc, property)?.[flag] === true
  );
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
    if (hasFlag(ctx.doc, value, writing ? "readOnly" : "writeOnly")) continue;
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
  const patterns = Object.values(
    (schema.patternProperties ?? {}) as Record<string, Json>,
  );
  const hasAdditional =
    additional === true || (additional && typeof additional === "object");
  if (hasAdditional || patterns.length > 0) {
    const additionalType =
      !hasAdditional ||
      additional === true ||
      Object.keys(additional).length === 0
        ? undefined
        : renderSchema(additional, ctx, inner, seen);
    // What no pattern matches is free unless `additionalProperties` says not.
    const openEnded =
      additional !== false && additionalType === undefined ? ["unknown"] : [];
    let valueType = union([
      ...patterns.map((pattern) => renderSchema(pattern, ctx, inner, seen)),
      ...(additionalType ? [additionalType] : []),
      ...openEnded,
    ]);
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

  // A closed object without properties only accepts `{}`, which the `{}` type
  // does not express: that one accepts anything but null and undefined.
  if (
    Object.keys(properties).length === 0 &&
    additional === false &&
    patterns.length === 0
  ) {
    return "{ [key: string]: never }";
  }
  if (lines.length === 0) return "{}";
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function scanReadWriteOnly(
  doc: Doc,
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
    if (hasFlag(doc, value, "readOnly") || hasFlag(doc, value, "writeOnly")) {
      found.direct = true;
    }
    scanReadWriteOnly(doc, value, found, depth + 1);
  }
  for (const value of Object.values(
    (schema.patternProperties ?? {}) as Record<string, Json>,
  )) {
    scanReadWriteOnly(doc, value, found, depth + 1);
  }
  for (const key of ["allOf", "oneOf", "anyOf", "prefixItems"] as const) {
    if (Array.isArray(schema[key])) {
      for (const member of schema[key]) {
        scanReadWriteOnly(doc, member, found, depth + 1);
      }
    }
  }
  scanReadWriteOnly(doc, schema.items, found, depth + 1);
  scanReadWriteOnly(doc, schema.additionalProperties, found, depth + 1);
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
    scanReadWriteOnly(doc, schema, found);
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
