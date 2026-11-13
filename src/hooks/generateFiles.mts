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

function commonStatements(
  queries: OperationInfo[],
  paginated: OperationInfo[],
  mutations: OperationInfo[],
  ctx: GenerationContext,
): Statement[] {
  const statements: Statement[] = [];
  for (const op of queries) {
    statements.push(
      buildDefaultResponseType(op),
      buildQueryResultType(op),
      buildKeyConst(op),
      buildQueryKeyFn(op),
    );
  }
  // Dedicated infinite query types and keys for paginatable operations
  for (const op of paginated) {
    statements.push(
      buildInfiniteClientOptionsType(op, ctx),
      buildInfiniteQueryKeyConst(op),
      buildInfiniteQueryKeyFn(op),
    );
  }
  for (const op of mutations) {
    statements.push(
      buildMutationResultType(op),
      buildKeyConst(op),
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

  const files: Array<[name: string, statements: Statement[]]> = [
    [
      OpenApiRqFiles.common,
      commonStatements(queries, paginated, mutations, ctx),
    ],
    [
      OpenApiRqFiles.queries,
      [
        ...queries.map((op) => buildUseQueryHook(op, ctx)),
        ...mutations.map((op) => buildUseMutationHook(op, ctx)),
      ],
    ],
    [
      OpenApiRqFiles.queryOptions,
      [
        ...queries.map((op) => buildQueryOptionsFn(op)),
        ...paginated.map((op) => buildInfiniteQueryOptionsFn(op, ctx)),
      ],
    ],
    [
      OpenApiRqFiles.suspense,
      [
        ...queries.map((op) => buildUseSuspenseQueryHook(op, ctx)),
        ...paginated.map((op) => buildUseSuspenseInfiniteQueryHook(op, ctx)),
      ],
    ],
    [
      OpenApiRqFiles.infiniteQueries,
      paginated.map((op) => buildUseInfiniteQueryHook(op, ctx)),
    ],
    [
      OpenApiRqFiles.prefetch,
      [
        ...queries.map((op) => buildPrefetchFn(op)),
        ...paginated.map((op) => buildPrefetchInfiniteQueryFn(op, ctx)),
      ],
    ],
    [
      OpenApiRqFiles.ensureQueryData,
      queries.map((op) => buildEnsureQueryDataFn(op)),
    ],
  ];

  return [
    {
      name: `${OpenApiRqFiles.index}.ts`,
      content: addHeaderComment(indexFile(ctx), ctx.version),
    },
    ...files.map(([name, statements]) => ({
      name: `${name}.ts`,
      content: addHeaderComment(createFile(ctx, statements), ctx.version),
    })),
  ];
}
