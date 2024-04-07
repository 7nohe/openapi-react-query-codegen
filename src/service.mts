import { readFile } from "fs/promises";
import { join } from "path";
import ts, { JSDoc } from "typescript";
import { MethodDescription } from "./common.mjs";

export type Service = {
  node: ts.SourceFile;
  klasses: Array<{
    className: string;
    klass: ts.ClassDeclaration;
    methods: Array<MethodDescription>;
  }>;
};

export async function getServices(
  generatedClientsPath: string
): Promise<Service> {
  const pathToService = join(generatedClientsPath, "services.ts").replace(
    /\\/g,
    "/"
  );
  const servicesPath = await readFile(
    join(process.cwd(), pathToService),
    "utf-8"
  );

  const node = ts.createSourceFile(
    pathToService, // fileName
    servicesPath,
    ts.ScriptTarget.Latest // languageVersion
  );

  const klasses = getClassesFromService(node);
  return {
    klasses: klasses.map(({ klass, className }) => ({
      className: className,
      klass,
      methods: getMethodsFromService(node, klass),
    })),
    node,
  } satisfies Service;
}

function getClassesFromService(node: ts.SourceFile) {
  const nodeChildren = node.getChildren();
  if (!nodeChildren.length) {
    throw new Error("No children found");
  }

  const subChildren = nodeChildren.map((child) => child.getChildren()).flat();

  const foundKlasses = subChildren.filter(
    (child) => child.kind === ts.SyntaxKind.ClassDeclaration
  );

  if (!foundKlasses.length) {
    throw new Error("No classes found");
  }
  const klasses = foundKlasses as ts.ClassDeclaration[];
  return klasses.map((klass) => {
    const className = getClassNameFromClassNode(klass);
    return {
      className,
      klass,
    };
  });
}

function getClassNameFromClassNode(klass: ts.ClassDeclaration) {
  const className = String(klass.name?.escapedText);

  if (!className) {
    throw new Error("Class name not found");
  }
  return className;
}

function getMethodsFromService(
  node: ts.SourceFile,
  klass: ts.ClassDeclaration
) {
  const methods = klass.members.filter(
    (node) => node.kind === ts.SyntaxKind.MethodDeclaration
  ) as ts.MethodDeclaration[];
  if (!methods.length) {
    throw new Error("No methods found");
  }
  return methods.map((method) => {
    const methodBlockNode = method
      .getChildren(node)
      .find((child) => child.kind === ts.SyntaxKind.Block);

    if (!methodBlockNode) {
      throw new Error("Method block not found");
    }
    const methodBlock = methodBlockNode as ts.Block;
    const foundReturnStatement = methodBlock.statements.find(
      (s) => s.kind === ts.SyntaxKind.ReturnStatement
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
      .find((p) => p.name?.getText(node) === "method")
      ?.initializer?.getText(node);

    if (!httpMethodName) {
      throw new Error("httpMethodName not found");
    }

    const getAllChildren = (tsNode: ts.Node): Array<ts.Node> => {
      const childItems = tsNode.getChildren(node);
      if (childItems.length) {
        const allChildren = childItems.map(getAllChildren);
        return [tsNode].concat(allChildren.flat());
      }
      return [tsNode];
    };

    const children = getAllChildren(method);
    const jsDoc = children
      .filter((c) => c.kind === ts.SyntaxKind.JSDoc)
      .map((c) => (c as JSDoc).comment);
    const isDeprecated = children.some(
      (c) => c.kind === ts.SyntaxKind.JSDocDeprecatedTag
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
