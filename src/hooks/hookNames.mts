import { uniqueName } from "../client/naming.mjs";
import { OpenApiRqFiles } from "../constants.mjs";
import type { OperationInfo } from "../types.mjs";
import { FIXED_IMPORT_NAMES } from "./imports.mjs";
import type { Statement } from "./statement.mjs";

/** What the hook files declare for one operation, each under its name. */
export interface HookNames {
  /** `FindPetsDefaultResponse` */
  defaultResponse: string;
  /** `FindPetsQueryResult` */
  queryResult: string;
  /** `AddPetMutationResult` */
  mutationResult: string;
  /** `useFindPetsKey` */
  key: string;
  /** `UseFindPetsKeyFn` */
  keyFn: string;
  /** `FindPetsInfiniteClientOptions` */
  infiniteClientOptions: string;
  /** `useFindPetsInfiniteKey` */
  infiniteKey: string;
  /** `UseFindPetsInfiniteKeyFn` */
  infiniteKeyFn: string;
  /** `useFindPets`, for a query and for a mutation */
  hook: string;
  /** `useFindPetsSuspense` */
  suspenseHook: string;
  /** `useFindPetsInfinite` */
  infiniteHook: string;
  /** `useFindPetsSuspenseInfinite` */
  suspenseInfiniteHook: string;
  /** `findPetsOptions` */
  options: string;
  /** `findPetsInfiniteOptions` */
  infiniteOptions: string;
  /** `prefetchUseFindPets` */
  prefetch: string;
  /** `prefetchUseFindPetsInfinite` */
  prefetchInfinite: string;
  /** `ensureUseFindPetsData` */
  ensureData: string;
}

/**
 * An operation as the builders take it. `names` is set only when one of the
 * names had to give way to something else in its file.
 */
export type HookOperation = OperationInfo & { names?: HookNames };

/** The names as they are spelled from the name of the operation. */
function defaultHookNames(op: OperationInfo): HookNames {
  const name = op.methodName;
  const Name = op.capitalizedMethodName;
  return {
    defaultResponse: `${Name}DefaultResponse`,
    queryResult: `${Name}QueryResult`,
    mutationResult: `${Name}MutationResult`,
    key: `use${Name}Key`,
    keyFn: `Use${Name}KeyFn`,
    infiniteClientOptions: `${Name}InfiniteClientOptions`,
    infiniteKey: `use${Name}InfiniteKey`,
    infiniteKeyFn: `Use${Name}InfiniteKeyFn`,
    hook: `use${Name}`,
    suspenseHook: `use${Name}Suspense`,
    infiniteHook: `use${Name}Infinite`,
    suspenseInfiniteHook: `use${Name}SuspenseInfinite`,
    options: `${name}Options`,
    infiniteOptions: `${name}InfiniteOptions`,
    prefetch: `prefetchUse${Name}`,
    prefetchInfinite: `prefetchUse${Name}Infinite`,
    ensureData: `ensureUse${Name}Data`,
  };
}

/** The names the hook files declare for an operation. */
export function hookNames(op: HookOperation): HookNames {
  return op.names ?? defaultHookNames(op);
}

/** A statement of a generated file, and the operation it was built for. */
export type Declared = { op: HookOperation; statement: Statement };

/** The files `index.ts` re-exports, which therefore share their names. */
const INDEX_FILES: readonly string[] = [
  OpenApiRqFiles.common,
  OpenApiRqFiles.queries,
  OpenApiRqFiles.queryOptions,
];

/**
 * Find the names that cannot stay as they are spelled, given the files built
 * with those names, and give each a number.
 *
 * A name has to differ from what its file imports (an SDK function, a model, a
 * fixed name such as `useQuery`) and from the other names declared in the
 * file, or in any file `index.ts` re-exports next to it. The specification's
 * names always stay: `getUserOptions` is the operation of that name, and the
 * options of `getUser` become `getUserOptions2`. Between two derived names the
 * later one gives way, and `common.ts` comes last, so that a hook keeps its
 * name before a key does (`useGetApiKey` is the hook of `getApiKey`, not the
 * key of `getApi`).
 *
 * Returns nothing when every name can stay, which is the usual case.
 */
export function settleHookNames(
  files: ReadonlyArray<readonly [name: string, declared: Declared[]]>,
): Map<HookOperation, HookNames> | undefined {
  const settled = new Map<HookOperation, HookNames>();
  const exported = new Set<string>();
  const inOrder = [
    ...files.filter(([name]) => name !== OpenApiRqFiles.common),
    ...files.filter(([name]) => name === OpenApiRqFiles.common),
  ];
  for (const [file, declared] of inOrder) {
    const imported = new Set<string>(FIXED_IMPORT_NAMES);
    for (const { statement } of declared) {
      if (statement.service) imported.add(statement.service);
      for (const model of statement.models ?? []) imported.add(model);
    }
    const local = INDEX_FILES.includes(file) ? exported : new Set<string>();
    for (const { op, statement } of declared) {
      const name = uniqueName(statement.name, local, imported);
      if (name === statement.name) continue;
      const names = settled.get(op) ?? { ...hookNames(op) };
      for (const key of Object.keys(names) as Array<keyof HookNames>) {
        if (names[key] === statement.name) names[key] = name;
      }
      settled.set(op, names);
    }
  }
  return settled.size > 0 ? settled : undefined;
}
