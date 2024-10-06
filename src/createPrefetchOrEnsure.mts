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
 * Creates a prefetch/ensure function for a query
 */
function createPrefetchOrEnsureHook({
  requestParams,
  method,
  className,
  functionType,
}: {
  requestParams: ts.ParameterDeclaration[];
  method: MethodDeclaration;
  className: string;
  functionType: "prefetch" | "ensure";
}) {
  const methodName = getNameFromMethod(method);
  const queryName = hookNameFromMethod({ method, className });
  let customHookName = `prefetch${
    queryName.charAt(0).toUpperCase() + queryName.slice(1)
  }`;

  if (functionType === "ensure") {
    customHookName = `ensure${
      queryName.charAt(0).toUpperCase() + queryName.slice(1)
    }Data`;
  }

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
                  ts.factory.createIdentifier("QueryClient"),
                ),
              ),
              ...requestParams,
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
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

                      method.getParameters().length
                        ? [
                            ts.factory.createObjectLiteralExpression(
                              method
                                .getParameters()
                                .flatMap((param) =>
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

export const createPrefetchOrEnsure = ({
  className,
  method,
  jsDoc,
  functionType,
}: MethodDescription & { functionType: "prefetch" | "ensure" }) => {
  const requestParam = getRequestParamFromMethod(method);

  const requestParams = requestParam ? [requestParam] : [];

  const prefetchOrEnsureHook = createPrefetchOrEnsureHook({
    requestParams,
    method,
    className,
    functionType,
  });

  const hookWithJsDoc = addJSDocToNode(prefetchOrEnsureHook, jsDoc);

  return {
    hook: hookWithJsDoc,
  };
};
