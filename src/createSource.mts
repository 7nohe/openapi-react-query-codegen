import type { ClientKind, GeneratedClient } from "./client/index.mjs";
import { generateAllFiles } from "./hooks/index.mjs";
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
  importExtension = "",
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
  /** Extension of the relative imports; see `detectImportExtension`. */
  importExtension?: "" | ".js";
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
    importExtension,
  };
  return generateAllFiles(generated.operations, ctx);
};
