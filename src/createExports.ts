import ts, { JSDoc } from "typescript";
import { sync } from "glob";
import { join } from "path";
import fs from "fs";
import { createUseQuery } from "./createUseQuery";
import { createUseMutation } from "./createUseMutation";
import { type MethodDescription } from "./common";

export function getMethodsFromService(generatedClientsPath: string) {
  const services = sync(
    join(generatedClientsPath, "services", "*.ts").replace(/\\/g, "/")
  );
  const nodes = services.map((servicePath) =>
    ts.createSourceFile(
      servicePath, // fileName
      fs.readFileSync(join(process.cwd(), servicePath), "utf8"),
      ts.ScriptTarget.Latest // languageVersion
    )
  );
  return [
    ...nodes
      .map((node) => {
        const foundKlass = node
          .getChildren()[0]
          .getChildren()
          .find((child) => child.kind === ts.SyntaxKind.ClassDeclaration);
        if (!foundKlass) {
          throw new Error("Class not found");
        }
        const klass = foundKlass as ts.ClassDeclaration;
        const className = klass.name?.getText(node);
        if (!className) {
          throw new Error("Class name not found");
        }
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
      })
      .flat(),
  ];
}

export const createExportsV2 = (generatedClientsPath: string) => {
  const methods = getMethodsFromService(generatedClientsPath);

  const allGet = methods.filter((m) => m.httpMethodName === "'GET'");
  const allPost = methods.filter((m) => m.httpMethodName === "'POST'");

  const allQueries = allGet.map((m) => createUseQuery(m));
  const allMutations = allPost.map((m) => createUseMutation(m));

  const commonInQueries = allQueries
    .map(({ apiResponse, returnType, key }) => [apiResponse, returnType, key])
    .flat();
  const commonInMutations = allMutations
    .map(({ mutationResult }) => [mutationResult])
    .flat();

  const allCommon = [...commonInQueries, ...commonInMutations];

  const mainQueries = allQueries.map(({ queryHook }) => [queryHook]).flat();
  const mainMutations = allMutations
    .map(({ mutationHook }) => [mutationHook])
    .flat();

  const mainExports = [...mainQueries, ...mainMutations];

  const suspenseQueries = allQueries
    .map(({ suspenseQueryHook }) => [suspenseQueryHook])
    .flat();

  const suspenseExports = [...suspenseQueries];

  return {
    /**
     * Common types and variables between queries (regular and suspense) and mutations
     */
    allCommon,
    /**
     * Main exports are the hooks that are used in the components
     */
    mainExports,
    /**
     * Suspense exports are the hooks that are used in the suspense components
     */
    suspenseExports,
  };
};

// export const createExports = (generatedClientsPath: string) => {
//   const services = sync(
//     join(generatedClientsPath, "services", "*.ts").replace(/\\/g, "/")
//   );
//   const nodes = services.map((servicePath) =>
//     ts.createSourceFile(
//       servicePath, // fileName
//       fs.readFileSync(join(process.cwd(), servicePath), "utf8"),
//       ts.ScriptTarget.Latest // languageVersion
//     )
//   );
//   return [
//     ...nodes
//       .map((node) => {
//         const klass = node
//           .getChildren()[0]
//           .getChildren()
//           .find(
//             (child) => child.kind === ts.SyntaxKind.ClassDeclaration
//           ) as ts.ClassDeclaration;
//         const className = klass.name?.getText(node);
//         if (!className) {
//           throw new Error("Class name not found");
//         }
//         const methods = klass.members.filter(
//           (node) => node.kind === ts.SyntaxKind.MethodDeclaration
//         ) as ts.MethodDeclaration[];
//         return methods
//           .map((method) => {
//             const methodBlock = method
//               .getChildren(node)
//               .find((child) => child.kind === ts.SyntaxKind.Block) as ts.Block;
//             const returnStatement = methodBlock.statements.find(
//               (s) => s.kind === ts.SyntaxKind.ReturnStatement
//             ) as ts.ReturnStatement;
//             const callExpression =
//               returnStatement.expression as ts.CallExpression;
//             const properties = (
//               callExpression.arguments[1] as ts.ObjectLiteralExpression
//             ).properties as unknown as ts.PropertyAssignment[];
//             const httpMethodName = properties
//               .find((p) => p.name?.getText(node) === "method")
//               ?.initializer?.getText(node);

//             if (!httpMethodName) {
//               throw new Error("httpMethodName not found");
//             }

//             const getAllChildren = (tsNode: ts.Node): Array<ts.Node> => {
//               const childItems = tsNode.getChildren(node);
//               if (childItems.length) {
//                 const allChildren = childItems.map(getAllChildren);
//                 return [tsNode].concat(allChildren.flat());
//               }
//               return [tsNode];
//             };

//             const children = getAllChildren(method);
//             const jsDoc = children
//               .filter((c) => c.kind === ts.SyntaxKind.JSDoc)
//               .map((c) => {
//                 return (c as JSDoc).comment;
//               });
//             const hasDeprecated = children.some(
//               (c) => c.kind === ts.SyntaxKind.JSDocDeprecatedTag
//             );

//             return httpMethodName === "'GET'"
//               ? createUseQuery(node, className, method, jsDoc, hasDeprecated)
//               : createUseMutation(
//                   node,
//                   className,
//                   method,
//                   jsDoc,
//                   hasDeprecated
//                 );
//           })
//           .flat();
//       })
//       .flat(),
//   ];
// };
