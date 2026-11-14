import { propertyKey } from "./naming.mjs";
import {
  componentSchemaKey,
  componentSchemaView,
  discriminatorValues,
  hasBinaryContent,
  hasFlag,
  hasObjectKeywords,
  impliedType,
  inheritedRequired,
  isDateString,
  isNullableSchema,
  isRequiredOnly,
  OMITTED_PROPERTY,
  renderSchema,
  type SchemaCtx,
  schemaKinds,
} from "./schema.mjs";
import {
  getByPointer,
  type Json,
  refSiblingSchema,
  resolveRef,
} from "./spec.mjs";

/**
 * What the values of a mock are built with. A value is a TypeScript expression
 * of the type `renderSchema` gives the same schema, so the two read a schema
 * the same way.
 */
export interface MockValueCtx {
  /** The context the response types are rendered with (`read` mode). */
  schema: SchemaCtx;
  /**
   * The call of a component schema's mock function. Undefined while that mock
   * is being built: a value that held itself would never end.
   */
  callMock: (key: string) => string | undefined;
  /**
   * The type to assert a literal of a component schema to, when the schema is
   * a TypeScript enum (which no literal is assignable to).
   */
  enumCast: (key: string) => string | undefined;
}

/** What stands for a value of the type `unknown`. */
const ANY_VALUE = "{}";

const DATE_TIME = "2024-01-01T00:00:00.000Z";

/** A fixed value for each `format` of a string. */
const STRING_FORMATS: Record<string, string> = {
  "date-time": DATE_TIME,
  date: "2024-01-01",
  time: "00:00:00Z",
  uuid: "00000000-0000-4000-8000-000000000000",
  email: "user@example.com",
  uri: "https://example.com",
  url: "https://example.com",
  hostname: "example.com",
  ipv4: "192.0.2.1",
  ipv6: "2001:db8::1",
  byte: "c3RyaW5n",
};

type Entry = { spread: string } | { key: string; value: string };

/** An object literal's entries, or any other expression. */
type Built = { entries: Entry[] } | { expr: string };

const SIMPLE_TYPES = ["string", "number", "integer", "boolean"];

function literalKey(name: string): string {
  // `{ __proto__: … }` would set the prototype instead of a property.
  return name === "__proto__" ? '["__proto__"]' : propertyKey(name);
}

function objectLiteral(entries: Entry[], indent: string): string {
  if (entries.length === 0) return "{}";
  const lines = entries.map((entry) =>
    "spread" in entry
      ? `${indent}  ...${entry.spread},`
      : `${indent}  ${literalKey(entry.key)}: ${entry.value},`,
  );
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** `items` are written for an array that sits at `indent`. */
function arrayLiteral(items: string[], indent: string): string {
  if (items.every((item) => !item.includes("\n"))) {
    return `[${items.join(", ")}]`;
  }
  const lines = items.map((item) => `${indent}  ${item},`);
  return `[\n${lines.join("\n")}\n${indent}]`;
}

/** Any JSON value as an expression, for a place whose type takes anything. */
function jsonLiteral(value: Json, indent: string): string {
  if (Array.isArray(value)) {
    return arrayLiteral(
      value.map((item) => jsonLiteral(item, `${indent}  `)),
      indent,
    );
  }
  if (value && typeof value === "object") {
    return objectLiteral(
      Object.entries(value).map(([key, item]) => ({
        key,
        value: jsonLiteral(item, `${indent}  `),
      })),
      indent,
    );
  }
  return JSON.stringify(value);
}

function print(built: Built, indent: string): string {
  return "expr" in built ? built.expr : objectLiteral(built.entries, indent);
}

/**
 * One object out of the parts of an intersection. What is spread comes first
 * and a property wins over it, as the literal a discriminator pins has to; of
 * two properties with one name the later one stays. A property that several
 * members declare is not left to that: `buildComposed` gives it a part of its
 * own, with a value of all of its declarations.
 */
function mergeObjects(parts: Built[], indent: string): Built {
  const spreads: Entry[] = [];
  const properties = new Map<string, string>();
  for (const part of parts) {
    if ("expr" in part) {
      // Nothing to add, or what is spread already.
      const repeated = spreads.some(
        (entry) => "spread" in entry && entry.spread === part.expr,
      );
      if (part.expr !== ANY_VALUE && !repeated) {
        spreads.push({ spread: part.expr });
      }
      continue;
    }
    for (const entry of part.entries) {
      if ("spread" in entry) {
        spreads.push(entry);
      } else {
        properties.delete(entry.key);
        properties.set(entry.key, entry.value);
      }
    }
  }
  const entries: Entry[] = [
    ...spreads,
    ...[...properties].map(([key, value]) => ({ key, value })),
  ];
  // A lone spread is the value itself.
  if (entries.length === 1 && "spread" in entries[0]) {
    return { expr: entries[0].spread };
  }
  return { expr: objectLiteral(entries, indent) };
}

function stringSample(schema: Json): string {
  const fixed = STRING_FORMATS[schema.format];
  if (fixed !== undefined) return fixed;
  let text = "string";
  if (typeof schema.maxLength === "number" && schema.maxLength < text.length) {
    text = text.slice(0, Math.max(schema.maxLength, 0));
  }
  if (typeof schema.minLength === "number" && schema.minLength > text.length) {
    text = text.padEnd(schema.minLength, "x");
  }
  return text;
}

/**
 * `1`, or where the schema does not allow it, a value in the range it gives
 * that is a multiple of its `multipleOf`.
 */
function numberSample(schema: Json): number {
  // OpenAPI 3.0 writes an exclusive bound as a flag, 3.1 as the bound itself.
  let min = Number.NEGATIVE_INFINITY;
  let minOpen = false;
  if (typeof schema.minimum === "number") {
    min = schema.minimum;
    minOpen = schema.exclusiveMinimum === true;
  }
  if (
    typeof schema.exclusiveMinimum === "number" &&
    schema.exclusiveMinimum >= min
  ) {
    min = schema.exclusiveMinimum;
    minOpen = true;
  }
  let max = Number.POSITIVE_INFINITY;
  let maxOpen = false;
  if (typeof schema.maximum === "number") {
    max = schema.maximum;
    maxOpen = schema.exclusiveMaximum === true;
  }
  if (
    typeof schema.exclusiveMaximum === "number" &&
    schema.exclusiveMaximum <= max
  ) {
    max = schema.exclusiveMaximum;
    maxOpen = true;
  }
  const inRange = (value: number) =>
    (minOpen ? value > min : value >= min) &&
    (maxOpen ? value < max : value <= max);

  const step =
    typeof schema.multipleOf === "number" && schema.multipleOf > 0
      ? schema.multipleOf
      : schema.type === "integer"
        ? 1
        : undefined;
  if (step !== undefined) {
    // How many steps a bound is, as a whole number where it is one but for
    // the rounding of the division.
    const steps = (bound: number) => {
      const exact = bound / step;
      const whole = Math.round(exact);
      return Math.abs(exact - whole) < 1e-9 ? whole : exact;
    };
    const lowest = Math.ceil(steps(min));
    const highest = Math.floor(steps(max));
    // The multiple at or above 1, else the lowest in the range, else the
    // highest. With no multiple in the range there is nothing better than the
    // first.
    const candidates = [
      Math.ceil(steps(1)),
      ...(Number.isFinite(min)
        ? [lowest + (minOpen && lowest === steps(min) ? 1 : 0)]
        : []),
      ...(Number.isFinite(max)
        ? [highest - (maxOpen && highest === steps(max) ? 1 : 0)]
        : []),
    ].map((count) => Number((count * step).toPrecision(12)));
    return candidates.find(inRange) ?? candidates[0];
  }

  if (inRange(1)) return 1;
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return minOpen || maxOpen ? (min + max) / 2 : min;
  }
  if (Number.isFinite(min)) return minOpen ? min + 1 : min;
  return maxOpen ? max - 1 : max;
}

function buildRef(
  ref: string,
  ctx: MockValueCtx,
  indent: string,
  seen: ReadonlySet<string>,
): Built | undefined {
  const { doc } = ctx.schema;
  const key = componentSchemaKey(ref);
  if (key !== undefined) {
    // A reference to a schema that is not there is typed `unknown`.
    if (!Object.hasOwn(doc.components?.schemas ?? {}, key)) {
      return { expr: ANY_VALUE };
    }
    const call = ctx.callMock(key);
    return call === undefined ? undefined : { expr: call };
  }
  if (seen.has(ref)) return { expr: ANY_VALUE };
  return build(getByPointer(doc, ref), ctx, indent, new Set(seen).add(ref));
}

function buildObject(
  schema: Json,
  ctx: MockValueCtx,
  indent: string,
  seen: ReadonlySet<string>,
): Built | undefined {
  const properties: Record<string, Json> = schema.properties ?? {};
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required : [],
  );
  const entries: Entry[] = [];
  for (const [name, property] of Object.entries(properties)) {
    if (hasFlag(ctx.schema.doc, property, "writeOnly")) continue;
    const value = mockValue(property, ctx, `${indent}  `, seen);
    if (value === undefined) {
      // Nothing ends here. A property that may be absent is left out.
      if (required.has(name)) return undefined;
      continue;
    }
    entries.push({ key: name, value });
  }
  return { entries };
}

function buildArray(
  schema: Json,
  ctx: MockValueCtx,
  indent: string,
  seen: ReadonlySet<string>,
): Built | undefined {
  const inner = `${indent}  `;
  const itemOf = (item: Json) => mockValue(item, ctx, inner, seen);
  const tuple = (schemas: Json[]): Built | undefined => {
    const items = schemas.map(itemOf);
    return items.some((item) => item === undefined)
      ? undefined
      : { expr: arrayLiteral(items as string[], indent) };
  };

  if (Array.isArray(schema.prefixItems)) return tuple(schema.prefixItems);
  const length = schema.maxItems;
  if (
    schema.items &&
    typeof length === "number" &&
    length > 0 &&
    length === schema.minItems
  ) {
    return tuple(Array.from({ length }, () => schema.items));
  }
  // An empty array is a value of any array type, and it ends a cycle.
  const item =
    schema.items === undefined || length === 0
      ? undefined
      : itemOf(schema.items);
  if (item === undefined) return { expr: "[]" };
  const count =
    typeof schema.minItems === "number"
      ? Math.min(Math.max(schema.minItems, 1), 10)
      : 1;
  return {
    expr: arrayLiteral(
      Array.from({ length: count }, () => item),
      indent,
    ),
  };
}

/**
 * Every declaration of each property in a schema and in what its `allOf` is
 * made of. A member whose discriminator property is replaced
 * (`Omit<Parent, …>`) does not declare that one.
 */
function collectDeclarations(
  ctx: MockValueCtx,
  schema: Json,
  into: Map<string, Json[]>,
  omitted: ReadonlySet<string> = new Set(),
  visited: Set<Json> = new Set(),
): void {
  const { doc } = ctx.schema;
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object" || visited.has(resolved)) {
    return;
  }
  visited.add(resolved);
  const properties: Record<string, Json> = resolved.properties ?? {};
  for (const [name, property] of Object.entries(properties)) {
    if (omitted.has(name) || hasFlag(doc, property, "writeOnly")) continue;
    into.set(name, [...(into.get(name) ?? []), property]);
  }
  for (const member of Array.isArray(resolved.allOf) ? resolved.allOf : []) {
    const marker = member?.[OMITTED_PROPERTY];
    collectDeclarations(
      ctx,
      member,
      into,
      typeof marker === "string" ? new Set(omitted).add(marker) : omitted,
      visited,
    );
  }
}

/** The values a schema is limited to by its `const` or `enum`, if it is. */
function pinnedValues(
  ctx: MockValueCtx,
  schema: Json,
  depth = 0,
): Json[] | undefined {
  const resolved = resolveRef(ctx.schema.doc, schema);
  if (!resolved || typeof resolved !== "object" || depth > 16) return undefined;
  if (resolved.const !== undefined) return [resolved.const];
  if (Array.isArray(resolved.enum)) return resolved.enum;
  for (const member of Array.isArray(resolved.allOf) ? resolved.allOf : []) {
    const pinned = pinnedValues(ctx, member, depth + 1);
    if (pinned) return pinned;
  }
  return undefined;
}

/**
 * The value of an intersection that is not an object. Where a member limits
 * the values (`string & "ok"`), only one of those that every member takes is
 * a value of the type; undefined when there is none. Otherwise the members
 * differ in what a type does not show, and the first part stands for all.
 */
function buildScalarIntersection(
  members: Json[],
  first: Built,
  ctx: MockValueCtx,
  indent: string,
): Built | undefined {
  const pinned = members
    .map((member) => pinnedValues(ctx, member))
    .find((values) => values !== undefined);
  if (pinned === undefined) return first;
  for (const candidate of pinned) {
    const rendered = members.map((member) =>
      exampleValue(member, candidate, ctx, indent),
    );
    if (rendered.some((value) => value === undefined)) continue;
    // A member that is a TypeScript enum takes the value asserted to it
    // (`("a" as Status)`). No literal is a value of an enum and of another
    // enum or literal at once, so such an intersection has none.
    const values = rendered as string[];
    const isAsserted = (value: string) => value.endsWith(")");
    const asserted = values.filter(isAsserted);
    if (asserted.length === 0) return { expr: values[0] };
    const pinnedElsewhere = members.some(
      (member, index) =>
        !isAsserted(values[index]) && pinnedValues(ctx, member) !== undefined,
    );
    return asserted.length > 1 || pinnedElsewhere
      ? undefined
      : { expr: asserted[0] };
  }
  return undefined;
}

/**
 * A schema composed of others. `allOf` and the schema's own properties make
 * one object; of a `oneOf` or `anyOf` the first member that ends is taken.
 */
function buildComposed(
  schema: Json,
  ctx: MockValueCtx,
  indent: string,
  seen: ReadonlySet<string>,
): Built | undefined {
  const { doc } = ctx.schema;
  const parts: Built[] = [];

  const members: Json[] = Array.isArray(schema.allOf) ? schema.allOf : [];
  if (members.length > 0) {
    // What the `allOf` makes required is written out, as the type repeats it:
    // the member that declares it may leave it out. It goes first, so that a
    // member with a value of its own for the property keeps it.
    const required = inheritedRequired(doc, schema);
    const names = Object.keys(required);
    if (names.length > 0) {
      const part = buildObject(
        { properties: required, required: names },
        ctx,
        indent,
        seen,
      );
      if (part === undefined) return undefined;
      parts.push(part);
    }
  }
  const typed: Json[] = [];
  const firstTyped = parts.length;
  for (const member of members) {
    // A member that says nothing about the type adds nothing to the value.
    if (isRequiredOnly(member)) continue;
    if (renderSchema(member, ctx.schema) === "unknown") continue;
    const part = buildNullable(member, ctx, indent, seen);
    if (part === undefined) return undefined;
    typed.push(member);
    parts.push(part);
  }

  if (hasObjectKeywords(schema)) {
    const own = buildObject(schema, ctx, indent, seen);
    if (own === undefined) return undefined;
    parts.push(own);
  }

  const isObject = schemaKinds(doc, schema).has("object");
  if (isObject) {
    // A property that several members declare has to be a value of every
    // declaration (`{ a: { x } } & { a: { y } }`), which neither member's own
    // value of it is. It is built from all of them, and goes after the
    // members so that it replaces theirs.
    const declarations = new Map<string, Json[]>();
    collectDeclarations(ctx, schema, declarations);
    const shared: Entry[] = [];
    for (const [name, schemas] of declarations) {
      if (schemas.length < 2) continue;
      const value = mockValue({ allOf: schemas }, ctx, `${indent}  `, seen);
      if (value === undefined) return undefined;
      shared.push({ key: name, value });
    }
    if (shared.length > 0) parts.push({ entries: shared });
  } else if (typed.length > 1) {
    const scalar = buildScalarIntersection(
      typed,
      parts[firstTyped],
      ctx,
      indent,
    );
    if (scalar === undefined) return undefined;
    // It stands for every `allOf` member.
    parts.splice(firstTyped, typed.length, scalar);
  }

  for (const key of ["oneOf", "anyOf"] as const) {
    const options: Json[] = Array.isArray(schema[key]) ? schema[key] : [];
    if (options.length === 0) continue;
    let chosen: Built | undefined;
    for (const option of options) {
      const part = buildNullable(option, ctx, indent, seen);
      if (part === undefined) continue;
      const values = discriminatorValues(
        option,
        schema.discriminator,
        ctx.schema,
      );
      chosen = values
        ? {
            entries: [
              { spread: print(part, indent) },
              {
                key: schema.discriminator.propertyName,
                value: jsonLiteral(values[0], `${indent}  `),
              },
            ],
          }
        : part;
      break;
    }
    if (chosen === undefined) return undefined;
    parts.push(chosen);
  }

  if (parts.length === 0) return { expr: ANY_VALUE };
  if (parts.length === 1) return parts[0];
  // Only objects can be put together. Of anything else the first part stands
  // for the whole.
  return isObject ? mergeObjects(parts, indent) : parts[0];
}

function build(
  schema: Json,
  ctx: MockValueCtx,
  indent: string,
  seen: ReadonlySet<string>,
): Built | undefined {
  if (schema === false) return undefined;
  if (!schema || typeof schema !== "object") return { expr: ANY_VALUE };

  if (typeof schema.$ref === "string") {
    if (typeof schema[OMITTED_PROPERTY] !== "string") {
      const siblings = refSiblingSchema(ctx.schema.doc, schema);
      if (siblings) {
        return build(
          { allOf: [{ $ref: schema.$ref }, siblings] },
          ctx,
          indent,
          seen,
        );
      }
    }
    return buildRef(schema.$ref, ctx, indent, seen);
  }

  // What the specification gives as a value comes before anything made up.
  const examples = [
    schema.example,
    ...(Array.isArray(schema.examples) ? schema.examples.slice(0, 1) : []),
    schema.default,
  ];
  for (const example of examples) {
    if (example === undefined) continue;
    const value = exampleValue(schema, example, ctx, indent);
    if (value !== undefined) return { expr: value };
  }

  if (schema.const !== undefined) {
    return { expr: jsonLiteral(schema.const, indent) };
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.length === 0
      ? undefined
      : { expr: jsonLiteral(schema.enum[0], indent) };
  }

  if (
    (Array.isArray(schema.allOf) && schema.allOf.length > 0) ||
    (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) ||
    (Array.isArray(schema.anyOf) && schema.anyOf.length > 0)
  ) {
    return buildComposed(schema, ctx, indent, seen);
  }

  if (Array.isArray(schema.type)) {
    const types: string[] = schema.type.filter(
      (type: string) => type !== "null",
    );
    for (const type of types) {
      const built = build({ ...schema, type }, ctx, indent, seen);
      if (built !== undefined) return built;
    }
    return schema.type.includes("null") ? { expr: "null" } : undefined;
  }

  switch (schema.type) {
    case "string":
      if (schema.format === "binary" || hasBinaryContent(schema)) {
        return { expr: "new Blob()" };
      }
      return ctx.schema.dates && isDateString(schema)
        ? { expr: `new Date(${JSON.stringify(DATE_TIME)})` }
        : { expr: JSON.stringify(stringSample(schema)) };
    case "number":
    case "integer":
      return { expr: String(numberSample(schema)) };
    case "boolean":
      return { expr: "true" };
    case "null":
      return { expr: "null" };
    case "array":
      return buildArray(schema, ctx, indent, seen);
    case "object":
      return buildObject(schema, ctx, indent, seen);
    default:
      if (impliedType(schema) === "object") {
        return buildObject(schema, ctx, indent, seen);
      }
      if (impliedType(schema) === "array") {
        return buildArray(schema, ctx, indent, seen);
      }
      return { expr: hasBinaryContent(schema) ? "new Blob()" : ANY_VALUE };
  }
}

/** `build`, with `null` where the schema allows it and nothing else ends. */
function buildNullable(
  schema: Json,
  ctx: MockValueCtx,
  indent: string,
  seen: ReadonlySet<string>,
): Built | undefined {
  const built = build(schema, ctx, indent, seen);
  if (built !== undefined) return built;
  // `renderSchema` ignores `nullable` next to a `$ref` and on an `enum`.
  const nullable =
    schema &&
    typeof schema === "object" &&
    typeof schema.$ref !== "string" &&
    !Array.isArray(schema.enum) &&
    isNullableSchema(schema);
  return nullable ? { expr: "null" } : undefined;
}

/**
 * An expression for a value of the schema, written for a place at `indent`.
 * Undefined when no value ends: the schema allows none, or holds itself
 * through a mock that is still being built.
 */
export function mockValue(
  schema: Json,
  ctx: MockValueCtx,
  indent = "",
  seen: ReadonlySet<string> = new Set(),
): string | undefined {
  const built = buildNullable(schema, ctx, indent, seen);
  return built === undefined ? undefined : print(built, indent);
}

function sameJson(a: Json, b: Json): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function exampleArray(
  schema: Json,
  value: Json,
  ctx: MockValueCtx,
  indent: string,
  depth: number,
): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const prefix: Json[] = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : [];
  const open = schema.items !== undefined && schema.items !== false;
  if (Array.isArray(schema.prefixItems)) {
    // A tuple has every one of its items, and no more unless it is open.
    if (value.length < prefix.length) return undefined;
    if (!open && value.length > prefix.length) return undefined;
  } else if (
    schema.items &&
    typeof schema.maxItems === "number" &&
    schema.maxItems > 0 &&
    schema.maxItems === schema.minItems &&
    value.length !== schema.maxItems
  ) {
    return undefined;
  }
  const items = value.map((item, index) =>
    exampleValue(
      index < prefix.length ? prefix[index] : schema.items,
      item,
      ctx,
      `${indent}  `,
      depth + 1,
    ),
  );
  return items.some((item) => item === undefined)
    ? undefined
    : arrayLiteral(items as string[], indent);
}

function exampleObject(
  schema: Json,
  value: Json,
  ctx: MockValueCtx,
  indent: string,
  depth: number,
): string | undefined {
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const inner = `${indent}  `;
  const properties: Record<string, Json> = schema.properties ?? {};
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required : [],
  );
  const entries: Entry[] = [];
  for (const [name, property] of Object.entries(properties)) {
    if (hasFlag(ctx.schema.doc, property, "writeOnly")) continue;
    if (!Object.hasOwn(value, name)) {
      if (required.has(name)) return undefined;
      continue;
    }
    const rendered = exampleValue(property, value[name], ctx, inner, depth + 1);
    if (rendered === undefined) return undefined;
    entries.push({ key: name, value: rendered });
  }

  // The type only takes other keys where it has an index signature.
  const additional = schema.additionalProperties;
  const typed = additional && typeof additional === "object";
  const open =
    Object.keys(properties).length === 0
      ? additional !== false
      : additional === true || typed;
  if (open) {
    for (const [name, extra] of Object.entries(value as Record<string, Json>)) {
      if (Object.hasOwn(properties, name)) continue;
      const rendered = typed
        ? exampleValue(additional, extra, ctx, inner, depth + 1)
        : jsonLiteral(extra, inner);
      if (rendered === undefined) return undefined;
      entries.push({ key: name, value: rendered });
    }
  }
  return objectLiteral(entries, indent);
}

function exampleOfType(
  schema: Json,
  value: Json,
  ctx: MockValueCtx,
  indent: string,
  depth: number,
): string | undefined {
  const type =
    SIMPLE_TYPES.includes(schema.type) ||
    schema.type === "array" ||
    schema.type === "object"
      ? schema.type
      : impliedType(schema);
  switch (type) {
    case "string":
      if (typeof value !== "string") return undefined;
      if (schema.format === "binary" || hasBinaryContent(schema)) {
        return undefined;
      }
      if (ctx.schema.dates && isDateString(schema)) {
        return Number.isNaN(Date.parse(value))
          ? undefined
          : `new Date(${JSON.stringify(value)})`;
      }
      return JSON.stringify(value);
    case "number":
    case "integer":
      return typeof value === "number" &&
        Number.isFinite(value) &&
        (type === "number" || Number.isInteger(value))
        ? String(value)
        : undefined;
    case "boolean":
      return typeof value === "boolean" ? String(value) : undefined;
    case "array":
      return exampleArray(schema, value, ctx, indent, depth);
    case "object":
      return exampleObject(schema, value, ctx, indent, depth);
    default:
      // The type is `unknown`, which takes any value.
      return hasBinaryContent(schema) ? undefined : jsonLiteral(value, indent);
  }
}

/**
 * An example from the specification as an expression of the schema's type, or
 * undefined when it is not a value of that type. Examples drift from their
 * schemas, and one that did would not compile. A composed schema is not
 * checked: its example is passed over, and the value is made up instead.
 */
export function exampleValue(
  schema: Json,
  value: Json,
  ctx: MockValueCtx,
  indent = "",
  depth = 0,
): string | undefined {
  if (schema === false || value === undefined || depth > 32) return undefined;
  if (!schema || typeof schema !== "object") return jsonLiteral(value, indent);
  const { doc } = ctx.schema;

  if (typeof schema.$ref === "string") {
    if (refSiblingSchema(doc, schema)) return undefined;
    const target = getByPointer(doc, schema.$ref);
    if (target === undefined) return undefined;
    const key = componentSchemaKey(schema.$ref);
    if (key === undefined) {
      return exampleValue(target, value, ctx, indent, depth + 1);
    }
    const rendered = exampleValue(
      componentSchemaView(target, key, ctx.schema),
      value,
      ctx,
      indent,
      depth + 1,
    );
    const cast = ctx.enumCast(key);
    return rendered !== undefined && cast !== undefined
      ? `(${rendered} as ${cast})`
      : rendered;
  }

  if (
    schema.oneOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.not !== undefined ||
    schema.discriminator !== undefined ||
    schema.patternProperties !== undefined
  ) {
    return undefined;
  }
  if (Array.isArray(schema.allOf)) {
    // `allOf` around one schema is how OpenAPI 3.0 documents a reference or
    // makes it nullable.
    // What the wrapper adds, the value would have to be checked against too.
    if (
      schema.allOf.length !== 1 ||
      hasObjectKeywords(schema) ||
      (Array.isArray(schema.required) && schema.required.length > 0)
    ) {
      return undefined;
    }
    if (value === null) return isNullableSchema(schema) ? "null" : undefined;
    return exampleValue(schema.allOf[0], value, ctx, indent, depth + 1);
  }

  if (schema.const !== undefined) {
    if (sameJson(schema.const, value)) return jsonLiteral(value, indent);
    return value === null && isNullableSchema(schema) ? "null" : undefined;
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.some((member: Json) => sameJson(member, value))
      ? jsonLiteral(value, indent)
      : undefined;
  }

  const types: unknown[] = Array.isArray(schema.type)
    ? schema.type
    : [schema.type];
  if (value === null) {
    const untyped = schema.type === undefined && !impliedType(schema);
    return isNullableSchema(schema) || types.includes("null") || untyped
      ? "null"
      : undefined;
  }
  for (const type of types) {
    if (type === "null") continue;
    const rendered = exampleOfType(
      { ...schema, type },
      value,
      ctx,
      indent,
      depth,
    );
    if (rendered !== undefined) return rendered;
  }
  return undefined;
}
