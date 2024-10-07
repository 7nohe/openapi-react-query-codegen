import { posix } from "node:path";
import type { Project } from "ts-morph";
import ts from "typescript";
import { modalsFileName, serviceFileName } from "./constants.mjs";

const { join } = posix;

export const createImports = ({
  project,
}: {
  project: Project;
}) => {
  const modelsFile = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes(modalsFileName));

  const serviceFile = project.getSourceFileOrThrow(`${serviceFileName}.ts`);

  if (!modelsFile) {
    console.warn(`
⚠️ WARNING: No models file found.
  This may be an error if \`.components.schemas\` or \`.components.parameters\` is defined in your OpenAPI input.`);
  }

  const modelNames = modelsFile
    ? Array.from(modelsFile.getExportedDeclarations().keys())
    : [];

  const serviceExports = Array.from(
    serviceFile.getExportedDeclarations().keys(),
  );

  const serviceNames = serviceExports;

  const imports = [
    ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(
            true,
            undefined,
            ts.factory.createIdentifier("QueryClient"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("useQuery"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("useSuspenseQuery"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("useMutation"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseQueryResult"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseQueryOptions"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseMutationOptions"),
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseMutationResult"),
          ),
        ]),
      ),
      ts.factory.createStringLiteral("@tanstack/react-query"),
      undefined,
    ),
    ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
          // import all class names from service file
          ...serviceNames.map((serviceName) =>
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(serviceName),
            ),
          ),
        ]),
      ),
      ts.factory.createStringLiteral(join("../requests", serviceFileName)),
      undefined,
    ),
  ];
  if (modelsFile) {
    // import all the models by name
    imports.push(
      ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ...modelNames.map((modelName) =>
              ts.factory.createImportSpecifier(
                false,
                undefined,
                ts.factory.createIdentifier(modelName),
              ),
            ),
          ]),
        ),
        ts.factory.createStringLiteral(join("../requests/", modalsFileName)),
        undefined,
      ),
    );
  }
  return imports;
};
