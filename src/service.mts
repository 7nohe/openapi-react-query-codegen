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
  // Filter to only exported variable statements that contain arrow functions
  const exportedStatements = variableStatements.filter((statement) => {
    if (!statement.isExported()) return false;
    const declarations = statement.getDeclarations();
    return declarations.some((decl) => {
      const initializer = decl.getInitializer();
      return initializer && ts.isArrowFunction(initializer.compilerNode);
    });
  });

  return exportedStatements.flatMap((variableStatement) => {
    const declarations = variableStatement.getDeclarations();
    return declarations.map((declaration) => {
      const initializer = declaration.getInitializer();
      if (!initializer) {
        throw new Error("Initializer not found");
      }
      const compilerNode = initializer.compilerNode;
      if (!ts.isArrowFunction(compilerNode)) {
        throw new Error("Arrow function not found");
      }
      const arrowBody = compilerNode.body;

      // Find the call expression - either from block's return statement or direct expression
      let callExpression: ts.Expression;
      let methodBlockNode: ts.Block | undefined;

      if (ts.isBlock(arrowBody)) {
        // Old style: arrow function with block body
        methodBlockNode = arrowBody;
        const returnStatement = arrowBody.statements.find(ts.isReturnStatement);
        if (!returnStatement) {
          throw new Error("Return statement not found");
        }
        if (!returnStatement.expression) {
          throw new Error("Call expression not found");
        }
        callExpression = returnStatement.expression;
      } else {
        // New style: arrow function with expression body (no block)
        // The body is a call expression like: (options?.client ?? client).post<...>({...})
        callExpression = arrowBody;
      }

      // Navigate to find the HTTP method name (get, post, put, delete, etc.)
      let httpMethodName: string | undefined;
      if (ts.isCallExpression(callExpression)) {
        const expr = callExpression.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          httpMethodName = expr.name.text;
        }
      }

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

      const children = getAllChildren(variableStatement.compilerNode);
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
