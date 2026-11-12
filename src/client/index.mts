import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedFile, OperationInfo } from "../types.mjs";
import { emitSchemas, type SchemasMode } from "./emitSchemas.mjs";
import {
  type ClientKind,
  emitClientFile,
  emitIndexFile,
  emitSdk,
  emitServicesShim,
  optionsAreOptional,
} from "./emitSdk.mjs";
import { emitTransformers } from "./emitTransformers.mjs";
import { type EnumsMode, emitTypes, getBaseUrl } from "./emitTypes.mjs";
import { capitalizeFirst } from "./naming.mjs";
import {
  buildSchemaNames,
  buildWritableNames,
  collectOperations,
  type OperationIR,
  schemaPrimitiveKind,
} from "./operations.mjs";
import { renderSchema, type SchemaCtx } from "./schema.mjs";
import { bundleExternalRefs, type Doc, loadSpec } from "./spec.mjs";

export type { SchemasMode } from "./emitSchemas.mjs";
export type { ClientKind } from "./emitSdk.mjs";
export type { EnumsMode } from "./emitTypes.mjs";
export { SpecError } from "./spec.mjs";
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
  /**
   * Generate `schemas.gen.ts` with the component schemas as constants. `form`
   * leaves out descriptions and titles. Off when `false` or not set.
   */
  schemas?: SchemasMode | false;
  /**
   * Type `date` and `date-time` strings as `Date`, and turn them into `Date`
   * objects in successful responses.
   */
  useDateType?: boolean;
}

export interface GeneratedClient {
  files: GeneratedFile[];
  operations: OperationInfo[];
  /** Type names exported from `types.gen.ts`. */
  modelNames: string[];
  /** Function names exported from `sdk.gen.ts`. */
  serviceNames: string[];
  /** What the generator could not do as asked, to tell the user. */
  warnings: string[];
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
  emittedTypes: ReadonlySet<string>,
): OperationInfo {
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
    capitalizedMethodName: capitalizeFirst(operation.functionName),
    dataTypeName: operation.typeNames.data,
    errorTypeName: emittedTypes.has(operation.typeNames.error)
      ? operation.typeNames.error
      : undefined,
    httpMethod: method,
    jsDoc: operation.jsDoc,
    allParamsOptional: optionsAreOptional(operation),
    isPaginatable: pageParameter !== undefined,
    pageParamType: pageParameter
      ? renderSchema(pageParameter.schema, ctx)
      : undefined,
    pageParamTypeKind: pageParameter
      ? schemaPrimitiveKind(ctx.doc, pageParameter.schema)
      : undefined,
  };
}

/** Generate the TypeScript client (types, SDK, runtime) for a specification. */
export async function generateClient(
  options: ClientGenOptions,
): Promise<GeneratedClient> {
  const loaded = await loadSpec(options.input);
  const doc = await bundleExternalRefs(loaded);
  assertSupported(doc);

  const names = buildSchemaNames(doc);
  const writableNames = buildWritableNames(doc, names);
  const ctx: SchemaCtx = {
    doc,
    names,
    writableNames,
    dates: options.useDateType === true,
  };
  const operations = collectOperations(doc, {
    useOperationId: !options.noOperationId,
    reservedTypeNames: [...names.values(), ...writableNames.values()],
  });

  const ext = options.importExtension;
  const types = emitTypes(doc, operations, ctx, {
    enums: options.enums,
    clientKind: options.client,
  });

  const transformers = options.useDateType
    ? emitTransformers(operations, ctx)
    : undefined;
  const warnings: string[] = [];
  if (transformers && transformers.skipped.length > 0) {
    warnings.push(
      `--useDateType: the dates in these schemas stay strings in responses, because nothing tells the members of the union apart:\n${transformers.skipped
        .map((where) => `  - ${where}`)
        .join("\n")}`,
    );
  }

  const files: GeneratedFile[] = [
    { name: "types.gen.ts", content: types.content },
    {
      name: "sdk.gen.ts",
      content: emitSdk(doc, operations, {
        kind: options.client,
        ext,
        transformers: transformers?.byOperation,
      }),
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
  if (transformers?.content !== undefined) {
    files.push({ name: "transformers.gen.ts", content: transformers.content });
  }
  const schemas = options.schemas
    ? emitSchemas(ctx, options.schemas)
    : undefined;
  if (schemas !== undefined) {
    files.push({ name: "schemas.gen.ts", content: schemas });
  }

  const emittedTypes = new Set(types.exportedNames);
  return {
    files,
    operations: operations.map((operation) =>
      toOperationInfo(operation, ctx, options.pageParam, emittedTypes),
    ),
    modelNames: types.exportedNames,
    serviceNames: operations.map((operation) => operation.functionName),
    warnings,
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
