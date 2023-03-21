import ts from "typescript";
import { capitalizeFirstLetter } from "./common";

export const createUseQuery = (
  node: ts.SourceFile,
  className: string,
  method: ts.MethodDeclaration
) => {
  const methodName = method.name?.getText(node)!;
  let requestParam = [];
  if (method.parameters.length !== 0) {
    requestParam.push(
      ts.factory.createParameterDeclaration(
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
      ),
    );
  }

  const customHookName = `use${className}${capitalizeFirstLetter(methodName)}`;
  const queryKey = `${customHookName}Key`

  return [
    ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(queryKey),
          undefined,
          undefined,
          ts.factory.createStringLiteral(`${className}${capitalizeFirstLetter(methodName)}`)
        )],
        ts.NodeFlags.Const
      )
    ),
    ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(
            customHookName
          ),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ...requestParam,
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                ts.factory.createIdentifier("queryKey"),
                undefined,
                ts.factory.createArrayTypeNode(ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)),
                ts.factory.createArrayLiteralExpression(
                  [],
                  false
                )
              ),
              ts.factory.createParameterDeclaration(
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
                    ts.factory.createIdentifier(queryKey),
                    ts.factory.createSpreadElement(ts.factory.createIdentifier("queryKey"))
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
  )];
};
