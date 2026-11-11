import { type ClientKind, HEADER } from "./emitSdk.mjs";
import { propertyKey, toEnumMemberName, uniqueName } from "./naming.mjs";
import {
  buildRequestBodyNames,
  classifyResponses,
  deref,
  type OperationIR,
  type ParameterIR,
  pickContent,
  type ResponseIR,
} from "./operations.mjs";
import {
  docComment,
  renderComponentSchema,
  renderSchema,
  type SchemaCtx,
  schemaDescription,
} from "./schema.mjs";
import type { Doc, Json } from "./spec.mjs";

export type EnumsMode = "javascript" | "typescript" | false | undefined;

export type EmittedTypes = {
  content: string;
  /** Every identifier exported from the generated file. */
  exportedNames: string[];
};

/** First server URL with its variables replaced by their defaults. */
export function getBaseUrl(doc: Doc): string | undefined {
  const server = Array.isArray(doc.servers) ? doc.servers[0] : undefined;
  if (!server || typeof server.url !== "string") return undefined;
  return server.url.replace(/\{([^}]+)\}/g, (match: string, name: string) => {
    const value = server.variables?.[name]?.default;
    return value === undefined ? match : String(value);
  });
}

function statusKey(status: string): string {
  return /^\d+$/.test(status) || status === "default"
    ? status
    : JSON.stringify(status);
}

function renderParamObject(
  parameters: ParameterIR[],
  ctx: SchemaCtx,
  indent: string,
): string {
  const inner = `${indent}  `;
  const lines = parameters.map((parameter) => {
    const comment = docComment(
      {
        description: parameter.description,
        deprecated: parameter.deprecated,
      },
      inner,
    );
    return `${comment}${inner}${propertyKey(parameter.name)}${parameter.required ? "" : "?"}: ${renderSchema(parameter.schema, ctx, inner)};`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function renderEntries(
  responses: ResponseIR[],
  ctx: SchemaCtx,
): { body: string; types: string[] } {
  const seen = new Set<string>();
  const types: string[] = [];
  const lines: string[] = [];
  for (const response of responses) {
    if (seen.has(response.status)) continue;
    seen.add(response.status);
    const type = response.schema
      ? renderSchema(response.schema, ctx, "  ")
      : response.status === "204"
        ? "void"
        : "unknown";
    types.push(type);
    const comment = docComment({ description: response.description }, "  ");
    lines.push(`${comment}  ${statusKey(response.status)}: ${type};`);
  }
  return { body: lines.join("\n"), types };
}

function emitOperationTypes(
  operation: OperationIR,
  ctx: SchemaCtx,
  writeCtx: SchemaCtx,
): { names: string[]; blocks: string[] } {
  const typeNames: string[] = [];
  const blocks: string[] = [];
  const add = (name: string, type: string) => {
    typeNames.push(name);
    blocks.push(`export type ${name} = ${type};`);
  };
  const names = operation.typeNames;

  const byLocation = (location: string) =>
    operation.parameters.filter((parameter) => parameter.in === location);
  const path = byLocation("path");
  const query = byLocation("query");
  const headers = byLocation("header");

  const fields: string[] = [];
  if (operation.body) {
    const comment = docComment(
      { description: operation.body.description },
      "  ",
    );
    const type = operation.body.schema
      ? renderSchema(operation.body.schema, writeCtx, "  ")
      : "unknown";
    fields.push(
      `${comment}  body${operation.body.required ? "" : "?"}: ${type};`,
    );
  } else {
    fields.push("  body?: never;");
  }
  const addGroup = (name: string, group: ParameterIR[]) => {
    if (group.length === 0) {
      fields.push(`  ${name}?: never;`);
      return;
    }
    const required = group.some((parameter) => parameter.required);
    // Parameters are sent, so they are the request-side types too.
    fields.push(
      `  ${name}${required ? "" : "?"}: ${renderParamObject(group, writeCtx, "  ")};`,
    );
  };
  addGroup("path", path);
  addGroup("query", query);
  if (headers.length > 0) addGroup("headers", headers);
  fields.push(`  url: ${JSON.stringify(operation.path)};`);
  add(names.data, `{\n${fields.join("\n")}\n}`);

  const { responses, errors } = classifyResponses(operation);
  const emitGroup = (
    groupName: string,
    aliasName: string,
    group: ResponseIR[],
  ) => {
    if (group.length === 0) return;
    const { body, types } = renderEntries(group, ctx);
    add(groupName, `{\n${body}\n}`);
    if (types.some((type) => type !== "unknown")) {
      add(aliasName, `${groupName}[keyof ${groupName}]`);
    }
  };
  emitGroup(names.errors, names.error, errors);
  emitGroup(names.responses, names.response, responses);
  return { names: typeNames, blocks };
}

function enumKey(name: string): string {
  // `01` would be an octal literal, which TypeScript rejects.
  return /^(0|[1-9]\d*)$/.test(name) ? name : propertyKey(name);
}

function emitComponentSchema(
  schema: Json,
  key: string,
  name: string,
  ctx: SchemaCtx,
  enumsMode: EnumsMode,
): string {
  const comment = docComment({
    description: schemaDescription(schema),
    deprecated: schema?.deprecated,
  });
  const values: unknown[] = Array.isArray(schema?.enum) ? schema.enum : [];
  const isMember = (value: unknown) =>
    typeof value === "string" || typeof value === "number";
  // A TypeScript enum can only hold strings and numbers, an object anything.
  const isLiteralEnum =
    values.some((value) => value !== null) &&
    values.every(
      (value) =>
        isMember(value) ||
        (enumsMode === "javascript" &&
          (value === null || typeof value === "boolean")),
    );

  if (enumsMode && isLiteralEnum) {
    const used = new Set<string>();
    const memberNames = schema["x-enum-varnames"] ?? schema["x-enumNames"];
    const descriptions = schema["x-enum-descriptions"];
    const members = values.map((value, index) => {
      const title = memberNames?.[index];
      return {
        comment: docComment(
          {
            description: schemaDescription({
              title,
              description: descriptions?.[index],
            }),
          },
          "  ",
        ),
        key: enumKey(
          uniqueName(
            toEnumMemberName(title ?? value, {
              numericKeys: enumsMode === "javascript",
            }),
            used,
          ),
        ),
        value: JSON.stringify(value),
      };
    });
    if (enumsMode === "typescript") {
      const body = members
        .map((member) => `${member.comment}  ${member.key} = ${member.value},`)
        .join("\n");
      return `${comment}export enum ${name} {\n${body}\n}`;
    }
    const body = members
      .map((member) => `${member.comment}  ${member.key}: ${member.value},`)
      .join("\n");
    return `${comment}export const ${name} = {\n${body}\n} as const;\n\nexport type ${name} = (typeof ${name})[keyof typeof ${name}];`;
  }
  return `${comment}export type ${name} = ${renderComponentSchema(schema, key, ctx)};`;
}

export function emitTypes(
  doc: Doc,
  operations: OperationIR[],
  ctx: SchemaCtx,
  options: { enums?: EnumsMode; clientKind: ClientKind },
): EmittedTypes {
  const readCtx: SchemaCtx = { ...ctx, mode: "read" };
  const writeCtx: SchemaCtx = { ...ctx, mode: "write" };

  const head: string[] = [];
  const exported: string[] = ["ClientOptions"];

  const baseUrl = getBaseUrl(doc);
  const baseUrlKey = options.clientKind === "axios" ? "baseURL" : "baseUrl";
  head.push(
    `export type ClientOptions = {\n  ${baseUrlKey}: ${
      baseUrl ? `${JSON.stringify(baseUrl)} | (string & {})` : "string"
    };\n};`,
  );

  const schemas = (doc.components?.schemas ?? {}) as Record<string, Json>;
  for (const [key, schema] of Object.entries(schemas)) {
    const name = ctx.names.get(key) as string;
    exported.push(name);
    head.push(emitComponentSchema(schema, key, name, readCtx, options.enums));
  }

  for (const key of Object.keys(schemas)) {
    const name = ctx.writableNames?.get(key);
    if (name === undefined) continue;
    head.push(
      emitComponentSchema(schemas[key], key, name, writeCtx, undefined),
    );
    exported.push(name);
  }

  // A shared request body is a type of its own, as the schemas are.
  const bodyNames = buildRequestBodyNames(doc, [
    ...exported,
    ...operations.flatMap((operation) => [
      operation.functionName,
      ...Object.values(operation.typeNames),
    ]),
  ]);
  for (const [key, name] of bodyNames) {
    let body: Json;
    try {
      body = deref(doc, doc.components.requestBodies[key]);
    } catch {
      // Nothing uses it, or `collectOperations` would have thrown already.
    }
    const schema = pickContent(body?.content)?.media?.schema;
    const comment = docComment({ description: body?.description });
    head.push(
      `${comment}export type ${name} = ${schema ? renderSchema(schema, writeCtx) : "unknown"};`,
    );
    exported.push(name);
  }

  const operationBlocks: string[] = [];
  const operationNames: string[] = [];
  for (const operation of operations) {
    const { names, blocks } = emitOperationTypes(operation, readCtx, writeCtx);
    operationNames.push(...names);
    operationBlocks.push(...blocks);
  }

  exported.push(...operationNames);

  return {
    content: `${HEADER}\n${[...head, ...operationBlocks].join("\n\n")}\n`,
    exportedNames: exported,
  };
}
