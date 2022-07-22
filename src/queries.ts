import ts from 'typescript';
import glob from 'glob';
import { join } from "path";
import fs from 'fs';
import { capitalizeFirstLetter } from './common';

export const makeQueries = (
  generatedClientsPath: string,
) => {
  const services = glob.sync(`${generatedClientsPath}/services/*.ts`);
  const nodes = services.map(servicePath => ts.createSourceFile(
    servicePath,   // fileName
    fs.readFileSync(join(process.cwd(), servicePath), 'utf8'),
    ts.ScriptTarget.Latest // langugeVersion
  ))
  return [
    ts.factory.createImportDeclaration(
      undefined,
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier("useQuery")
        )])
      ),
      ts.factory.createStringLiteral("@tanstack/react-query"),
      undefined
    ),
    ...nodes.map((node) => {
      const klass = node.getChildren()[0].getChildren().find(child => child.kind === ts.SyntaxKind.ClassDeclaration) as ts.ClassDeclaration;
      const className = klass.name?.getText(node)!;
      return ts.factory.createImportDeclaration(
        undefined,
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamedImports([ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier(className)
          )])
        ),
        ts.factory.createStringLiteral(join('../requests/services', className)),
        undefined
      )
    }),
    ...nodes.map((node) => {
      const klass = node.getChildren()[0].getChildren().find(child => child.kind === ts.SyntaxKind.ClassDeclaration) as ts.ClassDeclaration;
      const className = klass.name?.getText(node)!;
      const methods = klass.members.filter(node => node.kind === ts.SyntaxKind.MethodDeclaration)
      return methods.map(method => {
        const methodName = method.name?.getText(node)!;
        return ts.factory.createVariableStatement(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          ts.factory.createVariableDeclarationList(
            [ts.factory.createVariableDeclaration(
              ts.factory.createIdentifier(`use${className}${capitalizeFirstLetter(methodName)}`),
              undefined,
              undefined,
              ts.factory.createArrowFunction(
                undefined,
                undefined,
                [],
                undefined,
                ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                ts.factory.createCallExpression(
                  ts.factory.createIdentifier("useQuery"),
                  undefined,
                  [
                    ts.factory.createArrayLiteralExpression(
                      [ts.factory.createStringLiteral(`${className}${capitalizeFirstLetter(methodName)}`)],
                      false
                    ),
                    ts.factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                      ts.factory.createCallExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createIdentifier(className),
                          ts.factory.createIdentifier(methodName)
                        ),
                        undefined,
                        []
                      )
                    )
                  ]
                )
              )
            )],
            ts.NodeFlags.Const
          )
        )
      }
      ).flat()
    }).flat()
  ];
}