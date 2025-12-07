import type { UserConfig } from "@hey-api/openapi-ts";
import type { VariableDeclaration } from "ts-morph";
import ts from "typescript";
import {
  BuildCommonTypeName,
  EqualsOrGreaterThanToken,
  TData,
  TError,
  capitalizeFirstLetter,
  createQueryKeyExport,
  createQueryKeyFnExport,
  getNameFromVariable,
  getQueryKeyFnName,
  getRequestParamFromMethod,
  getVariableArrowFunctionParameters,
  queryKeyConstraint,
  queryKeyGenericType,
} from "./common.mjs";
import type { FunctionDescription } from "./common.mjs";
import { addJSDocToNode } from "./util.mjs";

const createApiResponseType = ({
  methodName,
  client,
}: {
  methodName: string;
  client: UserConfig["client"];
}) => {
  /** Awaited<ReturnType<typeof myClass.myMethod>> */
  const awaitedResponseDataType = ts.factory.createIndexedAccessTypeNode(
    ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Awaited"), [
      ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier("ReturnType"),
        [
          ts.factory.createTypeQueryNode(
            ts.factory.createIdentifier(methodName),
            undefined,
          ),
        ],
      ),
    ]),
    ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("data")),
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

  // Response data type for suspense - wrap with NonNullable to exclude undefined
  const suspenseResponseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TData.text,
    undefined,
    ts.factory.createTypeReferenceNode(
      ts.factory.createIdentifier("NonNullable"),
      [
        ts.factory.createTypeReferenceNode(
          BuildCommonTypeName(apiResponse.name),
        ),
      ],
    ),
  );

  const responseErrorType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TError.text,
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
    /**
     * ResponseDataType for suspense - wrap with NonNullable to exclude undefined
     *
     * NonNullable<MyClassMethodDefaultResponse>
     */
    suspenseResponseDataType,
    /**
     * ErrorDataType
     *
     * MyClassMethodError
     */
    responseErrorType,
  };
};

/**
 * Return Type
 *
 * export const classNameMethodNameQueryResult<TData = MyClassMethodDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
 */
function createReturnTypeExport({
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
function createQueryHook({
  queryString,
  suffix,
  responseDataType,
  responseErrorType,
  requestParams,
  method,
  pageParam,
  nextPageParam,
  initialPageParam,
}: {
  queryString: "useSuspenseQuery" | "useQuery" | "useInfiniteQuery";
  suffix: string;
  responseDataType: ts.TypeParameterDeclaration;
  responseErrorType: ts.TypeParameterDeclaration;
  requestParams: ts.ParameterDeclaration[];
  method: VariableDeclaration;
  pageParam?: string;
  nextPageParam?: string;
  initialPageParam?: string;
}) {
  const methodName = getNameFromVariable(method);
  const customHookName = hookNameFromMethod({ method });
  const queryKey = createQueryKeyFromMethod({ method });

  if (
    queryString === "useInfiniteQuery" &&
    (pageParam === undefined || nextPageParam === undefined)
  ) {
    throw new Error(
      "pageParam and nextPageParam are required for infinite queries",
    );
  }

  const isInfiniteQuery = queryString === "useInfiniteQuery";
  const isSuspenseQuery = queryString === "useSuspenseQuery";

  const responseDataTypeRef = responseDataType.default as ts.TypeReferenceNode;
  const responseDataTypeIdentifier =
    responseDataTypeRef.typeName as ts.Identifier;

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
              isInfiniteQuery
                ? ts.factory.createTypeParameterDeclaration(
                    undefined,
                    TData,
                    undefined,
                    ts.factory.createTypeReferenceNode(
                      ts.factory.createIdentifier("InfiniteData"),
                      [
                        ts.factory.createTypeReferenceNode(
                          responseDataTypeIdentifier,
                        ),
                      ],
                    ),
                  )
                : responseDataType,
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
                      ts.factory.createIdentifier(
                        isInfiniteQuery
                          ? "UseInfiniteQueryOptions"
                          : isSuspenseQuery
                            ? "UseSuspenseQueryOptions"
                            : "UseQueryOptions",
                      ),
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
              isInfiniteQuery
                ? []
                : [
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
                      [
                        ts.factory.createIdentifier("clientOptions"),
                        ts.factory.createIdentifier("queryKey"),
                      ],
                    ),
                  ),
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("queryFn"),
                    ts.factory.createArrowFunction(
                      undefined,
                      undefined,
                      isInfiniteQuery
                        ? [
                            ts.factory.createParameterDeclaration(
                              undefined,
                              undefined,
                              ts.factory.createObjectBindingPattern([
                                ts.factory.createBindingElement(
                                  undefined,
                                  undefined,
                                  ts.factory.createIdentifier("pageParam"),
                                  undefined,
                                ),
                              ]),
                              undefined,
                              undefined,
                            ),
                          ]
                        : [],
                      undefined,
                      EqualsOrGreaterThanToken,
                      ts.factory.createAsExpression(
                        ts.factory.createCallExpression(
                          ts.factory.createPropertyAccessExpression(
                            ts.factory.createCallExpression(
                              ts.factory.createIdentifier(methodName),
                              undefined,
                              pageParam && isInfiniteQuery
                                ? [
                                    // { ...clientOptions, query: { ...clientOptions.query, page: pageParam as number } }
                                    ts.factory.createObjectLiteralExpression([
                                      ts.factory.createSpreadAssignment(
                                        ts.factory.createIdentifier(
                                          "clientOptions",
                                        ),
                                      ),
                                      ts.factory.createPropertyAssignment(
                                        ts.factory.createIdentifier("query"),
                                        ts.factory.createObjectLiteralExpression(
                                          [
                                            ts.factory.createSpreadAssignment(
                                              ts.factory.createPropertyAccessExpression(
                                                ts.factory.createIdentifier(
                                                  "clientOptions",
                                                ),
                                                ts.factory.createIdentifier(
                                                  "query",
                                                ),
                                              ),
                                            ),
                                            ts.factory.createPropertyAssignment(
                                              ts.factory.createIdentifier(
                                                pageParam,
                                              ),
                                              ts.factory.createAsExpression(
                                                ts.factory.createIdentifier(
                                                  "pageParam",
                                                ),
                                                ts.factory.createKeywordTypeNode(
                                                  ts.SyntaxKind.NumberKeyword,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ]),
                                  ]
                                : // { ...clientOptions }
                                  getVariableArrowFunctionParameters(method)
                                      .length > 0
                                  ? [
                                      ts.factory.createObjectLiteralExpression([
                                        ts.factory.createSpreadAssignment(
                                          ts.factory.createIdentifier(
                                            "clientOptions",
                                          ),
                                        ),
                                      ]),
                                    ]
                                  : undefined,
                            ),
                            ts.factory.createIdentifier("then"),
                          ),
                          undefined,
                          [
                            ts.factory.createArrowFunction(
                              undefined,
                              undefined,
                              [
                                ts.factory.createParameterDeclaration(
                                  undefined,
                                  undefined,
                                  ts.factory.createIdentifier("response"),
                                  undefined,
                                  undefined,
                                  undefined,
                                ),
                              ],
                              undefined,
                              EqualsOrGreaterThanToken,
                              ts.factory.createAsExpression(
                                ts.factory.createPropertyAccessExpression(
                                  ts.factory.createIdentifier("response"),
                                  ts.factory.createIdentifier("data"),
                                ),
                                ts.factory.createTypeReferenceNode(TData),
                              ),
                            ),
                          ],
                        ),
                        ts.factory.createTypeReferenceNode(TData),
                      ),
                    ),
                  ),
                  ...createInfiniteQueryParams(
                    pageParam,
                    nextPageParam,
                    initialPageParam,
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

export const createUseQuery = ({
  functionDescription: { method, jsDoc },
  client,
  pageParam,
  nextPageParam,
  initialPageParam,
  paginatableMethods,
  modelNames,
}: {
  functionDescription: FunctionDescription;
  client: UserConfig["client"];
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string;
  paginatableMethods: string[];
  modelNames: string[];
}) => {
  const methodName = getNameFromVariable(method);
  const queryKey = createQueryKeyFromMethod({ method });
  const {
    apiResponse: defaultApiResponse,
    responseDataType,
    suspenseResponseDataType,
    responseErrorType,
  } = createApiResponseType({
    methodName,
    client,
  });

  const requestParam = getRequestParamFromMethod(method, undefined, modelNames);
  const infiniteRequestParam = getRequestParamFromMethod(
    method,
    pageParam,
    modelNames,
  );

  const requestParams = requestParam ? [requestParam] : [];

  const queryHook = createQueryHook({
    queryString: "useQuery",
    suffix: "",
    responseDataType,
    responseErrorType,
    requestParams,
    method,
  });

  const suspenseQueryHook = createQueryHook({
    queryString: "useSuspenseQuery",
    suffix: "Suspense",
    responseDataType: suspenseResponseDataType,
    responseErrorType,
    requestParams,
    method,
  });
  const isInfiniteQuery = paginatableMethods.includes(methodName);

  const infiniteQueryHook = isInfiniteQuery
    ? createQueryHook({
        queryString: "useInfiniteQuery",
        suffix: "Infinite",
        responseDataType,
        responseErrorType,
        requestParams: infiniteRequestParam ? [infiniteRequestParam] : [],
        method,
        pageParam,
        nextPageParam,
        initialPageParam,
      })
    : undefined;

  const hookWithJsDoc = addJSDocToNode(queryHook, jsDoc);
  const suspenseHookWithJsDoc = addJSDocToNode(suspenseQueryHook, jsDoc);
  const infiniteHookWithJsDoc = infiniteQueryHook
    ? addJSDocToNode(infiniteQueryHook, jsDoc)
    : undefined;

  const returnTypeExport = createReturnTypeExport({
    methodName,
    defaultApiResponse,
  });

  const queryKeyExport = createQueryKeyExport({
    methodName,
    queryKey,
  });

  const queryKeyFn = createQueryKeyFnExport(
    queryKey,
    method,
    "query",
    modelNames,
  );

  return {
    apiResponse: defaultApiResponse,
    returnType: returnTypeExport,
    key: queryKeyExport,
    queryHook: hookWithJsDoc,
    suspenseQueryHook: suspenseHookWithJsDoc,
    infiniteQueryHook: infiniteHookWithJsDoc,
    queryKeyFn,
  };
};

function createInfiniteQueryParams(
  pageParam?: string,
  nextPageParam?: string,
  initialPageParam = "1",
) {
  if (pageParam === undefined || nextPageParam === undefined) {
    return [];
  }
  return [
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier("initialPageParam"),
      ts.factory.createStringLiteral(initialPageParam),
    ),
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier("getNextPageParam"),
      // (response) => (response as { nextPage: number }).nextPage,
      ts.factory.createArrowFunction(
        undefined,
        undefined,
        [
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ts.factory.createIdentifier("response"),
            undefined,
            undefined,
          ),
        ],
        undefined,
        EqualsOrGreaterThanToken,
        ts.factory.createPropertyAccessExpression(
          ts.factory.createParenthesizedExpression(
            ts.factory.createAsExpression(
              ts.factory.createIdentifier("response"),
              nextPageParam.split(".").reduceRight((acc, segment) => {
                return ts.factory.createTypeLiteralNode([
                  ts.factory.createPropertySignature(
                    undefined,
                    ts.factory.createIdentifier(segment),
                    undefined,
                    acc,
                  ),
                ]);
              }, ts.factory.createKeywordTypeNode(
                ts.SyntaxKind.NumberKeyword,
              ) as ts.TypeNode),
            ),
          ),
          ts.factory.createIdentifier(nextPageParam),
        ),
      ),
    ),
  ];
}
