import ts from "typescript";
import glob from 'glob';

export const makeImports = (generatedClientsPath: string) => {
  const models = glob.sync(`${generatedClientsPath}/models/*.ts`);
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
        ])
      ),
      ts.factory.createStringLiteral("@tanstack/react-query"),
      undefined
    ),
    ...models.map(model => {
      const modelName = model.split('/').pop()!.split('.')[0];
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
        ts.factory.createStringLiteral("../requests/models/" + modelName),
        undefined
      );
    })
  ];
};
