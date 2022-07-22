import ts from "typescript";
import type { OpenAPI, OpenAPIV3 } from "openapi-types";
import { generate as generateTSClients } from 'openapi-typescript-codegen'
import { print } from "./print";
import { makeImports } from "./imports";
import { makeQueries } from "./queries";
import { CLIOptions } from "./cli";
import path from "path";

function makeSourceFile() {
  return ts.factory.createSourceFile(
    /*statements*/ [
      ...makeImports(),
    ],
    /*endOfFileToken*/ ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    /*flags*/ ts.NodeFlags.None
  );
}

function makeSource() {
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
    makeSourceFile(),
    resultFile
  );

  return result;
}

export async function generate(options: CLIOptions) {
  const outputPath = path.join(options.outputDir, 'requests')
  await generateTSClients({
    input: options.path,
    output: outputPath,
  })
  await makeQueries(path.join(options.outputDir, 'queries'), outputPath);
  const source = makeSource();
  print(source, options);
}