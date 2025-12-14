import {
  type ImportDeclarationStructure,
  IndentationText,
  NewLineKind,
  Project,
  QuoteKind,
  StructureKind,
} from "ts-morph";
import type { GenerationContext } from "../types.mjs";

/**
 * Create a shared ts-morph Project for code generation.
 * Uses consistent formatting settings to match existing output.
 */
export function createGenerationProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
    },
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      newLineKind: NewLineKind.LineFeed,
      quoteKind: QuoteKind.Double,
      useTrailingCommas: true,
    },
  });
}

/**
 * Build import structure for client library.
 */
export function buildClientImport(
  ctx: GenerationContext,
): ImportDeclarationStructure {
  const moduleSpecifier =
    ctx.client === "@hey-api/client-axios"
      ? "@hey-api/client-axios"
      : "@hey-api/client-fetch";

  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier,
    namedImports: [{ name: "Options", isTypeOnly: true }],
  };
}

/**
 * Build import structure for TanStack Query.
 */
export function buildQueryImport(): ImportDeclarationStructure {
  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "@tanstack/react-query",
    namedImports: [
      { name: "QueryClient", isTypeOnly: true },
      { name: "useQuery" },
      { name: "useSuspenseQuery" },
      { name: "useInfiniteQuery" },
      { name: "useMutation" },
      { name: "UseQueryResult" },
      { name: "UseQueryOptions" },
      { name: "UseInfiniteQueryOptions" },
      { name: "UseMutationOptions" },
      { name: "UseMutationResult" },
      { name: "UseSuspenseQueryOptions" },
      { name: "InfiniteData" },
    ],
  };
}

/**
 * Build import structure for services.
 */
export function buildServiceImport(
  ctx: GenerationContext,
): ImportDeclarationStructure {
  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "../requests/services.gen",
    namedImports: ctx.serviceNames.map((name) => ({ name })),
  };
}

/**
 * Build import structure for models.
 */
export function buildModelImport(
  ctx: GenerationContext,
): ImportDeclarationStructure | null {
  if (ctx.modelNames.length === 0) {
    return null;
  }

  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "../requests/types.gen",
    namedImports: ctx.modelNames.map((name) => ({ name })),
  };
}

/**
 * Build import structure for axios error type.
 */
export function buildAxiosErrorImport(): ImportDeclarationStructure {
  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "axios",
    namedImports: [{ name: "AxiosError" }],
  };
}

/**
 * Build import for Common namespace.
 */
export function buildCommonImport(): ImportDeclarationStructure {
  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "./common",
    namespaceImport: "Common",
  };
}

/**
 * Build all imports needed for the common file.
 */
export function buildCommonFileImports(
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
 * Build all imports needed for hook files (queries, suspense, infinite).
 */
export function buildHookFileImports(
  ctx: GenerationContext,
): ImportDeclarationStructure[] {
  return [buildCommonImport(), ...buildCommonFileImports(ctx)];
}
