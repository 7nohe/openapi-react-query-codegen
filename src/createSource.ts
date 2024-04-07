import ts, { factory } from "typescript";
import { createImports } from "./createImports";
import { createExportsV2 } from "./createExports";
import { version } from "../package.json";

const createSourceFile = (outputPath: string) => {
  const imports = createImports(outputPath);
  const exports = createExportsV2(outputPath);

  const commonSource = ts.factory.createSourceFile(
    [...imports, ...exports.allCommon],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );

  const commonImport = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      ts.factory.createIdentifier("* as Common"),
      undefined
    ),
    ts.factory.createStringLiteral("./common"),
    undefined
  );

  const commonExport = ts.factory.createExportDeclaration(
    undefined,
    false,
    undefined,
    ts.factory.createStringLiteral("./common"),
    undefined
  );

  const queriesExport = ts.factory.createExportDeclaration(
    undefined,
    false,
    undefined,
    ts.factory.createStringLiteral("./queries"),
    undefined
  );

  const mainSource = ts.factory.createSourceFile(
    [commonImport, ...imports, ...exports.mainExports],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );

  const suspenseSource = ts.factory.createSourceFile(
    [commonImport, ...imports, ...exports.suspenseExports],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );

  const indexSource = ts.factory.createSourceFile(
    [commonExport, queriesExport],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );

  return {
    commonSource,
    mainSource,
    suspenseSource,
    indexSource,
  };
};

export const createSources = (outputPath: string) => {
  const queriesFile = ts.createSourceFile(
    "queries.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const commonFile = ts.createSourceFile(
    "common.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const suspenseFile = ts.createSourceFile(
    "suspense.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );

  const indexFile = ts.createSourceFile(
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

  const { commonSource, mainSource, suspenseSource, indexSource } =
    createSourceFile(outputPath);

  const commonResult =
    `// generated with @7nohe/openapi-react-query-codegen@${version} \n` +
    printer.printNode(ts.EmitHint.Unspecified, commonSource, commonFile);

  const mainResult =
    `// generated with @7nohe/openapi-react-query-codegen@${version} \n` +
    printer.printNode(ts.EmitHint.Unspecified, mainSource, queriesFile);

  const suspenseResult =
    `// generated with @7nohe/openapi-react-query-codegen@${version} \n` +
    printer.printNode(ts.EmitHint.Unspecified, suspenseSource, suspenseFile);

  const indexResult =
    `// generated with @7nohe/openapi-react-query-codegen@${version} \n` +
    printer.printNode(ts.EmitHint.Unspecified, indexSource, indexFile);

  return [
    {
      name: "index.ts",
      content: indexResult,
    },
    {
      name: "common.ts",
      content: commonResult,
    },
    {
      name: "queries.ts",
      content: mainResult,
    },
    {
      name: "suspense.ts",
      content: suspenseResult,
    },
  ];
};
