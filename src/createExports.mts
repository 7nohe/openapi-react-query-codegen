import { createUseQuery } from "./createUseQuery.mjs";
import { createUseMutation } from "./createUseMutation.mjs";
import { Service } from "./service.mjs";

export const createExports = (service: Service) => {
  const { klasses } = service;
  const methods = klasses.map((k) => k.methods).flat();

  const allGet = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("GET")
  );
  const allPost = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("POST")
  );
  const allPut = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("PUT")
  );
  const allPatch = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("PATCH")
  );
  const allDelete = methods.filter((m) =>
    m.httpMethodName.toUpperCase().includes("DELETE")
  );

  const allGetQueries = allGet.map((m) => createUseQuery(m));

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

  const commonInQueries = allQueries
    .map(({ apiResponse, returnType, key }) => [apiResponse, returnType, key])
    .flat();
  const commonInMutations = allMutations
    .map(({ mutationResult }) => [mutationResult])
    .flat();

  const allCommon = [...commonInQueries, ...commonInMutations];

  const mainQueries = allQueries.map(({ queryHook }) => [queryHook]).flat();
  const mainMutations = allMutations
    .map(({ mutationHook }) => [mutationHook])
    .flat();

  const mainExports = [...mainQueries, ...mainMutations];

  const suspenseQueries = allQueries
    .map(({ suspenseQueryHook }) => [suspenseQueryHook])
    .flat();

  const suspenseExports = [...suspenseQueries];

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
     * Suspense exports are the hooks that are used in the suspense components
     */
    suspenseExports,
  };
};
