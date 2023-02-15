import ts from "typescript";
import glob from "glob";
import { join } from "path";
import fs from "fs";
import { createUseQuery } from "./createUseQuery";
import { createUseMutation } from "./createUseMutation";

export const createExports = (generatedClientsPath: string) => {
  const services = glob.sync(join(generatedClientsPath, 'services', '*.ts').replace(/\\/g, '/'));
  const nodes = services.map((servicePath) =>
    ts.createSourceFile(
      servicePath, // fileName
      fs.readFileSync(join(process.cwd(), servicePath), "utf8"),
      ts.ScriptTarget.Latest // langugeVersion
    )
  );
  return [
    ...nodes
      .map((node) => {
        const klass = node
          .getChildren()[0]
          .getChildren()
          .find(
            (child) => child.kind === ts.SyntaxKind.ClassDeclaration
          ) as ts.ClassDeclaration;
        const className = klass.name?.getText(node)!;
        const methods = klass.members.filter(
          (node) => node.kind === ts.SyntaxKind.MethodDeclaration
        ) as ts.MethodDeclaration[];
        return methods
          .map((method) => {
            const methodName = method.name?.getText(node)!;
            const methodBlock = method
              .getChildren(node)
              .find((child) => child.kind === ts.SyntaxKind.Block) as ts.Block;
            const returnStatement = methodBlock.statements.find(
              (s) => s.kind === ts.SyntaxKind.ReturnStatement
            ) as ts.ReturnStatement;
            const callExpression =
              returnStatement.expression as ts.CallExpression;
            const properties = (
              callExpression.arguments[1] as ts.ObjectLiteralExpression
            ).properties as unknown as ts.PropertyAssignment[];
            const httpMethodName = properties
              .find((p) => p.name?.getText(node) === "method")
              ?.initializer?.getText(node)!;
            return httpMethodName === "'GET'"
              ? createUseQuery(node, className, method)
              : createUseMutation(node, className, method);
          })
          .flat();
      })
      .flat(),
  ];
};
