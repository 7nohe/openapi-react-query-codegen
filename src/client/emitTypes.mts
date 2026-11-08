import { propertyKey, toEnumMemberName, uniqueName } from "./naming.mjs";
import {
  classifyResponses,
  type OperationIR,
  type ParameterIR,
  type ResponseIR,
} from "./operations.mjs";
import {
  docComment,
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
): string[] {
  const out: string[] = [];
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
    fields.push(
      `  ${name}${required ? "" : "?"}: ${renderParamObject(group, ctx, "  ")};`,
    );
  };
  addGroup("path", path);
  addGroup("query", query);
  if (headers.length > 0) addGroup("headers", headers);
  fields.push(`  url: ${JSON.stringify(operation.path)};`);
  out.push(`export type ${names.data} = {\n${fields.join("\n")}\n};`);

  const { responses, errors } = classifyResponses(operation);
  const emitGroup = (
    groupName: string,
    aliasName: string,
    group: ResponseIR[],
  ) => {
    if (group.length === 0) return;
    const { body, types } = renderEntries(group, ctx);
    out.push(`export type ${groupName} = {\n${body}\n};`);
    if (types.some((type) => type !== "unknown")) {
      out.push(`export type ${aliasName} = ${groupName}[keyof ${groupName}];`);
    }
  };
  emitGroup(names.errors, names.error, errors);
  emitGroup(names.responses, names.response, responses);
  return out;
}

function emitComponentSchema(
  key: string,
  schema: Json,
  name: string,
  ctx: SchemaCtx,
  enumsMode: EnumsMode,
): string {
  const comment = docComment({
    description: schemaDescription(schema),
    deprecated: schema?.deprecated,
  });
  const isLiteralEnum =
    Array.isArray(schema?.enum) &&
    schema.enum.length > 0 &&
    schema.enum.every(
      (value: unknown) =>
        typeof value === "string" || typeof value === "number",
    );

  if (enumsMode && isLiteralEnum) {
    const used = new Set<string>();
    const members = (schema.enum as Array<string | number>).map((value) => ({
      key: uniqueName(
        toEnumMemberName(value, { numericKeys: enumsMode === "javascript" }),
        used,
      ),
      value: JSON.stringify(value),
    }));
    if (enumsMode === "typescript") {
      const body = members
        .map((member) => `  ${member.key} = ${member.value},`)
        .join("\n");
      return `${comment}export enum ${name} {\n${body}\n}`;
    }
    const body = members
      .map((member) => `  ${member.key}: ${member.value},`)
      .join("\n");
    return `${comment}export const ${name} = {\n${body}\n} as const;\n\nexport type ${name} = (typeof ${name})[keyof typeof ${name}];`;
  }
  void key;
  return `${comment}export type ${name} = ${renderSchema(schema, ctx)};`;
}

export function emitTypes(
  doc: Doc,
  operations: OperationIR[],
  ctx: SchemaCtx,
  options: { enums?: EnumsMode; clientKind: "fetch" | "axios" },
): EmittedTypes {
  const usedWritable = new Set<string>();
  const readCtx: SchemaCtx = { ...ctx, mode: "read", usedWritable };
  const writeCtx: SchemaCtx = { ...ctx, mode: "write", usedWritable };

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
    head.push(emitComponentSchema(key, schema, name, readCtx, options.enums));
  }

  // Operation types are rendered before the request-side variants because
  // rendering a request body is what discovers which variants are needed.
  const operationBlocks: string[] = [];
  for (const operation of operations) {
    operationBlocks.push(...emitOperationTypes(operation, readCtx, writeCtx));
  }

  // A variant can reference further variants, so repeat until none is new.
  const variants = new Map<string, string>();
  let discovered = true;
  while (discovered) {
    discovered = false;
    for (const key of Object.keys(schemas)) {
      if (!usedWritable.has(key) || variants.has(key)) continue;
      discovered = true;
      const name = ctx.writableNames?.get(key) as string;
      variants.set(
        key,
        emitComponentSchema(key, schemas[key], name, writeCtx, undefined),
      );
    }
  }
  for (const key of Object.keys(schemas)) {
    const block = variants.get(key);
    if (block) {
      head.push(block);
      exported.push(ctx.writableNames?.get(key) as string);
    }
  }

  for (const block of operationBlocks) {
    const match = /^export type (\w+)/.exec(block);
    if (match) exported.push(match[1]);
  }

  return {
    content: `// This file is auto-generated by @7nohe/openapi-react-query-codegen\n\n${[...head, ...operationBlocks].join("\n\n")}\n`,
    exportedNames: exported,
  };
}
