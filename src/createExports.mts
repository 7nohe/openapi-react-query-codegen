import { createUseQuery } from "./createUseQuery.mjs";
import { createUseMutation } from "./createUseMutation.mjs";
import { Service } from "./service.mjs";

export const createExports = (service: Service) => {
  const { klasses } = service;
  const methods = klasses.map((k) => k.methods).flat();

  const allGet = methods.filter((m) => m.httpMethodName === "'GET'");
  const allPost = methods.filter((m) => m.httpMethodName === "'POST'");

  const allQueries = allGet.map((m) => createUseQuery(m));
  const allMutations = allPost.map((m) => createUseMutation(m));

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
