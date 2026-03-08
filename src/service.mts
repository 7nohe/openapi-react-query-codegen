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

/**
 * Extract the call expression from an arrow function body.
 * Handles both block body (with return statement) and expression body.
 */
function extractCallExpression(
  body: ts.ConciseBody,
): ts.CallExpression | undefined {
  // Block body: { return client.get(...); }
  if (ts.isBlock(body)) {
    const returnStatement = body.statements.find(
      (s) => s.kind === ts.SyntaxKind.ReturnStatement,
    ) as ts.ReturnStatement | undefined;
    if (
      returnStatement?.expression &&
      ts.isCallExpression(returnStatement.expression)
    ) {
      return returnStatement.expression;
    }
    return undefined;
  }

  // Expression body: client.get(...) or (options?.client ?? _heyApiClient).get(...)
  if (ts.isCallExpression(body)) {
    return body;
  }

  return undefined;
}

export function getMethodsFromService(node: SourceFile): FunctionDescription[] {
  const variableStatements = node.getVariableStatements();

  // In v0.73+, sdk.gen.ts exports functions directly (no client initialization)
  return variableStatements.flatMap((variableStatement) => {
    const declarations = variableStatement.getDeclarations();
    return declarations
      .map((declaration) => {
        if (!ts.isVariableDeclaration(declaration.compilerNode)) {
          return null;
        }
        const initializer = declaration.getInitializer();
        if (!initializer) {
          return null;
        }
        if (!ts.isArrowFunction(initializer.compilerNode)) {
          return null;
        }

        const callExpression = extractCallExpression(
          initializer.compilerNode.body,
        );
        if (!callExpression) {
          return null;
        }

        // Get the HTTP method name from the call expression (e.g., .get, .post, .delete)
        const expression = callExpression.expression;
        if (!ts.isPropertyAccessExpression(expression)) {
          return null;
        }
        const httpMethodName = expression.name.getText();

        if (!httpMethodName) {
          return null;
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
        const jsDocs = children
          .filter((c) => c.kind === ts.SyntaxKind.JSDoc)
          .map((c) => c.getText(node.compilerNode));
        const jsDoc = jsDocs?.[0];
        const isDeprecated = children.some(
          (c) => c.kind === ts.SyntaxKind.JSDocDeprecatedTag,
        );

        const methodDescription: FunctionDescription = {
          node,
          method: declaration,
          httpMethodName,
          jsDoc,
          isDeprecated,
        } satisfies FunctionDescription;

        return methodDescription;
      })
      .filter((desc): desc is FunctionDescription => desc !== null);
  });
}
