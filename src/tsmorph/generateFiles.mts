import {
  type ExportDeclarationStructure,
  type ImportDeclarationStructure,
  Project,
  StructureKind,
  type TypeAliasDeclarationStructure,
  type VariableStatementStructure,
} from "ts-morph";
import { OpenApiRqFiles } from "../constants.mjs";
import type {
  GeneratedFile,
  GenerationContext,
  OperationInfo,
} from "../types.mjs";
import {
  buildDefaultResponseType,
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
  buildUseInfiniteQueryHook,
  buildUseQueryHook,
  buildUseSuspenseQueryHook,
} from "./buildQueryHooks.mjs";
import { buildLoaderFactory, buildWithQueryPrefetch } from "./buildRouter.mjs";
import {
  buildAxiosErrorImport,
  buildClientImport,
  buildCommonImport,
  buildModelImport,
  buildQueryImport,
  buildServiceImport,
  createGenerationProject,
} from "./projectFactory.mjs";

/**
 * Build imports for common.ts file.
 */
function buildCommonFileImports(
  ctx: GenerationContext,
): ImportDeclarationStructure[] {
  const imports: ImportDeclarationStructure[] = [
    buildClientImport(ctx),
    buildQueryImport(),
    buildServiceImport(ctx),
  ];

  const modelImport = buildModelImport(ctx);
  if (modelImport) {
    imports.push(modelImport);
  }

  if (ctx.client === "@hey-api/client-axios") {
    imports.push(buildAxiosErrorImport());
  }

  return imports;
}

/**
 * Build imports for hook files (queries, suspense, infinite, prefetch, ensure).
 */
function buildHookFileImports(
  ctx: GenerationContext,
): ImportDeclarationStructure[] {
  return [buildCommonImport(), ...buildCommonFileImports(ctx)];
}

/**
 * Generate the index.ts file content.
 */
function generateIndexFile(ctx: GenerationContext): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.index}.ts`,
    undefined,
    { overwrite: true },
  );

  const exports: ExportDeclarationStructure[] = [
    {
      kind: StructureKind.ExportDeclaration,
      moduleSpecifier: "./common",
    },
    {
      kind: StructureKind.ExportDeclaration,
      moduleSpecifier: "./queries",
    },
  ];

  sourceFile.addExportDeclarations(exports);

  return sourceFile.getFullText();
}

/**
 * Generate the common.ts file content.
 */
function generateCommonFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.common}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildCommonFileImports(ctx));

  // Group operations by HTTP method
  const getOperations = operations.filter((op) => op.httpMethod === "GET");
  const mutationOperations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );

  // Add query types and keys
  for (const op of getOperations) {
    sourceFile.addTypeAlias(buildDefaultResponseType(op));
    sourceFile.addTypeAlias(buildQueryResultType(op));
    sourceFile.addVariableStatement(buildQueryKeyConst(op));
    sourceFile.addVariableStatement(buildQueryKeyFn(op, ctx));
  }

  // Add mutation types and keys
  for (const op of mutationOperations) {
    sourceFile.addTypeAlias(buildMutationResultType(op));
    sourceFile.addVariableStatement(buildMutationKeyConst(op));
    sourceFile.addVariableStatement(buildMutationKeyFn(op));
  }

  return sourceFile.getFullText();
}

/**
 * Generate the queries.ts file content.
 */
function generateQueriesFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.queries}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildHookFileImports(ctx));

  // Group operations
  const getOperations = operations.filter((op) => op.httpMethod === "GET");
  const mutationOperations = operations.filter((op) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(op.httpMethod),
  );

  // Add useQuery hooks
  for (const op of getOperations) {
    sourceFile.addVariableStatement(buildUseQueryHook(op, ctx));
  }

  // Add useMutation hooks
  for (const op of mutationOperations) {
    sourceFile.addVariableStatement(buildUseMutationHook(op, ctx));
  }

  return sourceFile.getFullText();
}

/**
 * Generate the suspense.ts file content.
 */
function generateSuspenseFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.suspense}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildHookFileImports(ctx));

  // Only GET operations for suspense
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  // Add useSuspenseQuery hooks
  for (const op of getOperations) {
    sourceFile.addVariableStatement(buildUseSuspenseQueryHook(op, ctx));
  }

  return sourceFile.getFullText();
}

/**
 * Generate the infiniteQueries.ts file content.
 */
function generateInfiniteQueriesFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.infiniteQueries}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildHookFileImports(ctx));

  // Only paginatable GET operations
  const paginatableOperations = operations.filter(
    (op) => op.httpMethod === "GET" && op.isPaginatable,
  );

  // Add useInfiniteQuery hooks
  for (const op of paginatableOperations) {
    const hook = buildUseInfiniteQueryHook(op, ctx);
    if (hook) {
      sourceFile.addVariableStatement(hook);
    }
  }

  return sourceFile.getFullText();
}

/**
 * Generate the prefetch.ts file content.
 */
function generatePrefetchFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.prefetch}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildHookFileImports(ctx));

  // Only GET operations for prefetch
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  // Add prefetch functions
  for (const op of getOperations) {
    sourceFile.addVariableStatement(buildPrefetchFn(op, ctx));
  }

  return sourceFile.getFullText();
}

/**
 * Generate the ensureQueryData.ts file content.
 */
function generateEnsureQueryDataFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.ensureQueryData}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildHookFileImports(ctx));

  // Only GET operations for ensure
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  // Add ensureQueryData functions
  for (const op of getOperations) {
    sourceFile.addVariableStatement(buildEnsureQueryDataFn(op, ctx));
  }

  return sourceFile.getFullText();
}

/**
 * Build imports for router.ts file.
 */
function buildRouterFileImports(
  operations: OperationInfo[],
  ctx: GenerationContext,
): ImportDeclarationStructure[] {
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  // Get Data type names needed for GET operations
  const dataTypeNames = getOperations
    .map((op) => `${op.capitalizedMethodName}Data`)
    .filter((name) => ctx.modelNames.includes(name));

  // Get ensure function names
  const ensureFnNames = getOperations.map(
    (op) => `ensureUse${op.capitalizedMethodName}Data`,
  );

  const imports: ImportDeclarationStructure[] = [
    // Options import from client
    buildClientImport(ctx),
    // QueryClient import
    {
      kind: StructureKind.ImportDeclaration,
      moduleSpecifier: "@tanstack/react-query",
      namedImports: [{ name: "QueryClient", isTypeOnly: true }],
    },
  ];

  // Add Data types import if needed
  if (dataTypeNames.length > 0) {
    imports.push({
      kind: StructureKind.ImportDeclaration,
      moduleSpecifier: "../requests/types.gen",
      namedImports: dataTypeNames.map((name) => ({ name })),
    });
  }

  // Add ensureQueryData imports
  if (ensureFnNames.length > 0) {
    imports.push({
      kind: StructureKind.ImportDeclaration,
      moduleSpecifier: "./ensureQueryData",
      namedImports: ensureFnNames.map((name) => ({ name })),
    });
  }

  return imports;
}

/**
 * Generate the router.ts file content.
 */
function generateRouterFile(
  operations: OperationInfo[],
  ctx: GenerationContext,
): string {
  const project = createGenerationProject();
  const sourceFile = project.createSourceFile(
    `${OpenApiRqFiles.router}.ts`,
    undefined,
    { overwrite: true },
  );

  // Add imports
  sourceFile.addImportDeclarations(buildRouterFileImports(operations, ctx));

  // Add withQueryPrefetch helper
  sourceFile.addVariableStatement(buildWithQueryPrefetch());

  // Only GET operations for loader factories
  const getOperations = operations.filter((op) => op.httpMethod === "GET");

  // Add loader factories
  for (const op of getOperations) {
    sourceFile.addVariableStatement(buildLoaderFactory(op, ctx));
  }

  return sourceFile.getFullText();
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
      content: addHeaderComment(generateIndexFile(ctx), ctx.version),
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
    {
      name: `${OpenApiRqFiles.router}.ts`,
      content: addHeaderComment(
        generateRouterFile(operations, ctx),
        ctx.version,
      ),
    },
  ];
}
