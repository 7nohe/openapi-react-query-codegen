import ts from "typescript";

export function addJSDocToNode<T extends ts.Node>(
  node: T,
  jsDoc: string | undefined,
): T {
  if (!jsDoc) {
    return node;
  }
  // replace the first /** with *
  // we do this because ts.addSyntheticLeadingComment will add /* to the beginning but we want /**
  const removedFirstLine = jsDoc.trim().replace(/^\/\*\*/, "*");
  // remove the last */ because ts.addSyntheticLeadingComment will add it
  const removedSecondLine = removedFirstLine.replace(/\*\/$/, "");

  const split = removedSecondLine.split("\n");
  const trimmed = split.map((line) => line.trim());
  const joined = trimmed.join("\n");

  const nodeWithJSDoc = ts.addSyntheticLeadingComment(
    node,
    ts.SyntaxKind.MultiLineCommentTrivia,
    joined,
    true,
  );

  return nodeWithJSDoc;
}
