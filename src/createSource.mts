import { join } from "node:path";
import { Project } from "ts-morph";
import ts from "typescript";
import { OpenApiRqFiles } from "./constants.mjs";
import { createExports } from "./createExports.mjs";
import { createImports } from "./createImports.mjs";
import { getServices } from "./service.mjs";

const createSourceFile = async (
  outputPath: string,
  serviceEndName: string,
  pageParam: string,
  nextPageParam: string,
  initialPageParam: string,
) => {
  const project = new Project({
    // Optionally specify compiler options, tsconfig.json, in-memory file system, and more here.
    // If you initialize with a tsconfig.json, then it will automatically populate the project
    // with the associated source files.
    // Read more: https://ts-morph.com/setup/
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFiles = join(process.cwd(), outputPath);
  project.addSourceFilesAtPaths(`${sourceFiles}/**/*`);

  const service = await getServices(project);

  const imports = createImports({
    serviceEndName,
    project,
  });

  const exports = createExports(
    service,
    pageParam,
    nextPageParam,
    initialPageParam,
  );

  const commonSource = ts.factory.createSourceFile(
    [...imports, ...exports.allCommon],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  const commonImport = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      ts.factory.createIdentifier("* as Common"),
      undefined,
    ),
    ts.factory.createStringLiteral(`./${OpenApiRqFiles.common}`),
    undefined,
  );

  const commonExport = ts.factory.createExportDeclaration(
    undefined,
    false,
    undefined,
    ts.factory.createStringLiteral(`./${OpenApiRqFiles.common}`),
    undefined,
  );

  const queriesExport = ts.factory.createExportDeclaration(
    undefined,
    false,
    undefined,
    ts.factory.createStringLiteral(`./${OpenApiRqFiles.queries}`),
    undefined,
  );

  const mainSource = ts.factory.createSourceFile(
    [commonImport, ...imports, ...exports.mainExports],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  const infiniteQueriesSource = ts.factory.createSourceFile(
    [commonImport, ...imports, ...exports.infiniteQueriesExports],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  const suspenseSource = ts.factory.createSourceFile(
    [commonImport, ...imports, ...exports.suspenseExports],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  const indexSource = ts.factory.createSourceFile(
    [commonExport, queriesExport],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  const prefetchSource = ts.factory.createSourceFile(
    [commonImport, ...imports, ...exports.allPrefetchExports],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  return {
    commonSource,
    infiniteQueriesSource,
    mainSource,
    suspenseSource,
    indexSource,
    prefetchSource,
  };
};

export const createSource = async ({
  outputPath,
  version,
  serviceEndName,
  pageParam,
  nextPageParam,
  initialPageParam,
}: {
  outputPath: string;
  version: string;
  serviceEndName: string;
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string;
}) => {
  const queriesFile = ts.createSourceFile(
    `${OpenApiRqFiles.queries}.ts`,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const infiniteQueriesFile = ts.createSourceFile(
    `${OpenApiRqFiles.infiniteQueries}.ts`,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const commonFile = ts.createSourceFile(
    `${OpenApiRqFiles.common}.ts`,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const suspenseFile = ts.createSourceFile(
    `${OpenApiRqFiles.suspense}.ts`,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  const indexFile = ts.createSourceFile(
    `${OpenApiRqFiles.index}.ts`,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  const prefetchFile = ts.createSourceFile(
    `${OpenApiRqFiles.prefetch}.ts`,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });

  const {
    commonSource,
    mainSource,
    infiniteQueriesSource,
    suspenseSource,
    indexSource,
    prefetchSource,
  } = await createSourceFile(
    outputPath,
    serviceEndName,
    pageParam,
    nextPageParam,
    initialPageParam,
  );

  const comment = `// generated with @7nohe/openapi-react-query-codegen@${version} \n\n`;

  const commonResult =
    comment +
    printer.printNode(ts.EmitHint.Unspecified, commonSource, commonFile);

  const mainResult =
    comment +
    printer.printNode(ts.EmitHint.Unspecified, mainSource, queriesFile);

  const infiniteQueriesResult =
    comment +
    printer.printNode(
      ts.EmitHint.Unspecified,
      infiniteQueriesSource,
      infiniteQueriesFile,
    );

  const suspenseResult =
    comment +
    printer.printNode(ts.EmitHint.Unspecified, suspenseSource, suspenseFile);

  const indexResult =
    comment +
    printer.printNode(ts.EmitHint.Unspecified, indexSource, indexFile);

  const prefetchResult =
    comment +
    printer.printNode(ts.EmitHint.Unspecified, prefetchSource, prefetchFile);

  return [
    {
      name: `${OpenApiRqFiles.index}.ts`,
      content: indexResult,
    },
    {
      name: `${OpenApiRqFiles.common}.ts`,
      content: commonResult,
    },
    {
      name: `${OpenApiRqFiles.infiniteQueries}.ts`,
      content: infiniteQueriesResult,
    },
    {
      name: `${OpenApiRqFiles.queries}.ts`,
      content: mainResult,
    },
    {
      name: `${OpenApiRqFiles.suspense}.ts`,
      content: suspenseResult,
    },
    {
      name: `${OpenApiRqFiles.prefetch}.ts`,
      content: prefetchResult,
    },
  ];
};
