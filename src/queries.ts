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
      const methods = klass.members.filter(node => node.kind === ts.SyntaxKind.MethodDeclaration) as ts.MethodDeclaration[];
      return methods.map(method => {
        const methodName = method.name?.getText(node)!;
        const methodBlock = method.getChildren(node).find(child => child.kind === ts.SyntaxKind.Block) as ts.Block;
        const returnStatement = methodBlock.statements.find(s => s.kind === ts.SyntaxKind.ReturnStatement) as ts.ReturnStatement;
        const callExpression = returnStatement.expression as ts.CallExpression;
        const properties = (callExpression.arguments[1] as ts.ObjectLiteralExpression).properties as unknown as ts.PropertyAssignment[];
        const httpMethodName = properties.find(p => p.name?.getText(node) === 'method')?.initializer?.getText(node)!;
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
                method.parameters,
                undefined,
                ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                ts.factory.createCallExpression(
                  ts.factory.createIdentifier(httpMethodName === "'GET'" ? "useQuery" : "useMutation"),
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
                        method.parameters.map(param => ts.factory.createIdentifier(param.name.getText(node)))
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