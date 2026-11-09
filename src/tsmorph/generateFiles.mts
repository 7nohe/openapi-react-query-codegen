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

const IDENTIFIER_RE = /[\p{ID_Start}_$][\p{ID_Continue}$]*/gu;

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
 * The constant content of index.ts, which needs no ts-morph project.
 */
const INDEX_FILE = `export * from "./common";\nexport * from "./queries";\nexport * from "./queryOptions";\n`;

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
  return separateKinds(statements);
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
  const queries = operations.filter((op) => op.httpMethod === "GET");
  const mutations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );

  const files: Array<
    [
      name: string,
      imports: (ctx: GenerationContext) => ImportDeclarationStructure[],
      statements: Statement[],
    ]
  > = [
    [
      OpenApiRqFiles.common,
      buildCommonFileImports,
      commonStatements(queries, mutations, ctx),
    ],
    [
      OpenApiRqFiles.queries,
      buildHookFileImports,
      [
        ...queries.map((op) => buildUseQueryHook(op, ctx)),
        ...mutations.map((op) => buildUseMutationHook(op, ctx)),
      ],
    ],
    [
      OpenApiRqFiles.queryOptions,
      buildQueryOptionsFileImports,
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
      collectStatements(queries, (op) => buildUseInfiniteQueryHook(op, ctx)),
    ],
    [
      OpenApiRqFiles.prefetch,
      buildHookFileImports,
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
      queries.map((op) => buildEnsureQueryDataFn(op)),
    ],
  ];

  return [
    {
      name: `${OpenApiRqFiles.index}.ts`,
      content: addHeaderComment(INDEX_FILE, ctx.version),
    },
    ...files.map(([name, imports, statements]) => ({
      name: `${name}.ts`,
      content: addHeaderComment(
        createFile(name, ctx, imports, statements),
        ctx.version,
      ),
    })),
  ];
}
