import ts from "typescript";
import { capitalizeFirstLetter } from "./common";
import { addJSDocToNode } from "./util";

export const createUseMutation = (
  node: ts.SourceFile,
  className: string,
  method: ts.MethodDeclaration,
  jsDoc: (string | ts.NodeArray<ts.JSDocComment> | undefined)[] = [],
  deprecated: boolean = false
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

  const TData = ts.factory.createIdentifier("TData");
  const TError = ts.factory.createIdentifier("TError");
  const TContext = ts.factory.createIdentifier("TContext");

  const mutationResult = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(`${className}${methodName}MutationResult`),
    undefined,
    awaitedResponseDataType
  );

  const responseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TData,
    undefined,
    ts.factory.createTypeReferenceNode(mutationResult.name)
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

  const exportHook = ts.factory.createVariableStatement(
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
                TError,
                undefined,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
              ),
              ts.factory.createTypeParameterDeclaration(
                undefined,
                TContext,
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
                        ts.factory.createTypeReferenceNode(TData),
                        ts.factory.createTypeReferenceNode(TError),
                        methodParameters,
                        ts.factory.createTypeReferenceNode(TContext),
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
              [
                ts.factory.createTypeReferenceNode(TData),
                ts.factory.createTypeReferenceNode(TError),
                methodParameters,
                ts.factory.createTypeReferenceNode(TContext),
              ],
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
                      ts.factory.createAsExpression(
                        ts.factory.createAsExpression(
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
                          ),
                          ts.factory.createKeywordTypeNode(
                            ts.SyntaxKind.UnknownKeyword
                          )
                        ),

                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("Promise"),
                          [ts.factory.createTypeReferenceNode(TData)]
                        )
                      )
                    )
                  ),
                  ts.factory.createSpreadAssignment(
                    ts.factory.createIdentifier("options")
                  ),
                ]),
              ]
            )
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  );

  const hookWithJsDoc = addJSDocToNode(exportHook, node, deprecated, jsDoc);

  return [mutationResult, hookWithJsDoc];
};
