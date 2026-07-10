export const defaultOutputPath = "openapi";
export const queriesOutputPath = "queries";
export const requestsOutputPath = "requests";

export const serviceFileName = "sdk.gen";
export const modelsFileName = "types.gen";

export const OpenApiRqFiles = {
  queries: "queries",
  queryOptions: "queryOptions",
  infiniteQueries: "infiniteQueries",
  common: "common",
  suspense: "suspense",
  index: "index",
  prefetch: "prefetch",
  ensureQueryData: "ensureQueryData",
} as const;
