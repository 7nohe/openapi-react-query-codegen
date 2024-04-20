import type { ClassDeclaration, Project, SourceFile } from "ts-morph";
import ts from "typescript";
import type { MethodDescription } from "./common.mjs";

export type Service = {
  node: SourceFile;
  klasses: Array<{
    className: string;
    klass: ClassDeclaration;
    methods: Array<MethodDescription>;
  }>;
};

export async function getServices(project: Project): Promise<Service> {
  const node = project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().includes("services.ts"));

  if (!node) {
    throw new Error("No service node found");
  }

  const klasses = getClassesFromService(node);
  return {
    klasses: klasses.map(({ klass, className }) => ({
      className,
      klass,
      methods: getMethodsFromService(node, klass),
    })),
    node,
  } satisfies Service;
}

function getClassesFromService(node: SourceFile) {
  const klasses = node.getClasses();

  if (!klasses.length) {
    throw new Error("No classes found");
  }

  return klasses.map((klass) => {
    const className = klass.getName();
    if (!className) {
      throw new Error("Class name not found");
    }
    return {
      className,
      klass,
    };
  });
}

function getClassNameFromClassNode(klass: ClassDeclaration) {
  const className = klass.getName();

  if (!className) {
    throw new Error("Class name not found");
  }
  return className;
}

function getMethodsFromService(node: SourceFile, klass: ClassDeclaration) {
  const methods = klass.getMethods();
  if (!methods.length) {
    throw new Error("No methods found");
  }
  return methods.map((method) => {
    const methodBlockNode = method.compilerNode
      .getChildren(node.compilerNode)
      .find((child) => child.kind === ts.SyntaxKind.Block);

    if (!methodBlockNode) {
      throw new Error("Method block not found");
    }
    const methodBlock = methodBlockNode as ts.Block;
    const foundReturnStatement = methodBlock.statements.find(
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
    const properties = (
      callExpression.arguments[1] as ts.ObjectLiteralExpression
    ).properties as unknown as ts.PropertyAssignment[];
    const httpMethodName = properties
      .find((p) => p.name?.getText(node.compilerNode) === "method")
      ?.initializer?.getText(node.compilerNode);

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

    const children = getAllChildren(method.compilerNode);
    const jsDoc = method.getJsDocs().map((jsDoc) => jsDoc);
    const isDeprecated = children.some(
      (c) => c.kind === ts.SyntaxKind.JSDocDeprecatedTag,
    );

    const className = getClassNameFromClassNode(klass);

    return {
      className,
      node,
      method,
      methodBlock,
      httpMethodName,
      jsDoc,
      isDeprecated,
    } satisfies MethodDescription;
  });
}
