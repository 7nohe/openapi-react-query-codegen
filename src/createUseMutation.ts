import ts from "typescript";
import { capitalizeFirstLetter } from "./common";

export const createUseMutation = (
  node: ts.SourceFile,
  className: string,
  method: ts.MethodDeclaration
) => {
  const methodName = method.name?.getText(node)!;
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

  const methodParameters =
    method.parameters.length !== 0
      ? ts.factory.createTypeLiteralNode(
          method.parameters.map((param) => {
            return ts.factory.createPropertySignature(
              undefined,
              ts.factory.createIdentifier(param.name.getText(node)),
              param.questionToken ?? param.initializer
                ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
                : param.questionToken,
              param.type
            );
          })
        )
      : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);

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
            ts.factory.createNodeArray([
              responseDataType,
              ts.factory.createTypeParameterDeclaration(
                undefined,
                "TError",
                undefined,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
              ),
              ts.factory.createTypeParameterDeclaration(
                undefined,
                "TContext",
                undefined,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
              ),
            ]),
            [
              ts.factory.createParameterDeclaration(
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
                        awaitedResponseDataType,
                        ts.factory.createKeywordTypeNode(
                          ts.SyntaxKind.UnknownKeyword
                        ),
                        methodParameters,
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
            ts.factory.createAsExpression(
              ts.factory.createCallExpression(
                ts.factory.createIdentifier("useMutation"),
                undefined,
                [
                  ts.factory.createObjectLiteralExpression([
                    ts.factory.createPropertyAssignment(
                      ts.factory.createIdentifier("mutationFn"),
                      ts.factory.createArrowFunction(
                        undefined,
                        undefined,
                        method.parameters.length !== 0
                          ? [
                              ts.factory.createParameterDeclaration(
                                undefined,
                                undefined,
                                ts.factory.createObjectBindingPattern(
                                  method.parameters.map((param) => {
                                    return ts.factory.createBindingElement(
                                      undefined,
                                      undefined,
                                      ts.factory.createIdentifier(
                                        param.name.getText(node)
                                      ),
                                      undefined
                                    );
                                  })
                                ),
                                undefined,
                                undefined,
                                undefined
                              ),
                            ]
                          : [],
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
                          method.parameters.map((params) =>
                            ts.factory.createIdentifier(
                              params.name.getText(node)
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
              // Omit<UseMutationResult<Awaited<ReturnType<typeof myClass.myMethod>>, TError, params, TContext>, 'data'> & { data: TData };
              ts.factory.createIntersectionTypeNode([
                ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier("Omit"),
                  [
                    ts.factory.createTypeReferenceNode(
                      ts.factory.createIdentifier("UseMutationResult"),
                      [
                        awaitedResponseDataType,
                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("TError"),
                          undefined
                        ),
                        methodParameters,
                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("TContext"),
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
  );
};
