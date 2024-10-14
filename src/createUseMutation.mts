import type { UserConfig } from "@hey-api/openapi-ts";
import ts from "typescript";
import {
  BuildCommonTypeName,
  EqualsOrGreaterThanToken,
  type FunctionDescription,
  TContext,
  TData,
  TError,
  capitalizeFirstLetter,
  createQueryKeyExport,
  createQueryKeyFnExport,
  getNameFromVariable,
  getQueryKeyFnName,
  getVariableArrowFunctionParameters,
  queryKeyConstraint,
  queryKeyGenericType,
} from "./common.mjs";
import { createQueryKeyFromMethod } from "./createUseQuery.mjs";
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
  functionDescription: { method, jsDoc },
  modelNames,
  client,
}: {
  functionDescription: FunctionDescription;
  modelNames: string[];
  client: UserConfig["client"];
}) => {
  const methodName = getNameFromVariable(method);
  const mutationKey = createQueryKeyFromMethod({ method });
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

  // `TData = Common.AddPetMutationResult`
  const responseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TData,
    undefined,
    ts.factory.createTypeReferenceNode(
      BuildCommonTypeName(mutationResult.name),
    ),
  );

  // @hey-api/client-axios -> `TError = AxiosError<AddPetError>`
  // @hey-api/client-fetch -> `TError = AddPetError`
  const responseErrorType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TError,
    undefined,
    client === "@hey-api/client-axios"
      ? ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("AxiosError"),
          [
            ts.factory.createTypeReferenceNode(
              ts.factory.createIdentifier(
                `${capitalizeFirstLetter(methodName)}Error`,
              ),
            ),
          ],
        )
      : ts.factory.createTypeReferenceNode(
          `${capitalizeFirstLetter(methodName)}Error`,
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
              responseErrorType,
              ts.factory.createTypeParameterDeclaration(
                undefined,
                "TQueryKey",
                queryKeyConstraint,
                ts.factory.createArrayTypeNode(
                  ts.factory.createKeywordTypeNode(
                    ts.SyntaxKind.UnknownKeyword,
                  ),
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
                ts.factory.createIdentifier("mutationKey"),
                ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                queryKeyGenericType,
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
                      ts.factory.createIdentifier("UseMutationOptions"),
                      [
                        ts.factory.createTypeReferenceNode(TData),
                        ts.factory.createTypeReferenceNode(TError),
                        methodParameters,
                        ts.factory.createTypeReferenceNode(TContext),
                      ],
                    ),
                    ts.factory.createUnionTypeNode([
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("mutationKey"),
                      ),
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("mutationFn"),
                      ),
                    ]),
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
                    ts.factory.createIdentifier("mutationKey"),
                    ts.factory.createCallExpression(
                      BuildCommonTypeName(getQueryKeyFnName(mutationKey)),
                      undefined,
                      [ts.factory.createIdentifier("mutationKey")],
                    ),
                  ),
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

  const mutationKeyExport = createQueryKeyExport({
    methodName,
    queryKey: mutationKey,
  });

  const mutationKeyFn = createQueryKeyFnExport(mutationKey, method, "mutation");

  return {
    mutationResult,
    key: mutationKeyExport,
    mutationHook: hookWithJsDoc,
    mutationKeyFn,
  };
};
