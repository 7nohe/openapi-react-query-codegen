import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OperationInfo } from "../types.mjs";
import {
  type ClientKind,
  emitClientFile,
  emitIndexFile,
  emitSdk,
  emitServicesShim,
  optionsAreOptional,
} from "./emitSdk.mjs";
import { type EnumsMode, emitTypes, getBaseUrl } from "./emitTypes.mjs";
import {
  buildSchemaNames,
  collectOperations,
  type OperationIR,
  parameterType,
  schemaPrimitiveKind,
} from "./operations.mjs";
import { renderSchema, type SchemaCtx } from "./schema.mjs";
import { bundleExternalRefs, type Doc, loadSpec } from "./spec.mjs";

export type { ClientKind } from "./emitSdk.mjs";
export type { EnumsMode } from "./emitTypes.mjs";
export { detectImportExtension, findNearestTsConfigPath } from "./tsconfig.mjs";

export interface ClientGenOptions {
  /** Path, URL or inline content of the OpenAPI specification. */
  input: string;
  client: ClientKind;
  enums?: EnumsMode;
  /** `.js` for Node16/NodeNext module resolution, otherwise empty. */
  importExtension: "" | ".js";
  /** Name operations after the HTTP method and path instead of operationId. */
  noOperationId?: boolean;
  /** Query parameter used for pagination. */
  pageParam: string;
}

export interface GeneratedFile {
  name: string;
  content: string;
}

export interface GeneratedClient {
  files: GeneratedFile[];
  operations: OperationInfo[];
  /** Type names exported from `types.gen.ts`. */
  modelNames: string[];
  /** Function names exported from `sdk.gen.ts`. */
  serviceNames: string[];
}

const RUNTIME_FILES: Record<ClientKind, string> = {
  fetch: "./runtime/fetch.runtime.ts",
  axios: "./runtime/axios.runtime.ts",
};

async function readRuntime(kind: ClientKind): Promise<string> {
  return readFile(new URL(RUNTIME_FILES[kind], import.meta.url), "utf-8");
}

function assertSupported(doc: Doc): void {
  if (doc.swagger) {
    throw new Error(
      `Swagger/OpenAPI 2.0 specifications are not supported (found swagger: "${doc.swagger}"). Convert the specification to OpenAPI 3.x first.`,
    );
  }
  if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.")) {
    throw new Error(
      `Unsupported or missing "openapi" version: ${JSON.stringify(doc.openapi)}. OpenAPI 3.0 and 3.1 are supported.`,
    );
  }
}

function toOperationInfo(
  operation: OperationIR,
  ctx: SchemaCtx,
  pageParam: string,
): OperationInfo {
  const parameters = operation.parameters
    .filter((parameter) => parameter.in !== "cookie")
    .map((parameter) => ({
      name: parameter.name,
      typeName: parameterType(parameter, ctx),
      optional: !parameter.required,
    }));
  if (operation.body) {
    parameters.push({
      name: "body",
      typeName: operation.body.schema
        ? renderSchema(operation.body.schema, ctx)
        : "unknown",
      optional: !operation.body.required,
    });
  }

  const method = operation.method.toUpperCase();
  const pageParameter =
    method === "GET"
      ? operation.parameters.find(
          (parameter) =>
            parameter.in === "query" && parameter.name === pageParam,
        )
      : undefined;

  return {
    methodName: operation.functionName,
    capitalizedMethodName: operation.typeStem,
    dataTypeName: `${operation.typeStem}Data`,
    httpMethod: method,
    jsDoc: operation.jsDoc,
    isDeprecated: operation.deprecated,
    parameters,
    allParamsOptional: optionsAreOptional(operation),
    isPaginatable: pageParameter !== undefined,
    pageParamType: pageParameter
      ? parameterType(pageParameter, ctx)
      : undefined,
    pageParamTypeKind: pageParameter
      ? schemaPrimitiveKind(ctx.doc, pageParameter.schema)
      : undefined,
  } as OperationInfo;
}

/** Generate the TypeScript client (types, SDK, runtime) for a specification. */
export async function generateClient(
  options: ClientGenOptions,
): Promise<GeneratedClient> {
  const loaded = await loadSpec(options.input);
  const doc = await bundleExternalRefs(loaded);
  assertSupported(doc);

  const names = buildSchemaNames(doc);
  const ctx: SchemaCtx = { doc, names };
  const operations = collectOperations(doc, {
    useOperationId: !options.noOperationId,
  });

  const ext = options.importExtension;
  const types = emitTypes(doc, operations, ctx, {
    enums: options.enums,
    clientKind: options.client,
  });

  const files: GeneratedFile[] = [
    { name: "types.gen.ts", content: types.content },
    {
      name: "sdk.gen.ts",
      content: emitSdk(doc, operations, { kind: options.client, ext }),
    },
    {
      name: "client.gen.ts",
      content: emitClientFile({
        kind: options.client,
        ext,
        baseUrl: getBaseUrl(doc),
      }),
    },
    { name: "runtime.gen.ts", content: await readRuntime(options.client) },
    { name: "index.ts", content: emitIndexFile(ext) },
    { name: "services.gen.ts", content: emitServicesShim(ext) },
  ];

  return {
    files,
    operations: operations.map((operation) =>
      toOperationInfo(operation, ctx, options.pageParam),
    ),
    modelNames: types.exportedNames,
    serviceNames: operations.map((operation) => operation.functionName),
  };
}

export async function writeGeneratedFiles(
  outputDir: string,
  files: GeneratedFile[],
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    files.map((file) =>
      writeFile(path.join(outputDir, file.name), file.content),
    ),
  );
}
