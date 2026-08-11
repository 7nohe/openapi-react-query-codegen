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
 * Build import structure for the Options type.
 * sdk.gen re-exports Options extended with `client` and `meta`, which the
 * base client Options lacks; hooks must accept those properties.
 */
export function buildClientImport(
  _ctx: GenerationContext,
): ImportDeclarationStructure {
  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "../requests/sdk.gen",
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
      { name: "useSuspenseInfiniteQuery" },
      { name: "useMutation" },
      { name: "UseQueryResult", isTypeOnly: true },
      { name: "UseQueryOptions", isTypeOnly: true },
      { name: "UseInfiniteQueryOptions", isTypeOnly: true },
      { name: "UseSuspenseInfiniteQueryOptions", isTypeOnly: true },
      { name: "UseMutationOptions", isTypeOnly: true },
      { name: "UseMutationResult", isTypeOnly: true },
      { name: "UseSuspenseQueryOptions", isTypeOnly: true },
      { name: "InfiniteData", isTypeOnly: true },
      { name: "FetchQueryOptions", isTypeOnly: true },
      { name: "FetchInfiniteQueryOptions", isTypeOnly: true },
      { name: "EnsureQueryDataOptions", isTypeOnly: true },
    ],
  };
}

/**
 * Build import structure for the queryOptions/infiniteQueryOptions helpers.
 */
export function buildQueryOptionsImport(): ImportDeclarationStructure {
  return {
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "@tanstack/react-query",
    namedImports: [{ name: "queryOptions" }, { name: "infiniteQueryOptions" }],
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
    moduleSpecifier: "../requests/sdk.gen",
    namedImports: ctx.serviceNames.map((name) => ({ name })),
  };
}

/**
 * Build import structure for models.
 * Emitted as a type-only import so generated code compiles under
 * `verbatimModuleSyntax` (enabled by default in recent Vite templates).
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
    isTypeOnly: true,
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
