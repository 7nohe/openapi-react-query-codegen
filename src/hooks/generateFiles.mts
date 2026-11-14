import { OpenApiRqFiles } from "../constants.mjs";
import type {
  GeneratedFile,
  GenerationContext,
  OperationInfo,
} from "../types.mjs";
import {
  buildDefaultResponseType,
  buildInfiniteClientOptionsType,
  buildInfiniteQueryKeyConst,
  buildInfiniteQueryKeyFn,
  buildKeyConst,
  buildMutationKeyFn,
  buildMutationResultType,
  buildQueryKeyFn,
  buildQueryResultType,
} from "./buildCommon.mjs";
import { buildUseMutationHook } from "./buildMutationHooks.mjs";
import {
  buildEnsureQueryDataFn,
  buildPrefetchFn,
  buildPrefetchInfiniteQueryFn,
  buildUseInfiniteQueryHook,
  buildUseQueryHook,
  buildUseSuspenseInfiniteQueryHook,
  buildUseSuspenseQueryHook,
} from "./buildQueryHooks.mjs";
import {
  buildInfiniteQueryOptionsFn,
  buildQueryOptionsFn,
} from "./buildQueryOptions.mjs";
import {
  type Declared,
  type HookOperation,
  settleHookNames,
} from "./hookNames.mjs";
import { buildFileImports, printImports, relativeModule } from "./imports.mjs";
import {
  printStatements,
  referencedNames,
  type Statement,
  statementCode,
} from "./statement.mjs";

/** The distinct values of a list, in order of first appearance. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * The content of a generated file: the imports its statements need, then the
 * statements.
 */
function createFile(ctx: GenerationContext, statements: Statement[]): string {
  if (statements.length === 0) {
    // Nothing to export. The bare import keeps the file a module.
    return `import "${relativeModule("../requests/sdk.gen", ctx)}";\n`;
  }
  const imports = buildFileImports(ctx, {
    services: unique(
      statements.flatMap((statement) => statement.service ?? []),
    ),
    models: unique(statements.flatMap((statement) => statement.models ?? [])),
    mentioned: referencedNames(statements.map(statementCode).join("\n")),
  });
  return `${printImports(imports)}\n${printStatements(statements)}`;
}

/**
 * The content of index.ts.
 */
function indexFile(ctx: GenerationContext): string {
  return [
    OpenApiRqFiles.common,
    OpenApiRqFiles.queries,
    OpenApiRqFiles.queryOptions,
  ]
    .map((name) => `export * from "${relativeModule(`./${name}`, ctx)}";\n`)
    .join("");
}

/** A builder of one statement for an operation. */
type Builder = (op: HookOperation, ctx: GenerationContext) => Statement;

/**
 * The statements of every file but `index.ts`, in the order they are printed:
 * for each operation of a kind, what each builder makes of it.
 */
function buildFiles(
  operations: HookOperation[],
  ctx: GenerationContext,
): Array<[name: string, declared: Declared[]]> {
  const queries = operations.filter((op) => op.httpMethod === "GET");
  const mutations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );
  // The infinite variants: their own types and keys in `common.ts`.
  const paginated = queries.filter((op) => op.isPaginatable);
  const each = (ops: HookOperation[], ...builders: Builder[]): Declared[] =>
    ops.flatMap((op) =>
      builders.map((build) => ({ op, statement: build(op, ctx) })),
    );

  return [
    [
      OpenApiRqFiles.common,
      [
        ...each(
          queries,
          buildDefaultResponseType,
          buildQueryResultType,
          buildKeyConst,
          buildQueryKeyFn,
        ),
        ...each(
          paginated,
          buildInfiniteClientOptionsType,
          buildInfiniteQueryKeyConst,
          buildInfiniteQueryKeyFn,
        ),
        ...each(
          mutations,
          buildMutationResultType,
          buildKeyConst,
          buildMutationKeyFn,
        ),
      ],
    ],
    [
      OpenApiRqFiles.queries,
      [
        ...each(queries, buildUseQueryHook),
        ...each(mutations, buildUseMutationHook),
      ],
    ],
    [
      OpenApiRqFiles.queryOptions,
      [
        ...each(queries, buildQueryOptionsFn),
        ...each(paginated, buildInfiniteQueryOptionsFn),
      ],
    ],
    [
      OpenApiRqFiles.suspense,
      [
        ...each(queries, buildUseSuspenseQueryHook),
        ...each(paginated, buildUseSuspenseInfiniteQueryHook),
      ],
    ],
    [
      OpenApiRqFiles.infiniteQueries,
      each(paginated, buildUseInfiniteQueryHook),
    ],
    [
      OpenApiRqFiles.prefetch,
      [
        ...each(queries, buildPrefetchFn),
        ...each(paginated, buildPrefetchInfiniteQueryFn),
      ],
    ],
    [OpenApiRqFiles.ensureQueryData, each(queries, buildEnsureQueryDataFn)],
  ];
}

/**
 * Add the generated header comment to file content.
 */
function addHeaderComment(content: string, version: string): string {
  const comment = `// generated with @7nohe/openapi-react-query-codegen@${version} \n\n`;
  return comment + content;
}

/**
 * Generate the React Query files for the operations of a specification.
 */
export function generateAllFiles(
  operations: OperationInfo[],
  ctx: GenerationContext,
): GeneratedFile[] {
  let files = buildFiles(operations, ctx);
  // Built again only when a name the hooks derive is already taken.
  const names = settleHookNames(files);
  if (names) {
    files = buildFiles(
      operations.map((op) => ({ ...op, names: names.get(op) })),
      ctx,
    );
  }

  return [
    {
      name: `${OpenApiRqFiles.index}.ts`,
      content: addHeaderComment(indexFile(ctx), ctx.version),
    },
    ...files.map(([name, declared]) => ({
      name: `${name}.ts`,
      content: addHeaderComment(
        createFile(
          ctx,
          declared.map(({ statement }) => statement),
        ),
        ctx.version,
      ),
    })),
  ];
}
