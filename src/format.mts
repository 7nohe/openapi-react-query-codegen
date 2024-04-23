import { IndentationText, NewLineKind, Project, QuoteKind } from "ts-morph";

export const formatOutput = async (outputPath: string) => {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      newLineKind: NewLineKind.LineFeed,
      quoteKind: QuoteKind.Double,
      usePrefixAndSuffixTextForRename: false,
      useTrailingCommas: true,
    },
  });

  const sourceFiles = project.addSourceFilesAtPaths(`${outputPath}/**/*`);

  const tasks = sourceFiles.map((sourceFile) => {
    sourceFile.formatText();
    sourceFile.fixMissingImports();
    sourceFile.organizeImports();
    return sourceFile.save();
  });

  await Promise.all(tasks);
};
