import ts from "typescript";
import { glob } from "glob";
import { extname, basename, posix } from "path";
import { Service } from "./service.mjs";
import { Project } from "ts-morph";

const { join } = posix;

export const createImports = async ({
  generatedClientsPath,
  service,
  serviceEndName,
  project,
}: {
  generatedClientsPath: string;
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

  if (!modelsFile) {
    throw new Error("No models file found");
  }

  const modalNames = Array.from(modelsFile.getExportedDeclarations().keys());

  const modalsPath = join(generatedClientsPath, "models").replace(/\\/g, "/");
  const servicesPath = join(generatedClientsPath, "services").replace(
    /\\/g,
    "/"
  );
  const [models, services] = await Promise.all([
    glob(join(modalsPath, "*.ts")),
    glob(join(servicesPath, "*.ts")),
  ]);
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
    ...models.map((model) => {
      const modelName = basename(model, extname(model));
      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(modelName)
            ),
          ])
        ),
        ts.factory.createStringLiteral(join("../requests/models/", modelName)),
        undefined
      );
    }),
    ...services.map((service) => {
      const serviceName = basename(service, extname(service));
      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(serviceName)
            ),
          ])
        ),
        ts.factory.createStringLiteral(
          join("../requests/services", serviceName)
        ),
        undefined
      );
    }),
    // import all class names from service file
    ...uniqueClassNames.map((className) => {
      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(className)
            ),
          ])
        ),
        ts.factory.createStringLiteral(join("../requests")),
        undefined
      );
    }),
    // import all data objects from service file
    ...uniqueClassNames.map((className) => {
      // remove serviceEndName from the end of class name
      // TODO: we should use a better way to remove the serviceEndName  from the end of the class name
      const classNameData = className.replace(serviceEndName, "");

      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              undefined,
              ts.factory.createIdentifier(`${classNameData}Data`)
            ),
          ])
        ),
        ts.factory.createStringLiteral(join("../requests")),
        undefined
      );
    }),
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
