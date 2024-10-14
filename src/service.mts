import type { Project, SourceFile } from "ts-morph";
import ts from "typescript";
import type { FunctionDescription } from "./common.mjs";
import { serviceFileName } from "./constants.mjs";

export type Service = {
  node: SourceFile;
  methods: Array<FunctionDescription>;
};

export async function getServices(project: Project): Promise<Service> {
  const node = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes(serviceFileName));

  if (!node) {
    throw new Error("No service node found");
  }

  const methods = getMethodsFromService(node);
  return {
    methods,
    node,
  } satisfies Service;
}

export function getMethodsFromService(node: SourceFile): FunctionDescription[] {
  const variableStatements = node.getVariableStatements();

  // The first variable statement is `const client = createClient(createConfig())`, so we skip it
  return variableStatements.splice(1).flatMap((variableStatement) => {
    const declarations = variableStatement.getDeclarations();
    return declarations.map((declaration) => {
      if (!ts.isVariableDeclaration(declaration.compilerNode)) {
        throw new Error("Variable declaration not found");
      }
      const initializer = declaration.getInitializer();
      if (!initializer) {
        throw new Error("Initializer not found");
      }
      if (!ts.isArrowFunction(initializer.compilerNode)) {
        throw new Error("Arrow function not found");
      }
      const methodBlockNode = initializer.compilerNode.body;
      if (!methodBlockNode || !ts.isBlock(methodBlockNode)) {
        throw new Error("Method block not found");
      }
      const foundReturnStatement = methodBlockNode.statements.find(
        (s) => s.kind === ts.SyntaxKind.ReturnStatement,
      );
      if (!foundReturnStatement) {
        throw new Error("Return statement not found");
      }
      const returnStatement = foundReturnStatement as ts.ReturnStatement;
      const foundCallExpression = returnStatement.expression;
      if (!foundCallExpression) {
        throw new Error("Call expression not found");
      }
      const callExpression = foundCallExpression as ts.CallExpression;

      const propertyAccessExpression =
        callExpression.expression as ts.PropertyAccessExpression;
      const httpMethodName = propertyAccessExpression.name.getText();

      if (!httpMethodName) {
        throw new Error("httpMethodName not found");
      }

      const getAllChildren = (tsNode: ts.Node): Array<ts.Node> => {
        const childItems = tsNode.getChildren(node.compilerNode);
        if (childItems.length) {
          const allChildren = childItems.map(getAllChildren);
          return [tsNode].concat(allChildren.flat());
        }
        return [tsNode];
      };

      const children = getAllChildren(initializer.compilerNode);
      // get all JSDoc comments
      // this should be an array of 1 or 0
      const jsDocs = children
        .filter((c) => c.kind === ts.SyntaxKind.JSDoc)
        .map((c) => c.getText(node.compilerNode));
      // get the first JSDoc comment
      const jsDoc = jsDocs?.[0];
      const isDeprecated = children.some(
        (c) => c.kind === ts.SyntaxKind.JSDocDeprecatedTag,
      );

      const methodDescription: FunctionDescription = {
        node,
        method: declaration,
        methodBlock: methodBlockNode,
        httpMethodName,
        jsDoc,
        isDeprecated,
      } satisfies FunctionDescription;

      return methodDescription;
    });
  });
}
