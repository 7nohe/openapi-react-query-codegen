import type { MethodDeclaration } from "ts-morph";
import ts from "typescript";
import {
  BuildCommonTypeName,
  extractPropertiesFromObjectParam,
  getNameFromMethod,
} from "./common.mjs";
import type { MethodDescription } from "./common.mjs";
import {
  createQueryKeyFromMethod,
  getQueryKeyFnName,
  getRequestParamFromMethod,
  hookNameFromMethod,
} from "./createUseQuery.mjs";
import { addJSDocToNode } from "./util.mjs";

/**
 * Creates a prefetch function for a query
 */
function createPrefetchHook({
  requestParams,
  method,
  className,
}: {
  requestParams: ts.ParameterDeclaration[];
  method: MethodDeclaration;
  className: string;
}) {
  const methodName = getNameFromMethod(method);
  const queryName = hookNameFromMethod({ method, className });
  const customHookName = `prefetch${
    queryName.charAt(0).toUpperCase() + queryName.slice(1)
  }`;
  const queryKey = createQueryKeyFromMethod({ method, className });

  // const
  const hookExport = ts.factory.createVariableStatement(
    // export
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(customHookName),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                "queryClient",
                undefined,
                ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier("QueryClient")
                )
              ),
              ...requestParams,
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("queryClient.prefetchQuery"),
              undefined,
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
                              method
                                .getParameters()
                                .flatMap((param) =>
                                  extractPropertiesFromObjectParam(param).map(
                                    (p) =>
                                      ts.factory.createShorthandPropertyAssignment(
                                        ts.factory.createIdentifier(p.name)
                                      )
                                  )
                                )
                            ),
                          ]
                        : []
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
                        method.getParameters().length
                          ? [
                              ts.factory.createObjectLiteralExpression(
                                method
                                  .getParameters()
                                  .flatMap((param) =>
                                    extractPropertiesFromObjectParam(param).map(
                                      (p) =>
                                        ts.factory.createShorthandPropertyAssignment(
                                          ts.factory.createIdentifier(p.name)
                                        )
                                    )
                                  )
                              ),
                            ]
                          : undefined
                      )
                    )
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

export const createPrefetch = ({
  className,
  method,
  jsDoc,
}: MethodDescription) => {
  const requestParam = getRequestParamFromMethod(method);

  const requestParams = requestParam ? [requestParam] : [];

  const prefetchHook = createPrefetchHook({
    requestParams,
    method,
    className,
  });

  const hookWithJsDoc = addJSDocToNode(prefetchHook, jsDoc);

  return {
    prefetchHook: hookWithJsDoc,
  };
};
