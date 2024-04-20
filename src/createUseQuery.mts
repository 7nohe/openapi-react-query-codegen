import ts from "typescript";
import { MethodDeclaration } from "ts-morph";
import {
  BuildCommonTypeName,
  capitalizeFirstLetter,
  extractPropertiesFromObjectParam,
  getNameFromMethod,
  queryKeyConstraint,
  queryKeyGenericType,
  TData,
  TError,
} from "./common.mjs";
import { addJSDocToNode } from "./util.mjs";
import { type MethodDescription } from "./common.mjs";

export const createApiResponseType = ({
  className,
  methodName,
}: {
  className: string;
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
  /** DefaultResponseDataType
   * export type MyClassMethodDefaultResponse = Awaited<ReturnType<typeof myClass.myMethod>>
   */
  const apiResponse = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(
      `${capitalizeFirstLetter(className)}${capitalizeFirstLetter(
        methodName
      )}DefaultResponse`
    ),
    undefined,
    awaitedResponseDataType
  );

  const responseDataType = ts.factory.createTypeParameterDeclaration(
    undefined,
    TData.text,
    undefined,
    ts.factory.createTypeReferenceNode(BuildCommonTypeName(apiResponse.name))
  );

  return {
    /** DefaultResponseDataType
     * export type MyClassMethodDefaultResponse = Awaited<ReturnType<typeof myClass.myMethod>>
     */
    apiResponse,
    /**
     * will be the name of the type of the response type of the method
     * MyClassMethodDefaultResponse
     */
    responseDataType,
  };
};

/**
 * Replace the import("...") surrounding the type if there is one.
 * This can happen when the type is imported from another file, but
 * we are already importing all the types from that file.
 */
function getShortType(type: string) {
  return type.replaceAll(/import\("[a-zA-Z\/\.-]*"\)\./g, "");
}

export function getRequestParamFromMethod(method: MethodDeclaration) {
  if (!method.getParameters().length) {
    return null;
  }

  const params = method
    .getParameters()
    .map((param) => {
      const paramNodes = extractPropertiesFromObjectParam(param);
      return paramNodes.map((refParam) => ({
        name: refParam.name,
        typeName: getShortType(refParam.type.getText()),
        optional: refParam.optional,
      }));
    })
    .flat();

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
          undefined
        )
      )
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
          // param.hasQuestionToken() ?? param.getInitializer()?.compilerNode
          //   ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
          //   : param.getQuestionTokenNode()?.compilerNode,
          ts.factory.createTypeReferenceNode(refParam.typeName)
        );
      })
    ),
    // if all params are optional, we create an empty object literal
    // so the hook can be called without any parameters
    areAllPropertiesOptional
      ? ts.factory.createObjectLiteralExpression()
      : undefined
  );
}

/**
 * Return Type
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
      `${capitalizeFirstLetter(className)}${capitalizeFirstLetter(
        methodName
      )}QueryResult`
    ),
    [
      ts.factory.createTypeParameterDeclaration(
        undefined,
        TData,
        undefined,
        ts.factory.createTypeReferenceNode(defaultApiResponse.name)
      ),
      ts.factory.createTypeParameterDeclaration(
        undefined,
        TError,
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      ),
    ],
    ts.factory.createTypeReferenceNode(
      ts.factory.createIdentifier("UseQueryResult"),
      [
        ts.factory.createTypeReferenceNode(TData),
        ts.factory.createTypeReferenceNode(TError),
      ]
    )
  );
}

/**
 * QueryKey
 */
export function createQueryKeyExport({
  className,
  methodName,
  queryKey,
}: {
  className: string;
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
            `${className}${capitalizeFirstLetter(methodName)}`
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  );
}

function hookNameFromMethod({
  method,
  className,
}: {
  method: MethodDeclaration;
  className: string;
}) {
  const methodName = getNameFromMethod(method);
  return `use${className}${capitalizeFirstLetter(methodName)}`;
}

function createQueryKeyFromMethod({
  method,
  className,
}: {
  method: MethodDeclaration;
  className: string;
}) {
  const customHookName = hookNameFromMethod({ method, className });
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
  requestParams,
  method,
  className,
}: {
  queryString: "useSuspenseQuery" | "useQuery";
  suffix: string;
  responseDataType: ts.TypeParameterDeclaration;
  requestParams: ts.ParameterDeclaration[];
  method: MethodDeclaration;
  className: string;
}) {
  const methodName = getNameFromMethod(method);
  const customHookName = hookNameFromMethod({ method, className });
  const queryKey = createQueryKeyFromMethod({ method, className });

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
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
              ),
              ts.factory.createTypeParameterDeclaration(
                undefined,
                "TQueryKey",
                queryKeyConstraint,
                ts.factory.createArrayTypeNode(
                  ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
                )
              ),
            ]),
            [
              ...requestParams,
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
                        ts.factory.createTypeReferenceNode(TData),
                        ts.factory.createTypeReferenceNode(TError),
                      ]
                    ),
                    ts.factory.createUnionTypeNode([
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("queryKey")
                      ),
                      ts.factory.createLiteralTypeNode(
                        ts.factory.createStringLiteral("queryFn")
                      ),
                    ]),
                  ]
                )
              ),
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
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
                    ts.factory.createArrayLiteralExpression(
                      [
                        BuildCommonTypeName(queryKey),
                        ts.factory.createSpreadElement(
                          ts.factory.createParenthesizedExpression(
                            ts.factory.createBinaryExpression(
                              ts.factory.createIdentifier("queryKey"),
                              ts.factory.createToken(
                                ts.SyntaxKind.QuestionQuestionToken
                              ),
                              method.getParameters().length
                                ? ts.factory.createArrayLiteralExpression([
                                    ts.factory.createObjectLiteralExpression(
                                      method
                                        .getParameters()
                                        .map((param) =>
                                          extractPropertiesFromObjectParam(
                                            param
                                          ).map((p) =>
                                            ts.factory.createShorthandPropertyAssignment(
                                              ts.factory.createIdentifier(
                                                p.name
                                              )
                                            )
                                          )
                                        )
                                        .flat()
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
                      ts.factory.createAsExpression(
                        ts.factory.createCallExpression(
                          ts.factory.createPropertyAccessExpression(
                            ts.factory.createIdentifier(className),
                            ts.factory.createIdentifier(methodName)
                          ),
                          undefined,
                          method.getParameters().length
                            ? [
                                ts.factory.createObjectLiteralExpression(
                                  method
                                    .getParameters()
                                    .map((param) =>
                                      extractPropertiesFromObjectParam(
                                        param
                                      ).map((p) =>
                                        ts.factory.createShorthandPropertyAssignment(
                                          ts.factory.createIdentifier(p.name)
                                        )
                                      )
                                    )
                                    .flat()
                                ),
                              ]
                            : undefined
                        ),
                        ts.factory.createTypeReferenceNode(TData)
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
  return hookExport;
}

export const createUseQuery = ({
  node,
  className,
  method,
  jsDoc = [],
  isDeprecated: deprecated = false,
}: MethodDescription) => {
  const methodName = getNameFromMethod(method);
  const queryKey = createQueryKeyFromMethod({ method, className });
  const { apiResponse: defaultApiResponse, responseDataType } =
    createApiResponseType({
      className,
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

  const hookWithJsDoc = addJSDocToNode(queryHook, node, deprecated, jsDoc);
  const suspenseHookWithJsDoc = addJSDocToNode(
    suspenseQueryHook,
    node,
    deprecated,
    jsDoc
  );

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

  return {
    apiResponse: defaultApiResponse,
    returnType: returnTypeExport,
    key: queryKeyExport,
    queryHook: hookWithJsDoc,
    suspenseQueryHook: suspenseHookWithJsDoc,
  };
};
