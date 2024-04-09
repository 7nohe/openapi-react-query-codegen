import ts from "typescript";
import { JSDoc, SourceFile } from "ts-morph";

export function addJSDocToNode<T extends ts.Node>(
  node: T,
  sourceFile: SourceFile,
  deprecated: boolean,
  jsDoc: JSDoc[] = []
): T {
  const deprecatedString = deprecated ? "@deprecated" : "";

  const jsDocString = [deprecatedString]
    .concat(
      jsDoc.map((comment) => {
        if (typeof comment === "string") {
          return comment;
        }
        if (Array.isArray(comment)) {
          return comment.map((c) => c.getText(sourceFile)).join("\n");
        }
        return "";
      })
    )
    // remove empty lines
    .filter(Boolean)
    // trim
    .map((comment) => comment.trim())
    // add * to each line
    .map((comment) => `* ${comment}`)
    // join lines
    .join("\n")
    // replace new lines with \n *
    .replace(/\n/g, "\n * ");

  const nodeWithJSDoc = jsDocString
    ? ts.addSyntheticLeadingComment(
        node,
        ts.SyntaxKind.MultiLineCommentTrivia,
        `*\n ${jsDocString}\n `,
        true
      )
    : node;

  return nodeWithJSDoc;
}
