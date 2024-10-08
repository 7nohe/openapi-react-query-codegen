import type { VariableDeclaration } from "ts-morph";
import ts from "typescript";
import {
  BuildCommonTypeName,
  EqualsOrGreaterThanToken,
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
 * Creates a prefetch/ensure function for a query
 */
function createPrefetchOrEnsureHook({
  requestParams,
  method,
  functionType,
}: {
  requestParams: ts.ParameterDeclaration[];
  method: VariableDeclaration;
  functionType: "prefetch" | "ensure";
}) {
  const methodName = getNameFromVariable(method);
  const queryName = hookNameFromMethod({ method });
  let customHookName = `prefetch${
    queryName.charAt(0).toUpperCase() + queryName.slice(1)
  }`;

  if (functionType === "ensure") {
    customHookName = `ensure${
      queryName.charAt(0).toUpperCase() + queryName.slice(1)
    }Data`;
  }
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
            EqualsOrGreaterThanToken,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier(
                `queryClient.${functionType === "prefetch" ? "prefetchQuery" : "ensureQueryData"}`,
              ),
              undefined,
              [
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("queryKey"),
                    ts.factory.createCallExpression(
                      BuildCommonTypeName(getQueryKeyFnName(queryKey)),
                      undefined,

                      [ts.factory.createIdentifier("clientOptions")],
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
                      ts.factory.createCallExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createCallExpression(
                            ts.factory.createIdentifier(methodName),

                            undefined,
                            // { ...clientOptions }
                            getVariableArrowFunctionParameters(method).length
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
                            ts.factory.createToken(
                              ts.SyntaxKind.EqualsGreaterThanToken,
                            ),
                            ts.factory.createPropertyAccessExpression(
                              ts.factory.createIdentifier("response"),
                              ts.factory.createIdentifier("data"),
                            ),
                          ),
                        ],
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

export const createPrefetchOrEnsure = ({
  method,
  jsDoc,
  functionType,
  modelNames,
}: FunctionDescription & {
  functionType: "prefetch" | "ensure";
  modelNames: string[];
}) => {
  const requestParam = getRequestParamFromMethod(method, undefined, modelNames);

  const requestParams = requestParam ? [requestParam] : [];

  const prefetchOrEnsureHook = createPrefetchOrEnsureHook({
    requestParams,
    method,
    functionType,
  });

  const hookWithJsDoc = addJSDocToNode(prefetchOrEnsureHook, jsDoc);

  return {
    hook: hookWithJsDoc,
  };
};
