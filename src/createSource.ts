import ts from "typescript";
import { createImports } from "./createImports";
import { createExports } from "./createExports";
import { version } from "../package.json";

const createSourceFile = (outputPath: string) => {
  return ts.factory.createSourceFile(
    [...createImports(outputPath), ...createExports(outputPath)],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );
};

export const createSource = (outputPath: string) => {
  const resultFile = ts.createSourceFile(
    "index.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });

  const node = createSourceFile(outputPath);

  const result =
    `// generated with @7nohe/openapi-react-query-codegen@${version} \n` +
    printer.printNode(ts.EmitHint.Unspecified, node, resultFile);

  return result;
};
