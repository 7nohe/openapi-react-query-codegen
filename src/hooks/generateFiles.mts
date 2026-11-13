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
  buildMutationKeyConst,
  buildMutationKeyFn,
  buildMutationResultType,
  buildQueryKeyConst,
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
  buildCommonFileImports,
  buildHookFileImports,
  buildQueryOptionsFileImports,
  type ImportDeclaration,
  printImports,
  relativeModule,
} from "./imports.mjs";
import {
  type ConstStatement,
  printStatements,
  referencedNames,
  type Statement,
  statementCode,
} from "./statement.mjs";

/**
 * Build one variable statement per operation, skipping the ones the builder
 * declines. A builder returns null when the operation is out of its scope —
 * every infinite-query builder returns null for non-paginatable operations,
 * which is how the paginatable subset gets selected.
 */
function collectStatements(
  operations: OperationInfo[],
  build: (op: OperationInfo) => ConstStatement | null,
): ConstStatement[] {
  const statements: ConstStatement[] = [];
  for (const op of operations) {
    const statement = build(op);
    if (statement) {
      statements.push(statement);
    }
  }
  return statements;
}

/**
 * The content of a generated file: the imports its statements need, then the
 * statements. Only the services of the operations the file covers and the
 * models its code mentions are imported.
 */
function createFile(
  ctx: GenerationContext,
  buildImports: (ctx: GenerationContext) => ImportDeclaration[],
  operations: OperationInfo[],
  statements: Statement[],
): string {
  if (statements.length === 0) {
    // Nothing to export. The bare import keeps the file a module.
    return `import "${relativeModule("../requests/sdk.gen", ctx)}";\n`;
  }
  const used = referencedNames(statements.map(statementCode).join("\n"));
  const imports = buildImports({
    ...ctx,
    modelNames: ctx.modelNames.filter((model) => used.has(model)),
    serviceNames: operations.map((op) => op.methodName),
  });
  return `${printImports(imports, used)}\n${printStatements(statements)}`;
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

function commonStatements(
  queries: OperationInfo[],
  mutations: OperationInfo[],
  ctx: GenerationContext,
): Statement[] {
  const statements: Statement[] = [];
  for (const op of queries) {
    statements.push(
      buildDefaultResponseType(op),
      buildQueryResultType(op),
      buildQueryKeyConst(op),
      buildQueryKeyFn(op),
    );
  }
  // Dedicated infinite query types and keys for paginatable operations
  for (const op of queries.filter((query) => query.isPaginatable)) {
    statements.push(
      buildInfiniteClientOptionsType(op, ctx),
      buildInfiniteQueryKeyConst(op),
      buildInfiniteQueryKeyFn(op),
    );
  }
  for (const op of mutations) {
    statements.push(
      buildMutationResultType(op),
      buildMutationKeyConst(op),
      buildMutationKeyFn(op),
    );
  }
  return statements;
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
  const queries = operations.filter((op) => op.httpMethod === "GET");
  const mutations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );

  const paginated = queries.filter((op) => op.isPaginatable);
  const all = [...queries, ...mutations];

  const files: Array<
    [
      name: string,
      imports: (ctx: GenerationContext) => ImportDeclaration[],
      operations: OperationInfo[],
      statements: Statement[],
    ]
  > = [
    [
      OpenApiRqFiles.common,
      buildCommonFileImports,
      all,
      commonStatements(queries, mutations, ctx),
    ],
    [
      OpenApiRqFiles.queries,
      buildHookFileImports,
      all,
      [
        ...queries.map((op) => buildUseQueryHook(op, ctx)),
        ...mutations.map((op) => buildUseMutationHook(op, ctx)),
      ],
    ],
    [
      OpenApiRqFiles.queryOptions,
      buildQueryOptionsFileImports,
      queries,
      [
        ...queries.map((op) => buildQueryOptionsFn(op)),
        ...collectStatements(queries, (op) =>
          buildInfiniteQueryOptionsFn(op, ctx),
        ),
      ],
    ],
    [
      OpenApiRqFiles.suspense,
      buildHookFileImports,
      queries,
      [
        ...queries.map((op) => buildUseSuspenseQueryHook(op, ctx)),
        ...collectStatements(queries, (op) =>
          buildUseSuspenseInfiniteQueryHook(op, ctx),
        ),
      ],
    ],
    [
      OpenApiRqFiles.infiniteQueries,
      buildHookFileImports,
      paginated,
      collectStatements(queries, (op) => buildUseInfiniteQueryHook(op, ctx)),
    ],
    [
      OpenApiRqFiles.prefetch,
      buildHookFileImports,
      queries,
      [
        ...queries.map((op) => buildPrefetchFn(op)),
        ...collectStatements(queries, (op) =>
          buildPrefetchInfiniteQueryFn(op, ctx),
        ),
      ],
    ],
    [
      OpenApiRqFiles.ensureQueryData,
      buildHookFileImports,
      queries,
      queries.map((op) => buildEnsureQueryDataFn(op)),
    ],
  ];

  return [
    {
      name: `${OpenApiRqFiles.index}.ts`,
      content: addHeaderComment(indexFile(ctx), ctx.version),
    },
    ...files.map(([name, imports, operations, statements]) => ({
      name: `${name}.ts`,
      content: addHeaderComment(
        createFile(ctx, imports, operations, statements),
        ctx.version,
      ),
    })),
  ];
}
