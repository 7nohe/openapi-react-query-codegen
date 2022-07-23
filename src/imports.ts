import ts from "typescript";
import glob from "glob";
import { join } from "path";

export const makeImports = (generatedClientsPath: string) => {
  const models = glob.sync(`${generatedClientsPath}/models/*.ts`);
  const services = glob.sync(`${generatedClientsPath}/services/*.ts`);
  return [
    ts.factory.createImportDeclaration(
      undefined,
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
            ts.factory.createIdentifier("UseQueryOptions")
          ),
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier("UseMutationOptions")
          ),
        ])
      ),
      ts.factory.createStringLiteral("@tanstack/react-query"),
      undefined
    ),
    ...models.map((model) => {
      const modelName = model.split("/").pop()!.split(".")[0];
      return ts.factory.createImportDeclaration(
        undefined,
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
      const serviceName = service.split("/").pop()!.split(".")[0];
      return ts.factory.createImportDeclaration(
        undefined,
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
