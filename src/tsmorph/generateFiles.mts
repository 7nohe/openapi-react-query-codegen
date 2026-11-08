import type {
  ImportDeclarationStructure,
  TypeAliasDeclarationStructure,
  VariableStatementStructure,
} from "ts-morph";
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
  createGenerationProject,
} from "./projectFactory.mjs";

type Statement = TypeAliasDeclarationStructure | VariableStatementStructure;

/**
 * Build one variable statement per operation, skipping the ones the builder
 * declines. A builder returns null when the operation is out of its scope —
 * every infinite-query builder returns null for non-paginatable operations,
 * which is how the paginatable subset gets selected.
 */
function collectStatements(
  operations: OperationInfo[],
  build: (op: OperationInfo) => VariableStatementStructure | null,
): VariableStatementStructure[] {
  const statements: VariableStatementStructure[] = [];
  for (const op of operations) {
    const statement = build(op);
    if (statement) {
      statements.push(statement);
    }
  }
  return statements;
}

/**
 * ts-morph separates statements of different kinds with a blank line when
 * they are added one at a time but not when they are added as a batch, so
 * restore the separator where the kind changes.
 */
function separateKinds(statements: Statement[]): Statement[] {
  return statements.map((statement, index) =>
    index > 0 && statements[index - 1].kind !== statement.kind
      ? { ...statement, leadingTrivia: `\n${statement.leadingTrivia ?? ""}` }
      : statement,
  );
}

const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/g;

/**
 * Create a generated file. Statements go in as one batch so ts-morph reparses
 * the file once, and only the model and service names the body actually
 * mentions are imported: importing thousands of unused names forced every
 * edit to rescan a huge import list and made the later import organising pass
 * slow on large specifications.
 */
function createFile(
  name: string,
  ctx: GenerationContext,
  buildImports: (ctx: GenerationContext) => ImportDeclarationStructure[],
  statements: Statement[],
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(`${name}.ts`, undefined, {
    overwrite: true,
  });
  sourceFile.addStatements(statements);
  const used = new Set(sourceFile.getFullText().match(IDENTIFIER_RE));
  sourceFile.insertImportDeclarations(
    0,
    buildImports({
      ...ctx,
      modelNames: ctx.modelNames.filter((model) => used.has(model)),
      serviceNames: ctx.serviceNames.filter((service) => used.has(service)),
    }),
  );
  return sourceFile.getFullText();
}

/**
 * Generate the index.ts file content.
 * The content is constant, so no ts-morph project is needed.
 */
function generateIndexFile(): string {
  return `export * from "./common";\nexport * from "./queries";\nexport * from "./queryOptions";\n`;
}

/**
 * Generate the common.ts file content.
 */
function generateCommonFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  // Group operations by HTTP method
  const getOperations = operations.filter((op) => op.httpMethod === "GET");
  const mutationOperations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );
  const statements: Statement[] = [];

  // Add query types and keys
  for (const op of getOperations) {
    statements.push(
      buildDefaultResponseType(op),
      buildQueryResultType(op),
      buildQueryKeyConst(op),
      buildQueryKeyFn(op),
    );
  }

  // Add dedicated infinite query types and keys for paginatable operations
  for (const op of getOperations.filter((o) => o.isPaginatable)) {
    statements.push(
      buildInfiniteClientOptionsType(op, ctx),
      buildInfiniteQueryKeyConst(op),
      buildInfiniteQueryKeyFn(op),
    );
  }

  // Add mutation types and keys
  for (const op of mutationOperations) {
    statements.push(
      buildMutationResultType(op),
      buildMutationKeyConst(op),
      buildMutationKeyFn(op),
    );
  }

  return createFile(
    OpenApiRqFiles.common,
    ctx,
    buildCommonFileImports,
    separateKinds(statements),
  );
}

/**
 * Generate the queries.ts file content.
 */
function generateQueriesFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const getOperations = operations.filter((op) => op.httpMethod === "GET");
  const mutationOperations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );

  return createFile(OpenApiRqFiles.queries, ctx, buildHookFileImports, [
    // useQuery hooks
    ...getOperations.map((op) => buildUseQueryHook(op, ctx)),
    // useMutation hooks
    ...mutationOperations.map((op) => buildUseMutationHook(op, ctx)),
  ]);
}

/**
 * Generate the queryOptions.ts file content.
 */
function generateQueryOptionsFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  // Only GET operations have query options
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  return createFile(
    OpenApiRqFiles.queryOptions,
    ctx,
    buildQueryOptionsFileImports,
    [
      ...getOperations.map((op) => buildQueryOptionsFn(op)),
      // infiniteQueryOptions factories
      ...collectStatements(getOperations, (op) =>
        buildInfiniteQueryOptionsFn(op, ctx),
      ),
    ],
  );
}

/**
 * Generate the suspense.ts file content.
 */
function generateSuspenseFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  // Only GET operations for suspense
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  return createFile(OpenApiRqFiles.suspense, ctx, buildHookFileImports, [
    // useSuspenseQuery hooks
    ...getOperations.map((op) => buildUseSuspenseQueryHook(op, ctx)),
    // useSuspenseInfiniteQuery hooks
    ...collectStatements(getOperations, (op) =>
      buildUseSuspenseInfiniteQueryHook(op, ctx),
    ),
  ]);
}

/**
 * Generate the infiniteQueries.ts file content.
 */
function generateInfiniteQueriesFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  // Only GET operations can be paginatable
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  return createFile(
    OpenApiRqFiles.infiniteQueries,
    ctx,
    buildHookFileImports,
    // useInfiniteQuery hooks
    collectStatements(getOperations, (op) =>
      buildUseInfiniteQueryHook(op, ctx),
    ),
  );
}

/**
 * Generate the prefetch.ts file content.
 */
function generatePrefetchFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  // Only GET operations for prefetch
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  return createFile(OpenApiRqFiles.prefetch, ctx, buildHookFileImports, [
    // prefetch functions
    ...getOperations.map((op) => buildPrefetchFn(op)),
    // prefetchInfiniteQuery functions
    ...collectStatements(getOperations, (op) =>
      buildPrefetchInfiniteQueryFn(op, ctx),
    ),
  ]);
}

/**
 * Generate the ensureQueryData.ts file content.
 */
function generateEnsureQueryDataFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  // Only GET operations for ensure
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  return createFile(
    OpenApiRqFiles.ensureQueryData,
    ctx,
    buildHookFileImports,
    getOperations.map((op) => buildEnsureQueryDataFn(op)),
  );
}

/**
 * Add the generated header comment to file content.
 */
function addHeaderComment(content: string, version: string): string {
  const comment = `// generated with @7nohe/openapi-react-query-codegen@${version} \n\n`;
  return comment + content;
}

/**
 * Generate all files using ts-morph.
 */
export function generateAllFiles(
  operations: OperationInfo[],
  ctx: GenerationContext,
): GeneratedFile[] {
  return [
    {
      name: `${OpenApiRqFiles.index}.ts`,
      content: addHeaderComment(generateIndexFile(), ctx.version),
    },
    {
      name: `${OpenApiRqFiles.common}.ts`,
      content: addHeaderComment(
        generateCommonFile(operations, ctx),
        ctx.version,
      ),
    },
    {
      name: `${OpenApiRqFiles.queries}.ts`,
      content: addHeaderComment(
        generateQueriesFile(operations, ctx),
        ctx.version,
      ),
    },
    {
      name: `${OpenApiRqFiles.queryOptions}.ts`,
      content: addHeaderComment(
        generateQueryOptionsFile(operations, ctx),
        ctx.version,
      ),
    },
    {
      name: `${OpenApiRqFiles.suspense}.ts`,
      content: addHeaderComment(
        generateSuspenseFile(operations, ctx),
        ctx.version,
      ),
    },
    {
      name: `${OpenApiRqFiles.infiniteQueries}.ts`,
      content: addHeaderComment(
        generateInfiniteQueriesFile(operations, ctx),
        ctx.version,
      ),
    },
    {
      name: `${OpenApiRqFiles.prefetch}.ts`,
      content: addHeaderComment(
        generatePrefetchFile(operations, ctx),
        ctx.version,
      ),
    },
    {
      name: `${OpenApiRqFiles.ensureQueryData}.ts`,
      content: addHeaderComment(
        generateEnsureQueryDataFile(operations, ctx),
        ctx.version,
      ),
    },
  ];
}
