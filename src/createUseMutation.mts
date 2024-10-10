import ts from "typescript";
import {
  BuildCommonTypeName,
  EqualsOrGreaterThanToken,
  type FunctionDescription,
  TContext,
  TData,
  TError,
  capitalizeFirstLetter,
  getNameFromVariable,
  getVariableArrowFunctionParameters,
} from "./common.mjs";
import { addJSDocToNode } from "./util.mjs";

/**
 *  Awaited<ReturnType<typeof myClass.myMethod>>
 */
function generateAwaitedReturnType({ methodName }: { methodName: string }) {
  return ts.factory.createTypeReferenceNode(
    ts.factory.createIdentifier("Awaited"),
    [
      ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier("ReturnType"),
        [
          ts.factory.createTypeQueryNode(
            ts.factory.createIdentifier(methodName),

            undefined,
          ),
        ],
      ),
    ],
  );
}

export const createUseMutation = ({
  method,
  jsDoc,
  modelNames,
}: FunctionDescription & { modelNames: string[] }) => {
  const methodName = getNameFromVariable(method);
  const awaitedResponseDataType = generateAwaitedReturnType({
    methodName,
  });

  const mutationResult = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(
      `${capitalizeFirstLetter(methodName)}MutationResult`,
    ),
    undefined,
    awaitedResponseDataType,
  );

  const responseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TData,
    undefined,
    ts.factory.createTypeReferenceNode(
      BuildCommonTypeName(mutationResult.name),
    ),
  );

  const methodParameters =
    getVariableArrowFunctionParameters(method).length !== 0
      ? ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("Options"),
          [
            ts.factory.createTypeReferenceNode(
              modelNames.includes(`${capitalizeFirstLetter(methodName)}Data`)
                ? `${capitalizeFirstLetter(methodName)}Data`
                : "unknown",
            ),
            ts.factory.createLiteralTypeNode(ts.factory.createTrue()),
          ],
        )
      : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);

  const exportHook = ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(
            `use${capitalizeFirstLetter(methodName)}`,
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
                ts.factory.createTypeReferenceNode(
                  `${capitalizeFirstLetter(methodName)}Error`,
                ),
              ),
              ts.factory.createTypeParameterDeclaration(
                undefined,
                TContext,
                undefined,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
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
                      ],
                    ),
                    ts.factory.createLiteralTypeNode(
                      ts.factory.createStringLiteral("mutationFn"),
                    ),
                  ],
                ),
                undefined,
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
                    // (clientOptions) => addPet(clientOptions).then(response => response.data as TData) as unknown as Promise<TData>
                    ts.factory.createArrowFunction(
                      undefined,
                      undefined,
                      [
                        ts.factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          ts.factory.createIdentifier("clientOptions"),
                          undefined,
                          undefined,
                          undefined,
                        ),
                      ],
                      undefined,
                      EqualsOrGreaterThanToken,
                      ts.factory.createAsExpression(
                        ts.factory.createAsExpression(
                          ts.factory.createCallExpression(
                            ts.factory.createIdentifier(methodName),
                            undefined,
                            getVariableArrowFunctionParameters(method).length >
                              0
                              ? [ts.factory.createIdentifier("clientOptions")]
                              : undefined,
                          ),
                          ts.factory.createKeywordTypeNode(
                            ts.SyntaxKind.UnknownKeyword,
                          ),
                        ),

                        ts.factory.createTypeReferenceNode(
                          ts.factory.createIdentifier("Promise"),
                          [ts.factory.createTypeReferenceNode(TData)],
                        ),
                      ),
                    ),
                  ),
                  ts.factory.createSpreadAssignment(
                    ts.factory.createIdentifier("options"),
                  ),
                ]),
              ],
            ),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );

  const hookWithJsDoc = addJSDocToNode(exportHook, jsDoc);

  return {
    mutationResult,
    mutationHook: hookWithJsDoc,
  };
};
