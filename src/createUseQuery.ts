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
              param.questionToken ?? param.initializer
                ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
                : param.questionToken,
              param.type
            )
          )
        )
      )
    );
  }

  const customHookName = `use${className}${capitalizeFirstLetter(methodName)}`;
  const queryKey = `${customHookName}Key`;

  const queryKeyGenericType = ts.factory.createTypeReferenceNode(
    "TQueryKey",
    undefined
  );
  const queryKeyConstraint = ts.factory.createTypeReferenceNode("Array", [
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
  ]);

  // Awaited<ReturnType<typeof myClass.myMethod>>
  const awaitedResponseDataType = ts.factory.createTypeReferenceNode(
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
  );

  const responseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    "TData",
    undefined,
    awaitedResponseDataType
  );

  return [
    // QueryKey
    ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(queryKey),
            undefined,
            undefined,
            ts.factory.createStringLiteral(
              `${className}${capitalizeFirstLetter(methodName)}`
            )
          ),
        ],
        ts.NodeFlags.Const
      )
    ),
    // Custom hook
    ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(customHookName),
            undefined,
            undefined,
            ts.factory.createArrowFunction(
              undefined,
              ts.factory.createNodeArray([
                ts.factory.createTypeParameterDeclaration(
                  undefined,
                  "TQueryKey",
                  queryKeyConstraint,
                  ts.factory.createArrayTypeNode(
                    ts.factory.createKeywordTypeNode(
                      ts.SyntaxKind.UnknownKeyword
                    )
                  )
                ),
                responseDataType,
                ts.factory.createTypeParameterDeclaration(
                  undefined,
                  "TError",
                  undefined,
                  ts.factory.createKeywordTypeNode(
                    ts.SyntaxKind.UnknownKeyword
                  )
                ),
              ]),
              [
                ...requestParam,
                ts.factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  ts.factory.createIdentifier("queryKey"),
                  ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                  queryKeyGenericType
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
                          awaitedResponseDataType,
                          ts.factory.createKeywordTypeNode(
                            ts.SyntaxKind.UnknownKeyword
                          ),
                          awaitedResponseDataType,
                          ts.factory.createArrayTypeNode(
                            ts.factory.createKeywordTypeNode(
                              ts.SyntaxKind.UnknownKeyword
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
                  )
                ),
              ],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              ts.factory.createAsExpression(
                ts.factory.createCallExpression(
                  ts.factory.createIdentifier("useQuery"),
                  undefined,
                  [
                    ts.factory.createObjectLiteralExpression([
                      ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier("queryKey"),
                        ts.factory.createArrayLiteralExpression(
                          [
                            ts.factory.createIdentifier(queryKey),
                            ts.factory.createSpreadElement(
                              ts.factory.createParenthesizedExpression(
                                ts.factory.createBinaryExpression(
                                  ts.factory.createIdentifier("queryKey"),
                                  ts.factory.createToken(
                                    ts.SyntaxKind.QuestionQuestionToken
                                  ),
                                  method.parameters.length
                                    ? ts.factory.createArrayLiteralExpression([
                                        ts.factory.createObjectLiteralExpression(
                                          method.parameters.map((param) =>
                                            ts.factory.createShorthandPropertyAssignment(
                                              ts.factory.createIdentifier(
                                                param.name.getText(node)
                                              )
                                            )
                                          )
                                        ),
                                      ])
                                    : ts.factory.createArrayLiteralExpression([])
                                )
                              )
                            ),
                          ],
                          false
                        )
                      ),
                      ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier("queryFn"),
                        ts.factory.createArrowFunction(
                          undefined,
                          undefined,
                          [],
                          undefined,
                          ts.factory.createToken(
                            ts.SyntaxKind.EqualsGreaterThanToken
                          ),
                          ts.factory.createCallExpression(
                            ts.factory.createPropertyAccessExpression(
                              ts.factory.createIdentifier(className),
                              ts.factory.createIdentifier(methodName)
                            ),
                            undefined,
                            method.parameters.map((param) =>
                              ts.factory.createIdentifier(
                                param.name.getText(node)
                              )
                            )
                          )
                        )
                      ),
                      ts.factory.createSpreadAssignment(
                        ts.factory.createIdentifier("options")
                      ),
                    ]),
                  ]
                ),
              // Omit<UseQueryResult<Awaited<ReturnType<typeof myClass.myMethod>>, TError>, 'data'> & { data: TData };
              ts.factory.createIntersectionTypeNode([
                ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier("Omit"),
                  [
                    ts.factory.createTypeReferenceNode(
                      ts.factory.createIdentifier("UseQueryResult"),
                      [
                        awaitedResponseDataType,
                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("TError"),
                          undefined
                        ),
                      ]
                    ),
                    ts.factory.createLiteralTypeNode(
                      ts.factory.createStringLiteral("data")
                    ),
                  ]
                ),
                ts.factory.createTypeLiteralNode([
                  ts.factory.createPropertySignature(
                    undefined,
                    ts.factory.createIdentifier("data"),
                    undefined,
                    ts.factory.createTypeReferenceNode(
                      ts.factory.createIdentifier("TData"),
                      undefined
                    )
                  ),
                ]),
              ])
              )
            )
          ),
        ],
        ts.NodeFlags.Const
      )
    ),
  ];
};
