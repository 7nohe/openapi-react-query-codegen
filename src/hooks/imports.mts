import type { GenerationContext } from "../types.mjs";

type NamedImport = { name: string; isTypeOnly?: boolean };

/** One import declaration of a generated file. */
export type ImportDeclaration = {
  moduleSpecifier: string;
  /** `import type { … }` */
  isTypeOnly?: boolean;
  /** `import * as Name` */
  namespaceImport?: string;
  namedImports?: NamedImport[];
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

/** What the builders use from TanStack Query. */
export const TANSTACK_IMPORTS: NamedImport[] = [
  { name: "useQuery" },
  { name: "useSuspenseQuery" },
  { name: "useInfiniteQuery" },
  { name: "useSuspenseInfiniteQuery" },
  { name: "useMutation" },
  { name: "queryOptions" },
  { name: "infiniteQueryOptions" },
  { name: "QueryClient", isTypeOnly: true },
  { name: "UseQueryResult", isTypeOnly: true },
  { name: "UseQueryOptions", isTypeOnly: true },
  { name: "UseInfiniteQueryOptions", isTypeOnly: true },
  { name: "UseSuspenseInfiniteQueryOptions", isTypeOnly: true },
  { name: "UseMutationOptions", isTypeOnly: true },
  { name: "UseSuspenseQueryOptions", isTypeOnly: true },
  { name: "InfiniteData", isTypeOnly: true },
  { name: "FetchQueryOptions", isTypeOnly: true },
  { name: "FetchInfiniteQueryOptions", isTypeOnly: true },
  { name: "GetNextPageParamFunction", isTypeOnly: true },
  { name: "EnsureQueryDataOptions", isTypeOnly: true },
];

/**
 * The imports of a generated file.
 *
 * `services` and `models` are what the file's statements declare. Everything
 * else is a fixed name the builders write themselves, kept when `mentioned`
 * holds it: the client generator reserves these names, so no model, service or
 * local of the generated code can be called the same.
 */
export function buildFileImports(
  ctx: Pick<GenerationContext, "importExtension">,
  {
    services,
    models,
    mentioned,
  }: { services: string[]; models: string[]; mentioned: ReadonlySet<string> },
): ImportDeclaration[] {
  const isMentioned = ({ name }: NamedImport) => mentioned.has(name);
  const declarations: ImportDeclaration[] = [
    {
      moduleSpecifier: "@tanstack/react-query",
      namedImports: TANSTACK_IMPORTS.filter(isMentioned),
    },
    {
      moduleSpecifier: "axios",
      namedImports: [{ name: "AxiosError" }].filter(isMentioned),
    },
    {
      // `Options` is the one sdk.gen re-exports: it adds `client` and `meta`
      // to the Options of the runtime, and the hooks accept both.
      moduleSpecifier: relativeModule("../requests/sdk.gen", ctx),
      namedImports: [
        ...[{ name: "Options", isTypeOnly: true }].filter(isMentioned),
        ...services.map((name) => ({ name })),
      ],
    },
    {
      // Type-only, so the output compiles under `verbatimModuleSyntax`.
      moduleSpecifier: relativeModule("../requests/types.gen", ctx),
      isTypeOnly: true,
      namedImports: models.map((name) => ({ name })),
    },
  ];
  if (mentioned.has("Common")) {
    declarations.push({
      moduleSpecifier: relativeModule("./common", ctx),
      namespaceImport: "Common",
    });
  }
  return declarations;
}

function compareCaseInsensitive(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  return lowerA < lowerB ? -1 : lowerA > lowerB ? 1 : 0;
}

function isRelative(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith(".");
}

function printImport(declaration: ImportDeclaration): string {
  const from = `from "${declaration.moduleSpecifier}";\n`;
  if (declaration.namespaceImport) {
    return `import * as ${declaration.namespaceImport} ${from}`;
  }
  const names = (declaration.namedImports ?? [])
    .toSorted((a, b) => compareCaseInsensitive(a.name, b.name))
    .map(({ name, isTypeOnly }) => (isTypeOnly ? `type ${name}` : name))
    .join(", ");
  return `import ${declaration.isTypeOnly ? "type " : ""}{ ${names} } ${from}`;
}

/**
 * Print an import block: packages before relative modules, and both the
 * modules and the names within a declaration in alphabetical order regardless
 * of case. A declaration without names is left out.
 */
export function printImports(declarations: ImportDeclaration[]): string {
  return declarations
    .filter(
      (declaration) =>
        declaration.namespaceImport || declaration.namedImports?.length,
    )
    .toSorted(
      (a, b) =>
        Number(isRelative(a.moduleSpecifier)) -
          Number(isRelative(b.moduleSpecifier)) ||
        compareCaseInsensitive(a.moduleSpecifier, b.moduleSpecifier),
    )
    .map(printImport)
    .join("");
}
