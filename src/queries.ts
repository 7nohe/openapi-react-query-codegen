import ts from "typescript";
import glob from "glob";
import { join } from "path";
import fs from "fs";
import { capitalizeFirstLetter } from "./common";

const makeUseQuery = (
  node: ts.SourceFile,
  className: string,
  method: ts.MethodDeclaration
) => {
  const methodName = method.name?.getText(node)!;
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(
            `use${className}${capitalizeFirstLetter(methodName)}`
          ),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                ts.factory.createObjectBindingPattern(
                  method.parameters.map((param) =>
                    ts.factory.createBindingElement(
                      undefined,
                      undefined,
                      ts.factory.createIdentifier(param.name.getText(node)),
                      undefined
                    )
                  )
                ),
                undefined,
                ts.factory.createTypeLiteralNode(
                  method.parameters.map((param) =>
                    ts.factory.createPropertySignature(
                      undefined,
                      ts.factory.createIdentifier(param.name.getText(node)),
                      undefined,
                      param.type
                    )
                  )
                ),
                undefined
              ),
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                ts.factory.createIdentifier("options"),
                ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier("Omit"),
                  [
                    ts.factory.createTypeReferenceNode(
                      ts.factory.createIdentifier("UseQueryOptions"),
                      [
                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("Awaited"),
                          [
                            ts.factory.createTypeReferenceNode(
                              ts.factory.createIdentifier("ReturnType"),
                              [
                                ts.factory.createTypeQueryNode(
                                  ts.factory.createQualifiedName(
                                    ts.factory.createIdentifier(className),
                                    ts.factory.createIdentifier(methodName)
                                  ),
                                  undefined
                                ),
                              ]
                            ),
                          ]
                        ),
                        ts.factory.createKeywordTypeNode(
                          ts.SyntaxKind.UnknownKeyword
                        ),
                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("Awaited"),
                          [
                            ts.factory.createTypeReferenceNode(
                              ts.factory.createIdentifier("ReturnType"),
                              [
                                ts.factory.createTypeQueryNode(
                                  ts.factory.createQualifiedName(
                                    ts.factory.createIdentifier(className),
                                    ts.factory.createIdentifier(methodName)
                                  ),
                                  undefined
                                ),
                              ]
                            ),
                          ]
                        ),
                        ts.factory.createArrayTypeNode(
                          ts.factory.createKeywordTypeNode(
                            ts.SyntaxKind.StringKeyword
                          )
                        ),
                      ]
                    ),
                    ts.factory.createUnionTypeNode([
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("queryKey")
                      ),
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("queryFn")
                      ),
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("initialData")
                      ),
                    ]),
                  ]
                ),
                undefined
              ),
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("useQuery"),
              undefined,
              [
                ts.factory.createArrayLiteralExpression(
                  [
                    ts.factory.createStringLiteral(
                      `${className}${capitalizeFirstLetter(methodName)}`
                    ),
                  ],
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
                    method.parameters.map((param) =>
                      ts.factory.createIdentifier(param.name.getText(node))
                    )
                  )
                ),
                ts.factory.createIdentifier("options"),
              ]
            )
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  );
};

const makeUseMutation = (
  node: ts.SourceFile,
  className: string,
  method: ts.MethodDeclaration
) => {
  const methodName = method.name?.getText(node)!;
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(
            `use${className}${capitalizeFirstLetter(methodName)}`
          ),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                ts.factory.createIdentifier("options"),
                ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier("Omit"),
                  [
                    ts.factory.createTypeReferenceNode(
                      ts.factory.createIdentifier("UseMutationOptions"),
                      [
                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("Awaited"),
                          [
                            ts.factory.createTypeReferenceNode(
                              ts.factory.createIdentifier("ReturnType"),
                              [
                                ts.factory.createTypeQueryNode(
                                  ts.factory.createQualifiedName(
                                    ts.factory.createIdentifier(className),
                                    ts.factory.createIdentifier(methodName)
                                  ),
                                  undefined
                                ),
                              ]
                            ),
                          ]
                        ),
                        ts.factory.createKeywordTypeNode(
                          ts.SyntaxKind.UnknownKeyword
                        ),
                        ts.factory.createTypeLiteralNode(
                          method.parameters.map((param) => {
                            return ts.factory.createPropertySignature(
                              undefined,
                              ts.factory.createIdentifier(param.name.getText(node)),
                              undefined,
                              param.type
                            )
                          })),
                        ts.factory.createKeywordTypeNode(
                          ts.SyntaxKind.UnknownKeyword
                        ),
                      ]
                    ),
                    ts.factory.createLiteralTypeNode(
                      ts.factory.createStringLiteral("mutationFn")
                    ),
                  ]
                ),
                undefined
              ),
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("useMutation"),
              undefined,
              [
                ts.factory.createArrowFunction(
                  undefined,
                  undefined,
                  [
                    ts.factory.createParameterDeclaration(
                      undefined,
                      undefined,
                      undefined,
                      ts.factory.createObjectBindingPattern(method.parameters.map((param) => {
                        return ts.factory.createBindingElement(
                          undefined,
                          undefined,
                          ts.factory.createIdentifier(param.name.getText(node)),
                          undefined
                        )
                      })),
                      undefined,
                      undefined,
                      undefined
                    ),
                  ],
                  undefined,
                  ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier(className),
                      ts.factory.createIdentifier(methodName)
                    ),
                    undefined,
                    method.parameters.map(params => ts.factory.createIdentifier(params.name.getText(node)))
                  )
                ),
                ts.factory.createIdentifier("options"),
              ]
            )
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  );
};

export const makeQueries = (generatedClientsPath: string) => {
  const services = glob.sync(`${generatedClientsPath}/services/*.ts`);
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
              ? makeUseQuery(node, className, method)
              : makeUseMutation(node, className, method);
          })
          .flat();
      })
      .flat(),
  ];
};
