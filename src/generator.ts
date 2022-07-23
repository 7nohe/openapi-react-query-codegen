import ts from "typescript";
import { generate as generateTSClients } from "openapi-typescript-codegen";
import { print } from "./print";
import { makeQueries } from "./queries";
import { makeImports } from "./imports";
import { CLIOptions } from "./cli";
import path from "path";

function makeSourceFile(outputPath: string) {
  return ts.factory.createSourceFile(
    /*statements*/ [...makeImports(outputPath), ...makeQueries(outputPath)],
    /*endOfFileToken*/ ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    /*flags*/ ts.NodeFlags.None
  );
}

function makeSource(outputPath: string) {
  const resultFile = ts.createSourceFile(
    "client.ts",
    "",
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.TS
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  const result = printer.printNode(
    ts.EmitHint.Unspecified,
    makeSourceFile(outputPath),
    resultFile
  );

  return result;
}

export async function generate(options: CLIOptions) {
  const outputPath = path.join(options.outputDir, "requests");
  await generateTSClients({
    input: options.path,
    output: outputPath,
  });
  const source = makeSource(outputPath);
  print(source, options);
}
