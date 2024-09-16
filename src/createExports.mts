import type ts from "typescript";
import { createPrefetch } from "./createPrefetch.mjs";
import { createUseMutation } from "./createUseMutation.mjs";
import { createUseQuery } from "./createUseQuery.mjs";
import type { Service } from "./service.mjs";

export const createExports = (
  service: Service,
  pageParam: string,
  nextPageParam: string,
  initialPageParam: string,
) => {
  const { klasses } = service;
  const methods = klasses.flatMap((k) => k.methods);

  const allGet = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("GET"),
  );
  const allPost = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("POST"),
  );
  const allPut = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("PUT"),
  );
  const allPatch = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("PATCH"),
  );
  const allDelete = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("DELETE"),
  );

  const allGetQueries = allGet.map((m) =>
    createUseQuery(m, pageParam, nextPageParam, initialPageParam),
  );
  const allPrefetchQueries = allGet.map((m) => createPrefetch(m));

  const allPostMutations = allPost.map((m) => createUseMutation(m));
  const allPutMutations = allPut.map((m) => createUseMutation(m));
  const allPatchMutations = allPatch.map((m) => createUseMutation(m));
  const allDeleteMutations = allDelete.map((m) => createUseMutation(m));

  const allQueries = [...allGetQueries];
  const allMutations = [
    ...allPostMutations,
    ...allPutMutations,
    ...allPatchMutations,
    ...allDeleteMutations,
  ];

  const commonInQueries = allQueries.flatMap(
    ({ apiResponse, returnType, key, queryKeyFn }) => [
      apiResponse,
      returnType,
      key,
      queryKeyFn,
    ],
  );
  const commonInMutations = allMutations.flatMap(({ mutationResult }) => [
    mutationResult,
  ]);

  const allCommon = [...commonInQueries, ...commonInMutations];

  const mainQueries = allQueries.flatMap(({ queryHook }) => [queryHook]);
  const mainMutations = allMutations.flatMap(({ mutationHook }) => [
    mutationHook,
  ]);

  const mainExports = [...mainQueries, ...mainMutations];

  const infiniteQueriesExports = allQueries
    .flatMap(({ infiniteQueryHook }) => [infiniteQueryHook])
    .filter(Boolean) as ts.VariableStatement[];

  const suspenseQueries = allQueries.flatMap(({ suspenseQueryHook }) => [
    suspenseQueryHook,
  ]);

  const suspenseExports = [...suspenseQueries];

  const allPrefetches = allPrefetchQueries.flatMap(({ prefetchHook }) => [
    prefetchHook,
  ]);

  const allPrefetchExports = [...allPrefetches];

  return {
    /**
     * Common types and variables between queries (regular and suspense) and mutations
     */
    allCommon,
    /**
     * Main exports are the hooks that are used in the components
     */
    mainExports,
    /**
     * Infinite queries exports are the hooks that are used in the infinite scroll components
     */
    infiniteQueriesExports,
    /**
     * Suspense exports are the hooks that are used in the suspense components
     */
    suspenseExports,
    /**
     * Prefetch exports are the hooks that are used in the prefetch components
     */
    allPrefetchExports,
  };
};
