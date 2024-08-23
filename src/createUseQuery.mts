import type { MethodDeclaration } from "ts-morph";
import ts from "typescript";
import {
  BuildCommonTypeName,
  EqualsOrGreaterThanToken,
  QuestionToken,
  TData,
  TError,
  capitalizeFirstLetter,
  extractPropertiesFromObjectParam,
  getNameFromMethod,
  getShortType,
  queryKeyConstraint,
  queryKeyGenericType,
} from "./common.mjs";
import type { MethodDescription } from "./common.mjs";
import { addJSDocToNode } from "./util.mjs";

export const createApiResponseType = ({
  className,
  methodName,
}: { className: string; methodName: string }) => {
  /** Awaited<ReturnType<typeof myClass.myMethod>> */
  const awaitedResponseDataType = ts.factory.createTypeReferenceNode(
    ts.factory.createIdentifier("Awaited"),
    [
      ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier("ReturnType"),
        [
          ts.factory.createTypeQueryNode(
            ts.factory.createQualifiedName(
              ts.factory.createIdentifier(className),
              ts.factory.createIdentifier(methodName),
            ),
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
      `${capitalizeFirstLetter(className)}${capitalizeFirstLetter(methodName)}DefaultResponse`,
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

export function getRequestParamFromMethod(
  method: MethodDeclaration,
  pageParam?: string,
) {
  if (!method.getParameters().length) {
    return null;
  }

  const params = method.getParameters().flatMap((param) => {
    const paramNodes = extractPropertiesFromObjectParam(param);

    return paramNodes
      .filter((p) => p.name !== pageParam)
      .map((refParam) => ({
        name: refParam.name,
        typeName: getShortType(refParam.type?.getText() ?? ""),
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
  className,
  methodName,
  defaultApiResponse,
}: {
  className: string;
  methodName: string;
  defaultApiResponse: ts.TypeAliasDeclaration;
}) {
  return ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(
      `${capitalizeFirstLetter(className)}${capitalizeFirstLetter(methodName)}QueryResult`,
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
  className,
  methodName,
  queryKey,
}: { className: string; methodName: string; queryKey: string }) {
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(queryKey),
          undefined,
          undefined,
          ts.factory.createStringLiteral(
            `${className}${capitalizeFirstLetter(methodName)}`,
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

export function hookNameFromMethod({
  method,
  className,
}: { method: MethodDeclaration; className: string }) {
  const methodName = getNameFromMethod(method);
  return `use${className}${capitalizeFirstLetter(methodName)}`;
}

export function createQueryKeyFromMethod({
  method,
  className,
}: { method: MethodDeclaration; className: string }) {
  const customHookName = hookNameFromMethod({ method, className });
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
  className,
  pageParam,
  nextPageParam,
  initialPageParam,
}: {
  queryString: "useSuspenseQuery" | "useQuery" | "useInfiniteQuery";
  suffix: string;
  responseDataType: ts.TypeParameterDeclaration;
  requestParams: ts.ParameterDeclaration[];
  method: MethodDeclaration;
  className: string;
  pageParam?: string;
  nextPageParam?: string;
  initialPageParam?: string;
}) {
  const methodName = getNameFromMethod(method);
  const customHookName = hookNameFromMethod({ method, className });
  const queryKey = createQueryKeyFromMethod({ method, className });

  if (
    queryString === "useInfiniteQuery" &&
    (pageParam === undefined || nextPageParam === undefined)
  ) {
    throw new Error(
      "pageParam and nextPageParam are required for infinite queries",
    );
  }

  const isInfiniteQuery = queryString === "useInfiniteQuery";

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
                      ts.factory.createIdentifier(
                        isInfiniteQuery
                          ? "UseInfiniteQueryOptions"
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

                      method.getParameters().length
                        ? [
                            ts.factory.createObjectLiteralExpression(
                              method.getParameters().flatMap((param) =>
                                extractPropertiesFromObjectParam(param)
                                  .filter((p) => p.name !== pageParam)
                                  .map((p) =>
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
                            ts.factory.createIdentifier(className),
                            ts.factory.createIdentifier(methodName),
                          ),
                          undefined,
                          method.getParameters().length
                            ? [
                                ts.factory.createObjectLiteralExpression(
                                  method
                                    .getParameters()
                                    .flatMap((param) =>
                                      extractPropertiesFromObjectParam(
                                        param,
                                      ).map((p) =>
                                        p.name === pageParam
                                          ? ts.factory.createPropertyAssignment(
                                              ts.factory.createIdentifier(
                                                p.name,
                                              ),
                                              ts.factory.createAsExpression(
                                                ts.factory.createIdentifier(
                                                  "pageParam",
                                                ),
                                                ts.factory.createKeywordTypeNode(
                                                  ts.SyntaxKind.NumberKeyword,
                                                ),
                                              ),
                                            )
                                          : ts.factory.createShorthandPropertyAssignment(
                                              ts.factory.createIdentifier(
                                                p.name,
                                              ),
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

export const createUseQuery = (
  { className, method, jsDoc }: MethodDescription,
  pageParam: string,
  nextPageParam: string,
  initialPageParam: string,
) => {
  const methodName = getNameFromMethod(method);
  const queryKey = createQueryKeyFromMethod({ method, className });
  const { apiResponse: defaultApiResponse, responseDataType } =
    createApiResponseType({
      className,
      methodName,
    });

  const requestParam = getRequestParamFromMethod(method);
  const infiniteRequestParam = getRequestParamFromMethod(method, pageParam);

  const requestParams = requestParam ? [requestParam] : [];

  const requestParamNames = requestParams
    .filter((p) => p.name.kind === ts.SyntaxKind.ObjectBindingPattern)
    .map((p) => p.name as ts.ObjectBindingPattern);
  const requestParamTexts = requestParamNames
    .at(0)
    ?.elements.filter((e) => e.name.kind === ts.SyntaxKind.Identifier)
    .map((e) => (e.name as ts.Identifier).escapedText as string);

  const queryHook = createQueryHook({
    queryString: "useQuery",
    suffix: "",
    responseDataType,
    requestParams,
    method,
    className,
  });

  const suspenseQueryHook = createQueryHook({
    queryString: "useSuspenseQuery",
    suffix: "Suspense",
    responseDataType,
    requestParams,
    method,
    className,
  });
  const isInfiniteQuery = requestParamTexts?.includes(pageParam) ?? false;
  const infiniteQueryHook = isInfiniteQuery
    ? createQueryHook({
        queryString: "useInfiniteQuery",
        suffix: "Infinite",
        responseDataType,
        requestParams: infiniteRequestParam ? [infiniteRequestParam] : [],
        method,
        className,
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
    className,
    methodName,
    defaultApiResponse,
  });

  const queryKeyExport = createQueryKeyExport({
    className,
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
    infiniteQueryHook: infiniteHookWithJsDoc,
    queryKeyFn,
  };
};

export function getQueryKeyFnName(queryKey: string) {
  return `${capitalizeFirstLetter(queryKey)}Fn`;
}

function createQueryKeyFnExport(queryKey: string, method: MethodDeclaration) {
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
  method: MethodDeclaration,
): ts.Expression {
  return ts.factory.createArrayLiteralExpression(
    [
      ts.factory.createIdentifier(queryKey),
      ts.factory.createSpreadElement(
        ts.factory.createParenthesizedExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier("queryKey"),
            ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
            method.getParameters().length
              ? ts.factory.createArrayLiteralExpression([
                  ts.factory.createObjectLiteralExpression(
                    method
                      .getParameters()
                      .flatMap((param) =>
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
              ts.factory.createTypeReferenceNode(
                ts.factory.createIdentifier(`{ ${nextPageParam}: number }`),
              ),
            ),
          ),
          ts.factory.createIdentifier(nextPageParam),
        ),
      ),
    ),
  ];
}
