import ts from "typescript";
import { sync } from "glob";
import { extname, basename, posix } from "path";

const { join } = posix;

export const createImports = (generatedClientsPath: string) => {
  const models = sync(
    join(generatedClientsPath, "models", "*.ts").replace(/\\/g, "/")
  );
  const services = sync(
    join(generatedClientsPath, "services", "*.ts").replace(/\\/g, "/")
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
  ];
};
