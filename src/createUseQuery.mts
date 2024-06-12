import type { MethodDeclaration, VariableDeclaration } from "ts-morph";
import ts from "typescript";
import {
  BuildCommonTypeName,
  EqualsOrGreaterThanToken,
  QuestionToken,
  TData,
  TError,
  capitalizeFirstLetter,
  extractPropertiesFromObjectParam,
  getNameFromVariable,
  getShortType,
  getVariableArrowFunctionParameters,
  queryKeyConstraint,
  queryKeyGenericType,
} from "./common.mjs";
import type { FunctionDescription } from "./common.mjs";
import { addJSDocToNode } from "./util.mjs";

export const createApiResponseType = ({
  methodName,
}: {
  methodName: string;
}) => {
  /** Awaited<ReturnType<typeof myClass.myMethod>> */
  const awaitedResponseDataType = ts.factory.createTypeReferenceNode(
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
  /** DefaultResponseDataType
   * export type MyClassMethodDefaultResponse = Awaited<ReturnType<typeof myClass.myMethod>>
   */
  const apiResponse = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(
      `${capitalizeFirstLetter(methodName)}DefaultResponse`,
    ),
    undefined,
    awaitedResponseDataType,
  );

  const responseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TData.text,
    undefined,
    ts.factory.createTypeReferenceNode(BuildCommonTypeName(apiResponse.name)),
  );

  return {
    /**
     * DefaultResponseDataType
     *
     * export type MyClassMethodDefaultResponse = Awaited<ReturnType<typeof myClass.myMethod>>
     */
    apiResponse,
    /**
     * This will be the name of the type of the response type of the method
     *
     * MyClassMethodDefaultResponse
     */
    responseDataType,
  };
};

export function getRequestParamFromMethod(method: VariableDeclaration) {
  if (!getVariableArrowFunctionParameters(method).length) {
    return null;
  }

  const params = getVariableArrowFunctionParameters(method).flatMap((param) => {
    const paramNodes = extractPropertiesFromObjectParam(param);
    return paramNodes.map((refParam) => ({
      name: refParam.name,
      typeName: getShortType(refParam.type.getText()),
      optional: refParam.optional,
    }));
  });

  const areAllPropertiesOptional = params.every((param) => param.optional);

  return ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createObjectBindingPattern(
      params.map((refParam) =>
        ts.factory.createBindingElement(
          undefined,
          undefined,
          ts.factory.createIdentifier(refParam.name),
          undefined,
        ),
      ),
    ),
    undefined,
    ts.factory.createTypeLiteralNode(
      params.map((refParam) => {
        return ts.factory.createPropertySignature(
          undefined,
          ts.factory.createIdentifier(refParam.name),
          refParam.optional
            ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
            : undefined,
          ts.factory.createTypeReferenceNode(refParam.typeName),
        );
      }),
    ),
    // if all params are optional, we create an empty object literal
    // so the hook can be called without any parameters
    areAllPropertiesOptional
      ? ts.factory.createObjectLiteralExpression()
      : undefined,
  );
}

/**
 * Return Type
 *
 * export const classNameMethodNameQueryResult<TData = MyClassMethodDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
 */
export function createReturnTypeExport({
  methodName,
  defaultApiResponse,
}: {
  methodName: string;
  defaultApiResponse: ts.TypeAliasDeclaration;
}) {
  return ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(
      `${capitalizeFirstLetter(methodName)}QueryResult`,
    ),
    [
      ts.factory.createTypeParameterDeclaration(
        undefined,
        TData,
        undefined,
        ts.factory.createTypeReferenceNode(defaultApiResponse.name),
      ),
      ts.factory.createTypeParameterDeclaration(
        undefined,
        TError,
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
      ),
    ],
    ts.factory.createTypeReferenceNode(
      ts.factory.createIdentifier("UseQueryResult"),
      [
        ts.factory.createTypeReferenceNode(TData),
        ts.factory.createTypeReferenceNode(TError),
      ],
    ),
  );
}

/**
 * QueryKey
 */
export function createQueryKeyExport({
  methodName,
  queryKey,
}: {
  methodName: string;
  queryKey: string;
}) {
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(queryKey),
          undefined,
          undefined,
          ts.factory.createStringLiteral(
            `${capitalizeFirstLetter(methodName)}`,
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

export function hookNameFromMethod({
  method,
}: {
  method: VariableDeclaration;
}) {
  const methodName = getNameFromVariable(method);
  return `use${capitalizeFirstLetter(methodName)}`;
}

export function createQueryKeyFromMethod({
  method,
}: {
  method: VariableDeclaration;
}) {
  const customHookName = hookNameFromMethod({ method });
  const queryKey = `${customHookName}Key`;
  return queryKey;
}

/**
 * Creates a custom hook for a query
 * @param queryString The type of query to use from react-query
 * @param suffix The suffix to append to the hook name
 */
export function createQueryHook({
  queryString,
  suffix,
  responseDataType,
  requestParams,
  method,
}: {
  queryString: "useSuspenseQuery" | "useQuery";
  suffix: string;
  responseDataType: ts.TypeParameterDeclaration;
  requestParams: ts.ParameterDeclaration[];
  method: VariableDeclaration;
}) {
  const methodName = getNameFromVariable(method);
  const customHookName = hookNameFromMethod({ method });
  const queryKey = createQueryKeyFromMethod({ method });

  const hookExport = ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(`${customHookName}${suffix}`),
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
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
              ),
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
            ]),
            [
              ...requestParams,
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                ts.factory.createIdentifier("queryKey"),
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
                      ts.factory.createIdentifier("UseQueryOptions"),
                      [
                        ts.factory.createTypeReferenceNode(TData),
                        ts.factory.createTypeReferenceNode(TError),
                      ],
                    ),
                    ts.factory.createUnionTypeNode([
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("queryKey"),
                      ),
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("queryFn"),
                      ),
                    ]),
                  ],
                ),
              ),
            ],
            undefined,
            EqualsOrGreaterThanToken,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier(queryString),
              [
                ts.factory.createTypeReferenceNode(TData),
                ts.factory.createTypeReferenceNode(TError),
              ],
              [
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("queryKey"),
                    ts.factory.createCallExpression(
                      BuildCommonTypeName(getQueryKeyFnName(queryKey)),
                      undefined,

                      getVariableArrowFunctionParameters(method).length
                        ? [
                            ts.factory.createObjectLiteralExpression(
                              getVariableArrowFunctionParameters(
                                method,
                              ).flatMap((param) =>
                                extractPropertiesFromObjectParam(param).map(
                                  (p) =>
                                    ts.factory.createShorthandPropertyAssignment(
                                      ts.factory.createIdentifier(p.name),
                                    ),
                                ),
                              ),
                            ),
                            ts.factory.createIdentifier("queryKey"),
                          ]
                        : [ts.factory.createIdentifier("queryKey")],
                    ),
                  ),
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("queryFn"),
                    ts.factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      EqualsOrGreaterThanToken,
                      ts.factory.createAsExpression(
                        ts.factory.createCallExpression(
                          ts.factory.createIdentifier(methodName),
                          undefined,
                          getVariableArrowFunctionParameters(method).length
                            ? [
                                ts.factory.createObjectLiteralExpression(
                                  getVariableArrowFunctionParameters(
                                    method,
                                  ).flatMap((param) =>
                                    extractPropertiesFromObjectParam(param).map(
                                      (p) =>
                                        ts.factory.createShorthandPropertyAssignment(
                                          ts.factory.createIdentifier(p.name),
                                        ),
                                    ),
                                  ),
                                ),
                              ]
                            : undefined,
                        ),
                        ts.factory.createTypeReferenceNode(TData),
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
  return hookExport;
}

export const createUseQuery = ({ method, jsDoc }: FunctionDescription) => {
  const methodName = getNameFromVariable(method);
  const queryKey = createQueryKeyFromMethod({ method });
  const { apiResponse: defaultApiResponse, responseDataType } =
    createApiResponseType({
      methodName,
    });

  const requestParam = getRequestParamFromMethod(method);

  const requestParams = requestParam ? [requestParam] : [];

  const queryHook = createQueryHook({
    queryString: "useQuery",
    suffix: "",
    responseDataType,
    requestParams,
    method,
  });
  const suspenseQueryHook = createQueryHook({
    queryString: "useSuspenseQuery",
    suffix: "Suspense",
    responseDataType,
    requestParams,
    method,
  });

  const hookWithJsDoc = addJSDocToNode(queryHook, jsDoc);
  const suspenseHookWithJsDoc = addJSDocToNode(suspenseQueryHook, jsDoc);

  const returnTypeExport = createReturnTypeExport({
    methodName,
    defaultApiResponse,
  });

  const queryKeyExport = createQueryKeyExport({
    methodName,
    queryKey,
  });

  const queryKeyFn = createQueryKeyFnExport(queryKey, method);

  return {
    apiResponse: defaultApiResponse,
    returnType: returnTypeExport,
    key: queryKeyExport,
    queryHook: hookWithJsDoc,
    suspenseQueryHook: suspenseHookWithJsDoc,
    queryKeyFn,
  };
};

export function getQueryKeyFnName(queryKey: string) {
  return `${capitalizeFirstLetter(queryKey)}Fn`;
}

function createQueryKeyFnExport(queryKey: string, method: VariableDeclaration) {
  const params = getRequestParamFromMethod(method);

  // override key is used to allow the user to override the the queryKey values
  const overrideKey = ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier("queryKey"),
    QuestionToken,
    ts.factory.createTypeReferenceNode("Array<unknown>", []),
  );

  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(getQueryKeyFnName(queryKey)),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            params ? [params, overrideKey] : [overrideKey],
            undefined,
            EqualsOrGreaterThanToken,
            queryKeyFn(queryKey, method),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

function queryKeyFn(
  queryKey: string,
  method: VariableDeclaration,
): ts.Expression {
  return ts.factory.createArrayLiteralExpression(
    [
      ts.factory.createIdentifier(queryKey),
      ts.factory.createSpreadElement(
        ts.factory.createParenthesizedExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier("queryKey"),
            ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
            getVariableArrowFunctionParameters(method)
              ? ts.factory.createArrayLiteralExpression([
                  ts.factory.createObjectLiteralExpression(
                    getVariableArrowFunctionParameters(method).flatMap(
                      (param) =>
                        extractPropertiesFromObjectParam(param).map((p) =>
                          ts.factory.createShorthandPropertyAssignment(
                            ts.factory.createIdentifier(p.name),
                          ),
                        ),
                    ),
                  ),
                ])
              : ts.factory.createArrayLiteralExpression([]),
          ),
        ),
      ),
    ],
    false,
  );
}
