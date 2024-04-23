import ts from "typescript";
import { posix } from "path";
import { Project } from "ts-morph";
import { modalsFileName, serviceFileName } from "./constants.mjs";

const { join } = posix;

export const createImports = ({
  serviceEndName,
  project,
}: {
  serviceEndName: string;
  project: Project;
}) => {
  const modelsFile = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes(modalsFileName));

  const serviceFile = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes(serviceFileName));

  if (!modelsFile) {
    console.warn(`
⚠️ WARNING: No models file found.
  This may be an error if \`.components.schemas\` or \`.components.parameters\` is defined in your OpenAPI input.`);
  }

  if (!serviceFile) {
    throw new Error("No service file found");
  }

  const modelNames = modelsFile
    ? Array.from(modelsFile.getExportedDeclarations().keys())
    : [];

  const serviceExports = Array.from(
    serviceFile.getExportedDeclarations().keys()
  );

  const serviceNames = serviceExports.filter((name) =>
    name.endsWith(serviceEndName)
  );

  const serviceNamesData = serviceExports.filter((name) =>
    name.endsWith("Data")
  );

  const imports = [
    ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("useQuery")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("useSuspenseQuery")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("useMutation")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseQueryResult")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseQueryOptions")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseMutationOptions")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseMutationResult")
          ),
        ])
      ),
      ts.factory.createStringLiteral("@tanstack/react-query"),
      undefined
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
              ts.factory.createIdentifier(serviceName)
            )
          ),
          // import all data objects from service file
          ...serviceNamesData.map((dataName) =>
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(dataName)
            )
          ),
        ])
      ),
      ts.factory.createStringLiteral(join("../requests", serviceFileName)),
      undefined
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
                ts.factory.createIdentifier(modelName)
              )
            ),
          ])
        ),
        ts.factory.createStringLiteral(join("../requests/", modalsFileName)),
        undefined
      )
    );
  }
  return imports;
};
