import type { GenerationContext } from "../types.mjs";

/** One import declaration of a generated file, before unused names are dropped. */
export type ImportDeclaration = {
  moduleSpecifier: string;
  /** `import type { … }` */
  isTypeOnly?: boolean;
  /** `import * as Name` */
  namespaceImport?: string;
  namedImports?: Array<{ name: string; isTypeOnly?: boolean }>;
};

/**
 * A relative module specifier, with the extension the consuming project's
 * module resolution asks for.
 */
export function relativeModule(
  path: string,
  ctx?: Pick<GenerationContext, "importExtension">,
): string {
  return `${path}${ctx?.importExtension ?? ""}`;
}

/**
 * Build import structure for the Options type.
 * sdk.gen re-exports Options extended with `client` and `meta`, which the
 * base client Options lacks; hooks must accept those properties.
 */
export function buildClientImport(ctx: GenerationContext): ImportDeclaration {
  return {
    moduleSpecifier: relativeModule("../requests/sdk.gen", ctx),
    namedImports: [{ name: "Options", isTypeOnly: true }],
  };
}

/**
 * Build import structure for TanStack Query.
 */
export function buildQueryImport(): ImportDeclaration {
  return {
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
      { name: "GetNextPageParamFunction", isTypeOnly: true },
      { name: "EnsureQueryDataOptions", isTypeOnly: true },
    ],
  };
}

/**
 * Build import structure for the queryOptions/infiniteQueryOptions helpers.
 */
export function buildQueryOptionsImport(): ImportDeclaration {
  return {
    moduleSpecifier: "@tanstack/react-query",
    namedImports: [
      { name: "queryOptions" },
      { name: "infiniteQueryOptions" },
      { name: "UseInfiniteQueryOptions", isTypeOnly: true },
    ],
  };
}

/**
 * Build import structure for services.
 */
export function buildServiceImport(ctx: GenerationContext): ImportDeclaration {
  return {
    moduleSpecifier: relativeModule("../requests/sdk.gen", ctx),
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
): ImportDeclaration | null {
  if (ctx.modelNames.length === 0) {
    return null;
  }

  return {
    moduleSpecifier: relativeModule("../requests/types.gen", ctx),
    isTypeOnly: true,
    namedImports: ctx.modelNames.map((name) => ({ name })),
  };
}

/**
 * Build import structure for axios error type.
 */
export function buildAxiosErrorImport(): ImportDeclaration {
  return {
    moduleSpecifier: "axios",
    namedImports: [{ name: "AxiosError" }],
  };
}

/**
 * Build import for Common namespace.
 */
export function buildCommonImport(
  ctx?: Pick<GenerationContext, "importExtension">,
): ImportDeclaration {
  return {
    moduleSpecifier: relativeModule("./common", ctx),
    namespaceImport: "Common",
  };
}

/**
 * Build all imports needed for the common file.
 */
export function buildCommonFileImports(
  ctx: GenerationContext,
): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [
    buildClientImport(ctx),
    buildQueryImport(),
    buildServiceImport(ctx),
  ];

  const modelImport = buildModelImport(ctx);
  if (modelImport) {
    imports.push(modelImport);
  }

  if (ctx.client === "axios") {
    imports.push(buildAxiosErrorImport());
  }

  return imports;
}

/**
 * Build all imports needed for hook files (queries, suspense, infinite).
 */
export function buildHookFileImports(
  ctx: GenerationContext,
): ImportDeclaration[] {
  return [buildCommonImport(ctx), ...buildCommonFileImports(ctx)];
}

/**
 * Build all imports needed for the queryOptions file.
 * Narrower than the hook file imports: queryOptions only needs the
 * queryOptions/infiniteQueryOptions helpers, not the TanStack hooks.
 */
export function buildQueryOptionsFileImports(
  ctx: GenerationContext,
): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [
    buildCommonImport(ctx),
    buildQueryOptionsImport(),
    buildClientImport(ctx),
    buildServiceImport(ctx),
  ];

  const modelImport = buildModelImport(ctx);
  if (modelImport) {
    imports.push(modelImport);
  }

  return imports;
}

function compareCaseInsensitive(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  return lowerA < lowerB ? -1 : lowerA > lowerB ? 1 : 0;
}

function isRelative(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith(".");
}

type NamedImport = NonNullable<ImportDeclaration["namedImports"]>[number];

function printImport(
  declaration: ImportDeclaration,
  names: NamedImport[],
): string {
  const from = `from "${declaration.moduleSpecifier}";\n`;
  if (declaration.namespaceImport) {
    return `import * as ${declaration.namespaceImport} ${from}`;
  }
  const list = names
    .sort((a, b) => compareCaseInsensitive(a.name, b.name))
    .map(({ name, isTypeOnly }) => (isTypeOnly ? `type ${name}` : name))
    .join(", ");
  return `import ${declaration.isTypeOnly ? "type " : ""}{ ${list} } ${from}`;
}

/**
 * Print the import block of a generated file: only the names in `used`, one
 * declaration per module and kind, packages before relative modules, and both
 * the modules and the names within a declaration in alphabetical order
 * regardless of case. A declaration left without names is dropped.
 */
export function printImports(
  declarations: ImportDeclaration[],
  used: ReadonlySet<string>,
): string {
  const merged = new Map<
    string,
    { declaration: ImportDeclaration; names: Map<string, NamedImport> }
  >();
  for (const declaration of declarations) {
    const key = [
      declaration.moduleSpecifier,
      declaration.namespaceImport ?? "",
      declaration.isTypeOnly ? "type" : "",
    ].join("|");
    let target = merged.get(key);
    if (!target) {
      target = { declaration, names: new Map() };
      merged.set(key, target);
    }
    for (const named of declaration.namedImports ?? []) {
      if (used.has(named.name)) {
        target.names.set(named.name, named);
      }
    }
  }

  return [...merged.values()]
    .filter(({ declaration, names }) =>
      declaration.namespaceImport
        ? used.has(declaration.namespaceImport)
        : names.size > 0,
    )
    .sort(
      (a, b) =>
        Number(isRelative(a.declaration.moduleSpecifier)) -
          Number(isRelative(b.declaration.moduleSpecifier)) ||
        compareCaseInsensitive(
          a.declaration.moduleSpecifier,
          b.declaration.moduleSpecifier,
        ),
    )
    .map(({ declaration, names }) =>
      printImport(declaration, [...names.values()]),
    )
    .join("");
}
