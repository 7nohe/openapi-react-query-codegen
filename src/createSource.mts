import { join } from "node:path";
import { Project } from "ts-morph";
import ts from "typescript";
import { createExports } from "./createExports.mjs";
import { createImports } from "./createImports.mjs";
import { getServices } from "./service.mjs";

const createSourceFile = async (outputPath: string, serviceEndName: string) => {
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

	const exports = createExports(service);

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
		ts.factory.createStringLiteral("./common"),
		undefined,
	);

	const commonExport = ts.factory.createExportDeclaration(
		undefined,
		false,
		undefined,
		ts.factory.createStringLiteral("./common"),
		undefined,
	);

	const queriesExport = ts.factory.createExportDeclaration(
		undefined,
		false,
		undefined,
		ts.factory.createStringLiteral("./queries"),
		undefined,
	);

	const mainSource = ts.factory.createSourceFile(
		[commonImport, ...imports, ...exports.mainExports],
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

	return {
		commonSource,
		mainSource,
		suspenseSource,
		indexSource,
	};
};

export const createSource = async ({
	outputPath,
	version,
	serviceEndName,
}: {
	outputPath: string;
	version: string;
	serviceEndName: string;
}) => {
	const queriesFile = ts.createSourceFile(
		"queries.ts",
		"",
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);
	const commonFile = ts.createSourceFile(
		"common.ts",
		"",
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);
	const suspenseFile = ts.createSourceFile(
		"suspense.ts",
		"",
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);

	const indexFile = ts.createSourceFile(
		"index.ts",
		"",
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);

	const printer = ts.createPrinter({
		newLine: ts.NewLineKind.LineFeed,
		removeComments: false,
	});

	const { commonSource, mainSource, suspenseSource, indexSource } =
		await createSourceFile(outputPath, serviceEndName);

	const commonResult = `// generated with @7nohe/openapi-react-query-codegen@${version} \n${printer.printNode(
		ts.EmitHint.Unspecified,
		commonSource,
		commonFile,
	)}`;

	const mainResult = `// generated with @7nohe/openapi-react-query-codegen@${version} \n${printer.printNode(
		ts.EmitHint.Unspecified,
		mainSource,
		queriesFile,
	)}`;

	const suspenseResult = `// generated with @7nohe/openapi-react-query-codegen@${version} \n${printer.printNode(
		ts.EmitHint.Unspecified,
		suspenseSource,
		suspenseFile,
	)}`;

	const indexResult = `// generated with @7nohe/openapi-react-query-codegen@${version} \n${printer.printNode(
		ts.EmitHint.Unspecified,
		indexSource,
		indexFile,
	)}`;

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
