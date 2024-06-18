import type { MethodDeclaration, VariableDeclaration } from "ts-morph";
import ts from "typescript";
import {
  BuildCommonTypeName,
  extractPropertiesFromObjectParam,
  getNameFromVariable,
  getVariableArrowFunctionParameters,
} from "./common.mjs";
import type { FunctionDescription } from "./common.mjs";
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
}: {
  requestParams: ts.ParameterDeclaration[];
  method: VariableDeclaration;
}) {
  const methodName = getNameFromVariable(method);
  const queryName = hookNameFromMethod({ method });
  const customHookName = `prefetch${
    queryName.charAt(0).toUpperCase() + queryName.slice(1)
  }`;
  const queryKey = createQueryKeyFromMethod({ method });

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
                  ts.factory.createIdentifier("QueryClient"),
                ),
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
                        : [],
                    ),
                  ),
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("queryFn"),
                    ts.factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      ts.factory.createToken(
                        ts.SyntaxKind.EqualsGreaterThanToken,
                      ),
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
                    ),
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

export const createPrefetch = ({ method, jsDoc }: FunctionDescription) => {
  const requestParam = getRequestParamFromMethod(method);

  const requestParams = requestParam ? [requestParam] : [];

  const prefetchHook = createPrefetchHook({
    requestParams,
    method,
  });

  const hookWithJsDoc = addJSDocToNode(prefetchHook, jsDoc);

  return {
    prefetchHook: hookWithJsDoc,
  };
};
