import { join } from "node:path";
import type { UserConfig } from "@hey-api/openapi-ts";
import { Project } from "ts-morph";
import { buildGenerationContext, parseOperations } from "./parseOperations.mjs";
import { generateAllFiles } from "./tsmorph/index.mjs";
import type { GeneratedFile } from "./types.mjs";

/**
 * Create source files using ts-morph based generation.
 */
export const createSource = async ({
  outputPath,
  client,
  version,
  pageParam,
  nextPageParam,
  initialPageParam,
}: {
  outputPath: string;
  client: UserConfig["client"];
  version: string;
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string;
}): Promise<GeneratedFile[]> => {
  // Initialize ts-morph project to read the generated OpenAPI client
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFiles = join(process.cwd(), outputPath);
  project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

  // Parse operations from the service file
  const operations = await parseOperations(project, pageParam);

  // Build generation context
  const ctx = buildGenerationContext(
    project,
    client as "@hey-api/client-fetch" | "@hey-api/client-axios",
    pageParam,
    nextPageParam,
    initialPageParam,
    version,
  );

  // Generate all files using ts-morph
  return generateAllFiles(operations, ctx);
};
