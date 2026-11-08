import type { ClientKind, GeneratedClient } from "./client/index.mjs";
import { generateAllFiles } from "./tsmorph/index.mjs";
import type { GeneratedFile, GenerationContext } from "./types.mjs";

/**
 * Create the React Query source files for a generated client.
 */
export const createSource = ({
  generated,
  client,
  version,
  pageParam,
  nextPageParam,
  initialPageParam,
  omitInitialPageParam,
}: {
  generated: Pick<
    GeneratedClient,
    "operations" | "modelNames" | "serviceNames"
  >;
  client: ClientKind;
  version: string;
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string;
  omitInitialPageParam: boolean;
}): GeneratedFile[] => {
  const ctx: GenerationContext = {
    client,
    modelNames: generated.modelNames,
    serviceNames: generated.serviceNames,
    pageParam,
    nextPageParam,
    initialPageParam,
    omitInitialPageParam,
    version,
  };
  return generateAllFiles(generated.operations, ctx);
};
