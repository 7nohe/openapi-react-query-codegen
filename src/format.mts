import { sync } from "cross-spawn";
import { IndentationText, NewLineKind, Project, QuoteKind } from "ts-morph";
import type { LimitedUserConfig } from "./cli.mjs";

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

type OutputProcesser = {
  args: (path: string) => ReadonlyArray<string>;
  command: string;
  name: string;
};

const formatters: Record<
  Extract<LimitedUserConfig["format"], string>,
  OutputProcesser
> = {
  biome: {
    args: (path) => ["format", "--write", path],
    command: "biome",
    name: "Biome (Format)",
  },
  prettier: {
    args: (path) => [
      "--ignore-unknown",
      path,
      "--write",
      "--ignore-path",
      "./.prettierignore",
    ],
    command: "prettier",
    name: "Prettier",
  },
};

/**
 * Map of supported linters
 */
const linters: Record<
  Extract<LimitedUserConfig["lint"], string>,
  OutputProcesser
> = {
  biome: {
    args: (path) => ["lint", "--write", path],
    command: "biome",
    name: "Biome (Lint)",
  },
  eslint: {
    args: (path) => [path, "--fix"],
    command: "eslint",
    name: "ESLint",
  },
};

export const processOutput = async ({
  output,
  format,
  lint,
}: {
  output: string;
  format?: "prettier" | "biome";
  lint?: "biome" | "eslint";
}) => {
  if (format) {
    const module = formatters[format];
    console.log(`✨ Running ${module.name} on queries`);
    sync(module.command, module.args(output));
  }

  if (lint) {
    const module = linters[lint];
    console.log(`✨ Running ${module.name} on queries`);
    sync(module.command, module.args(output));
  }
};
