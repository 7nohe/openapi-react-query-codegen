import ts from "typescript";
import { posix } from "path";
import { Service } from "./service.mjs";
import { Project } from "ts-morph";

const { join } = posix;

export const createImports = ({
  service,
  serviceEndName,
  project,
}: {
  service: Service;
  serviceEndName: string;
  project: Project;
}) => {
  const { klasses } = service;
  // get all class names
  const classNames = klasses.map(({ className }) => className);
  // remove duplicates
  const uniqueClassNames = [...new Set(classNames)];

  const modelsFile = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes("models.ts"));

  const serviceFile = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes("services.ts"));

  if (!modelsFile) {
    throw new Error("No models file found");
  }

  if (!serviceFile) {
    throw new Error("No service file found");
  }

  const modalNames = Array.from(modelsFile.getExportedDeclarations().keys());

  const serviceExports = Array.from(
    serviceFile.getExportedDeclarations().keys()
  );

  const serviceNames = serviceExports.filter((name) =>
    name.endsWith(serviceEndName)
  );

  const serviceNamesData = serviceExports.filter((name) =>
    name.endsWith("Data")
  );

  return [
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
      ts.factory.createStringLiteral(join("../requests")),
      undefined
    ),
    // import all the models by name
    ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
          ...modalNames.map((modelName) =>
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(modelName)
            )
          ),
        ])
      ),
      ts.factory.createStringLiteral(join("../requests/models")),
      undefined
    ),
  ];
};
