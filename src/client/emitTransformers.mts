import { HEADER } from "./emitSdk.mjs";
import { isValidIdentifier, uniqueName } from "./naming.mjs";
import { classifyResponses, type OperationIR } from "./operations.mjs";
import {
  componentSchemaKey,
  discriminatorValues,
  isDateString,
  type SchemaCtx,
} from "./schema.mjs";
import {
  COMPONENT_SCHEMA_PREFIX,
  getByPointer,
  type Json,
  refSiblingSchema,
} from "./spec.mjs";

/**
 * The shapes a JSON value can have that a transformer looks at. A date is a
 * string, and everything else that holds one is an object or an array.
 */
type Kind = "string" | "object" | "array" | "other";
const ALL_KINDS: readonly Kind[] = ["string", "object", "array", "other"];
const ACTED_KINDS = ["string", "object", "array"] as const;

type UnionMember = {
  /** The shapes a value of this member can have. */
  kinds: Set<Kind>;
  plan?: Plan;
  /** Values of the discriminator property that identify the member. */
  values?: unknown[];
};

/** What to do with a value so that its date strings become `Date` objects. */
type Plan =
  | { kind: "date" }
  | { kind: "ref"; key: string }
  | { kind: "array"; prefix: Array<Plan | undefined>; items?: Plan }
  | {
      kind: "object";
      properties: Array<[string, Plan]>;
      /** Every declared property, which the other keys are told apart from. */
      declared: string[];
      patterns: Array<[string, Plan | undefined]>;
      additional?: Plan;
    }
  /** Every step applies; each one only touches the shape it is made for. */
  | { kind: "all"; steps: Plan[] }
  /** A `oneOf`/`anyOf` before its members are told apart. */
  | { kind: "union"; members: UnionMember[]; property?: string; where: string }
  | {
      kind: "tagged";
      property: string;
      cases: Array<{ values: unknown[]; plan: Plan }>;
    };

export type EmittedTransformers = {
  /** The file, or undefined when no response holds a date. */
  content: string | undefined;
  /** SDK function name → name of its exported response transformer. */
  byOperation: Map<string, string>;
  /**
   * Unions whose members cannot be told apart at runtime. Their dates stay
   * strings although the types say `Date`.
   */
  skipped: string[];
};

function kindOfType(type: unknown): Kind {
  return type === "string" || type === "object" || type === "array"
    ? type
    : "other";
}

function kindOfValue(value: unknown): Kind {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" && value !== null ? "object" : "other";
}

/** The shapes a value of the schema can have. Unknown means any of them. */
function kindsOf(ctx: SchemaCtx, schema: Json, depth = 0): Set<Kind> {
  if (schema === false) return new Set();
  if (!schema || typeof schema !== "object" || depth > 16) {
    return new Set(ALL_KINDS);
  }
  if (typeof schema.$ref === "string") {
    return kindsOf(ctx, getByPointer(ctx.doc, schema.$ref), depth + 1);
  }
  if (schema.const !== undefined) return new Set([kindOfValue(schema.const)]);
  if (Array.isArray(schema.enum)) {
    return new Set((schema.enum as unknown[]).map(kindOfValue));
  }

  let kinds: Set<Kind>;
  if (Array.isArray(schema.type)) {
    kinds = new Set((schema.type as unknown[]).map(kindOfType));
  } else if (typeof schema.type === "string") {
    kinds = new Set([kindOfType(schema.type)]);
  } else if (
    schema.properties ||
    schema.patternProperties ||
    schema.additionalProperties !== undefined
  ) {
    kinds = new Set<Kind>(["object"]);
  } else if (schema.items || schema.prefixItems) {
    kinds = new Set<Kind>(["array"]);
  } else {
    kinds = new Set(ALL_KINDS);
  }

  const narrow = (other: Set<Kind>) => {
    kinds = new Set([...kinds].filter((kind) => other.has(kind)));
  };
  for (const member of Array.isArray(schema.allOf) ? schema.allOf : []) {
    narrow(kindsOf(ctx, member, depth + 1));
  }
  for (const key of ["oneOf", "anyOf"] as const) {
    if (!Array.isArray(schema[key]) || schema[key].length === 0) continue;
    narrow(
      new Set(
        (schema[key] as Json[]).flatMap((member) => [
          ...kindsOf(ctx, member, depth + 1),
        ]),
      ),
    );
  }
  return kinds;
}

function all(steps: Array<Plan | undefined>): Plan | undefined {
  const present = steps.filter((step) => step !== undefined);
  if (present.length === 0) return undefined;
  return present.length === 1 ? present[0] : { kind: "all", steps: present };
}

/**
 * Build the plan for a schema, following the same reading of it as the types
 * do. A component is only referred to; unions are told apart later.
 */
function buildPlan(
  schema: Json,
  ctx: SchemaCtx,
  where: string,
  seen: ReadonlySet<string> = new Set(),
): Plan | undefined {
  if (!schema || typeof schema !== "object") return undefined;

  if (typeof schema.$ref === "string") {
    const siblings = refSiblingSchema(ctx.doc, schema);
    if (siblings) {
      return buildPlan(
        { allOf: [{ $ref: schema.$ref }, siblings] },
        ctx,
        where,
        seen,
      );
    }
    const key = componentSchemaKey(schema.$ref);
    if (key !== undefined) {
      return Object.hasOwn(ctx.doc.components?.schemas ?? {}, key)
        ? { kind: "ref", key }
        : undefined;
    }
    if (seen.has(schema.$ref)) return undefined;
    return buildPlan(
      getByPointer(ctx.doc, schema.$ref),
      ctx,
      where,
      new Set(seen).add(schema.$ref),
    );
  }

  if (schema.const !== undefined || Array.isArray(schema.enum)) {
    return undefined;
  }

  const hasObjectKeywords =
    schema.properties ||
    schema.patternProperties ||
    schema.additionalProperties;
  const allOf: Json[] =
    Array.isArray(schema.allOf) && schema.allOf.length > 0 ? schema.allOf : [];
  const unionKeys = (["oneOf", "anyOf"] as const).filter(
    (key) => Array.isArray(schema[key]) && schema[key].length > 0,
  );
  if (allOf.length > 0 || unionKeys.length > 0) {
    return all([
      ...allOf.map((member, index) =>
        buildPlan(member, ctx, `${where}/allOf/${index}`, seen),
      ),
      ...unionKeys.map((key) =>
        buildUnion(
          schema[key],
          schema.discriminator,
          ctx,
          `${where}/${key}`,
          seen,
        ),
      ),
      hasObjectKeywords ? buildObject(schema, ctx, where, seen) : undefined,
    ]);
  }

  if (Array.isArray(schema.type)) {
    return all(
      (schema.type as string[])
        .filter((type) => type !== "null")
        .map((type) => buildPlan({ ...schema, type }, ctx, where, seen)),
    );
  }

  switch (schema.type) {
    case "string":
      return isDateString(schema) ? { kind: "date" } : undefined;
    case "array":
      return buildArray(schema, ctx, where, seen);
    case "object":
      return buildObject(schema, ctx, where, seen);
    case undefined:
      if (hasObjectKeywords) return buildObject(schema, ctx, where, seen);
      return schema.items || schema.prefixItems
        ? buildArray(schema, ctx, where, seen)
        : undefined;
    default:
      return undefined;
  }
}

function buildArray(
  schema: Json,
  ctx: SchemaCtx,
  where: string,
  seen: ReadonlySet<string>,
): Plan | undefined {
  const prefix: Array<Plan | undefined> = Array.isArray(schema.prefixItems)
    ? schema.prefixItems.map((item: Json, index: number) =>
        buildPlan(item, ctx, `${where}/prefixItems/${index}`, seen),
      )
    : [];
  const items = buildPlan(schema.items, ctx, `${where}/items`, seen);
  return items || prefix.some((plan) => plan !== undefined)
    ? { kind: "array", prefix, items }
    : undefined;
}

function isUsablePattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function buildObject(
  schema: Json,
  ctx: SchemaCtx,
  where: string,
  seen: ReadonlySet<string>,
): Plan | undefined {
  const declared = Object.keys(schema.properties ?? {});
  const properties: Array<[string, Plan]> = [];
  for (const [name, value] of Object.entries(
    (schema.properties ?? {}) as Record<string, Json>,
  )) {
    const plan = buildPlan(value, ctx, `${where}/properties/${name}`, seen);
    if (plan) properties.push([name, plan]);
  }
  const patterns: Array<[string, Plan | undefined]> = Object.entries(
    (schema.patternProperties ?? {}) as Record<string, Json>,
  )
    .filter(([pattern]) => isUsablePattern(pattern))
    .map(([pattern, value]) => [
      pattern,
      buildPlan(value, ctx, `${where}/patternProperties/${pattern}`, seen),
    ]);
  const additional =
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
      ? buildPlan(
          schema.additionalProperties,
          ctx,
          `${where}/additionalProperties`,
          seen,
        )
      : undefined;
  if (
    properties.length === 0 &&
    additional === undefined &&
    patterns.every(([, plan]) => plan === undefined)
  ) {
    return undefined;
  }
  return { kind: "object", properties, declared, patterns, additional };
}

function buildUnion(
  options: Json[],
  discriminator: Json,
  ctx: SchemaCtx,
  where: string,
  seen: ReadonlySet<string>,
): Plan | undefined {
  const property =
    typeof discriminator?.propertyName === "string"
      ? discriminator.propertyName
      : undefined;
  const distinct = new Map<string, Json>();
  for (const option of options) distinct.set(JSON.stringify(option), option);
  const members: UnionMember[] = [...distinct.values()].map(
    (member, index) => ({
      kinds: kindsOf(ctx, member),
      plan: buildPlan(member, ctx, `${where}/${index}`, seen),
      values: property
        ? discriminatorValues(member, discriminator, ctx)
        : undefined,
    }),
  );
  return members.some((member) => member.plan !== undefined)
    ? { kind: "union", members, property, where }
    : undefined;
}

/** Rebuild a plan with each part replaced by what `visit` makes of it. */
function mapPlan(
  plan: Plan | undefined,
  visit: (plan: Plan) => Plan | undefined,
): Plan | undefined {
  if (plan === undefined) return undefined;
  const map = (part: Plan | undefined) => mapPlan(part, visit);
  switch (plan.kind) {
    case "date":
    case "ref":
      return visit(plan);
    case "array": {
      const prefix = plan.prefix.map(map);
      const items = map(plan.items);
      return items || prefix.some((part) => part !== undefined)
        ? visit({ kind: "array", prefix, items })
        : undefined;
    }
    case "object": {
      const properties = plan.properties.flatMap(
        ([name, part]): Array<[string, Plan]> => {
          const mapped = map(part);
          return mapped ? [[name, mapped]] : [];
        },
      );
      const patterns = plan.patterns.map(
        ([pattern, part]): [string, Plan | undefined] => [pattern, map(part)],
      );
      const additional = map(plan.additional);
      return properties.length > 0 ||
        additional !== undefined ||
        patterns.some(([, part]) => part !== undefined)
        ? visit({ ...plan, properties, patterns, additional })
        : undefined;
    }
    case "all": {
      const steps = plan.steps.map(map).filter((step) => step !== undefined);
      if (steps.length < 2) return steps[0];
      return visit({ kind: "all", steps });
    }
    case "union": {
      const members = plan.members.map((member) => ({
        ...member,
        plan: map(member.plan),
      }));
      return members.some((member) => member.plan !== undefined)
        ? visit({ ...plan, members })
        : undefined;
    }
    case "tagged": {
      const cases = plan.cases.flatMap((entry) => {
        const mapped = map(entry.plan);
        return mapped ? [{ values: entry.values, plan: mapped }] : [];
      });
      return cases.length > 0 ? visit({ ...plan, cases }) : undefined;
    }
  }
}

/** The components a plan refers to, and whether it holds a date of its own. */
function inspect(plan: Plan | undefined): { refs: string[]; dates: boolean } {
  const refs: string[] = [];
  let dates = false;
  mapPlan(plan, (part) => {
    if (part.kind === "ref") refs.push(part.key);
    if (part.kind === "date") dates = true;
    return part;
  });
  return { refs, dates };
}

/** The components whose plan reaches a date, directly or through others. */
function liveKeys(plans: Map<string, Plan | undefined>): Set<string> {
  const dependents = new Map<string, string[]>();
  const queue: string[] = [];
  for (const [key, plan] of plans) {
    const { refs, dates } = inspect(plan);
    if (dates) queue.push(key);
    for (const ref of refs) {
      dependents.set(ref, [...(dependents.get(ref) ?? []), key]);
    }
  }
  const live = new Set<string>();
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (live.has(key)) continue;
    live.add(key);
    queue.push(...(dependents.get(key) ?? []));
  }
  return live;
}

function dropDead(plan: Plan | undefined, live: Set<string>): Plan | undefined {
  return mapPlan(plan, (part) =>
    part.kind === "ref" && !live.has(part.key) ? undefined : part,
  );
}

type Acted = (typeof ACTED_KINDS)[number];

/** The shapes of the value itself, not of what is inside it, a plan changes. */
function actsOf(plan: Plan, byKey: Map<string, Set<Acted>>): Set<Acted> {
  switch (plan.kind) {
    case "date":
      return new Set<Acted>(["string"]);
    case "array":
      return new Set<Acted>(["array"]);
    case "object":
    case "tagged":
      return new Set<Acted>(["object"]);
    case "ref":
      return byKey.get(plan.key) ?? new Set();
    case "all":
      return new Set(plan.steps.flatMap((step) => [...actsOf(step, byKey)]));
    case "union":
      return new Set(
        plan.members.flatMap((member) =>
          member.plan ? [...actsOf(member.plan, byKey)] : [],
        ),
      );
  }
}

function actsByKey(
  plans: Map<string, Plan | undefined>,
): Map<string, Set<Acted>> {
  const byKey = new Map<string, Set<Acted>>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, plan] of plans) {
      if (!plan) continue;
      const acts = actsOf(plan, byKey);
      if (acts.size !== (byKey.get(key)?.size ?? 0)) {
        byKey.set(key, acts);
        changed = true;
      }
    }
  }
  return byKey;
}

/** Keep the parts of a plan that only change values of the allowed shapes. */
function restrict(
  plan: Plan,
  allowed: Set<Acted>,
  byKey: Map<string, Set<Acted>>,
): Plan | undefined {
  if (plan.kind === "all") {
    return all(plan.steps.map((step) => restrict(step, allowed, byKey)));
  }
  return [...actsOf(plan, byKey)].every((kind) => allowed.has(kind))
    ? plan
    : undefined;
}

/**
 * Tell the members of every union apart. A step only changes the shape it is
 * made for, so members of different shapes simply follow each other. Two
 * members of the same shape need a discriminator, and without one their dates
 * are left alone.
 */
function resolveUnions(
  plan: Plan | undefined,
  byKey: Map<string, Set<Acted>>,
  skipped: Set<string>,
): Plan | undefined {
  return mapPlan(plan, (part) => {
    if (part.kind !== "union") return part;
    const allowed = part.members.map(() => new Set<Acted>(ACTED_KINDS));
    let tagged: Plan | undefined;
    for (const kind of ACTED_KINDS) {
      const candidates = part.members.flatMap((member, index) =>
        member.kinds.has(kind) ? [index] : [],
      );
      const actors = candidates.filter((index) => {
        const memberPlan = part.members[index].plan;
        return memberPlan !== undefined && actsOf(memberPlan, byKey).has(kind);
      });
      if (actors.length === 0 || candidates.length === 1) continue;
      for (const index of actors) allowed[index].delete(kind);

      const told =
        kind === "object" &&
        part.property !== undefined &&
        candidates.every((index) => part.members[index].values !== undefined);
      if (told) {
        const only = new Set<Acted>(["object"]);
        tagged = {
          kind: "tagged",
          property: part.property as string,
          cases: actors.flatMap((index) => {
            const member = part.members[index];
            const memberPlan = restrict(member.plan as Plan, only, byKey);
            return memberPlan
              ? [{ values: member.values as unknown[], plan: memberPlan }]
              : [];
          }),
        };
        if (tagged.cases.length === 0) tagged = undefined;
      } else if (kind !== "string") {
        // A string next to a date is typed `string | Date`, which holds
        // either way. An object or an array is typed as holding `Date`s.
        skipped.add(part.where);
      }
    }
    return all([
      ...part.members.map((member, index) =>
        member.plan ? restrict(member.plan, allowed[index], byKey) : undefined,
      ),
      tagged,
    ]);
  });
}

function access(target: string, name: string): string {
  return isValidIdentifier(name)
    ? `${target}.${name}`
    : `${target}[${JSON.stringify(name)}]`;
}

function suffix(depth: number): string {
  return depth === 0 ? "" : String(depth + 1);
}

/** Statements that turn the dates in `target` into `Date` objects in place. */
function emitPlan(
  plan: Plan,
  target: string,
  indent: string,
  depth: number,
  functionNames: Map<string, string>,
): string[] {
  const inner = `${indent}  `;
  const emit = (part: Plan, on: string, at = inner, level = depth) =>
    emitPlan(part, on, at, level, functionNames);
  switch (plan.kind) {
    case "date":
      return [
        `${indent}if (typeof ${target} === "string") ${target} = new Date(${target});`,
      ];
    case "ref": {
      const call = `${target} = ${functionNames.get(plan.key)}(${target});`;
      // Assigning to a property that is not there would add it.
      return [
        target === "data"
          ? `${indent}${call}`
          : `${indent}if (${target} !== undefined) ${call}`,
      ];
    }
    case "all":
      return plan.steps.flatMap((step) => emit(step, target, indent));
    case "array": {
      const lines = [`${indent}if (Array.isArray(${target})) {`];
      plan.prefix.forEach((part, index) => {
        if (part) lines.push(...emit(part, `${target}[${index}]`));
      });
      if (plan.items) {
        const index = `i${suffix(depth)}`;
        lines.push(
          `${inner}for (let ${index} = ${plan.prefix.length}; ${index} < ${target}.length; ${index}++) {`,
          ...emit(plan.items, `${target}[${index}]`, `${inner}  `, depth + 1),
          `${inner}}`,
        );
      }
      lines.push(`${indent}}`);
      return lines;
    }
    case "object": {
      const lines = [
        `${indent}if (typeof ${target} === "object" && ${target} !== null && !Array.isArray(${target})) {`,
      ];
      for (const [name, part] of plan.properties) {
        lines.push(...emit(part, access(target, name)));
      }
      const patterned = plan.patterns.filter(([, part]) => part !== undefined);
      if (plan.additional || patterned.length > 0) {
        const key = `key${suffix(depth)}`;
        const body = `${inner}  `;
        const test = (pattern: string) =>
          `new RegExp(${JSON.stringify(pattern)}).test(${key})`;
        lines.push(`${inner}for (const ${key} of Object.keys(${target})) {`);
        if (plan.declared.length > 0) {
          const names = plan.declared.map((name) => JSON.stringify(name));
          lines.push(
            `${body}if ([${names.join(", ")}].includes(${key})) continue;`,
          );
        }
        for (const [pattern, part] of patterned) {
          lines.push(
            `${body}if (${test(pattern)}) {`,
            ...emit(part as Plan, `${target}[${key}]`, `${body}  `, depth + 1),
            `${body}}`,
          );
        }
        if (plan.additional) {
          // `additionalProperties` describes the keys no pattern matches.
          const unmatched = plan.patterns
            .map(([pattern]) => `!${test(pattern)}`)
            .join(" && ");
          const at = unmatched ? `${body}  ` : body;
          if (unmatched) lines.push(`${body}if (${unmatched}) {`);
          lines.push(
            ...emit(plan.additional, `${target}[${key}]`, at, depth + 1),
          );
          if (unmatched) lines.push(`${body}}`);
        }
        lines.push(`${inner}}`);
      }
      lines.push(`${indent}}`);
      return lines;
    }
    case "tagged": {
      const lines = [
        `${indent}if (typeof ${target} === "object" && ${target} !== null) {`,
      ];
      plan.cases.forEach((entry, index) => {
        const tests = entry.values
          .map(
            (value) =>
              `${access(target, plan.property)} === ${JSON.stringify(value)}`,
          )
          .join(" || ");
        lines.push(
          `${inner}${index === 0 ? "" : "} else "}if (${tests}) {`,
          ...emit(entry.plan, target, `${inner}  `),
        );
      });
      lines.push(`${inner}}`, `${indent}}`);
      return lines;
    }
    case "union":
      // Resolved before anything is emitted.
      return [];
  }
}

/** A map with the same keys and every value passed through `change`. */
function mapValues<K, V>(map: Map<K, V>, change: (value: V) => V): Map<K, V> {
  return new Map([...map].map(([key, value]) => [key, change(value)]));
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Generate `transformers.gen.ts` for `--useDateType`: a function per operation
 * that turns the `date` and `date-time` strings of its successful response
 * into `Date` objects, as the generated types say they are.
 */
export function emitTransformers(
  operations: OperationIR[],
  ctx: SchemaCtx,
): EmittedTransformers {
  const schemas = (ctx.doc.components?.schemas ?? {}) as Record<string, Json>;
  let components = new Map<string, Plan | undefined>(
    Object.entries(schemas).map(([key, schema]) => [
      key,
      buildPlan(schema, ctx, `${COMPONENT_SCHEMA_PREFIX}${key}`),
    ]),
  );
  let responses = new Map<string, Plan | undefined>();
  for (const operation of operations) {
    const bodies = classifyResponses(operation)
      .responses.map((response) => response.schema)
      .filter((schema) => schema !== undefined);
    const where = `${operation.method.toUpperCase()} ${operation.path}`;
    responses.set(
      operation.functionName,
      // Which of several successful responses arrived is not known here.
      buildUnion(bodies, undefined, ctx, `${where} responses`, new Set()),
    );
  }

  const prune = () => {
    const live = liveKeys(components);
    const keep = (plan: Plan | undefined) => dropDead(plan, live);
    components = mapValues(components, keep);
    responses = mapValues(responses, keep);
  };

  prune();
  const byKey = actsByKey(components);
  const skipped = new Set<string>();
  const resolve = (plan: Plan | undefined) =>
    resolveUnions(plan, byKey, skipped);
  components = mapValues(components, resolve);
  responses = mapValues(responses, resolve);
  // Dropping an ambiguous union can leave a component with nothing to do.
  prune();

  const used = new Set<string>();
  // `sdk.gen.ts` imports a transformer next to the functions it declares.
  const sdkFunctions = new Set(
    operations.map((operation) => operation.functionName),
  );
  const byOperation = new Map<string, string>();
  for (const [name, plan] of responses) {
    if (plan) {
      byOperation.set(
        name,
        uniqueName(`${name}ResponseTransformer`, used, sdkFunctions),
      );
    }
  }
  if (byOperation.size === 0) {
    return { content: undefined, byOperation, skipped: [...skipped] };
  }

  // Only what a response reaches, so that nothing is left unused.
  const reached = new Set<string>();
  const queue = [...responses.values()].flatMap((plan) => inspect(plan).refs);
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (reached.has(key)) continue;
    reached.add(key);
    queue.push(...inspect(components.get(key)).refs);
  }
  const functionNames = new Map<string, string>();
  for (const key of Object.keys(schemas)) {
    if (!reached.has(key)) continue;
    const typeName = ctx.names.get(key) as string;
    functionNames.set(
      key,
      uniqueName(`${lowerFirst(typeName)}SchemaResponseTransformer`, used),
    );
  }

  const body = (plan: Plan) =>
    [...emitPlan(plan, "data", "  ", 0, functionNames), "  return data;"].join(
      "\n",
    );
  const blocks: string[] = [];
  for (const [key, name] of functionNames) {
    blocks.push(
      `const ${name} = (data: any): any => {\n${body(components.get(key) as Plan)}\n};`,
    );
  }
  for (const [operation, name] of byOperation) {
    blocks.push(
      `export const ${name} = (data: any): any => {\n${body(responses.get(operation) as Plan)}\n};`,
    );
  }
  return {
    content: `${HEADER}\n${blocks.join("\n\n")}\n`,
    byOperation,
    skipped: [...skipped],
  };
}
