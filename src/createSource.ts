import ts from "typescript";
import { createImports } from "./createImports";
import { createExports } from "./createExports";

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
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  const result = printer.printNode(
    ts.EmitHint.Unspecified,
    createSourceFile(outputPath),
    resultFile
  );

  return result;
};
