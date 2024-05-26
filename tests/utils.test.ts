import { Project } from "ts-morph";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { addJSDocToNode } from "../src/util.mts";

describe("utils", () => {
  test("addJSDocToNode - deprecated", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });

    // create class
    const node = ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "TestClass",
      undefined,
      undefined,
      [],
    );
    // create file source
    const tsFile = ts.createSourceFile(
      "test.ts",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // create source file
    const tsSource = ts.factory.createSourceFile(
      [node],
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    );

    // print source file
    const fileString = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, tsSource, tsFile);

    // create ts-morph source file
    const sourceFile = project.createSourceFile("test.ts", fileString);

    if (!sourceFile) {
      throw new Error("Source file not found");
    }

    // add jsdoc to node
    const jsDoc = `/**
 * @deprecated
 * This is a test
 * This is a test 2
 */`;

    const deprecated = true;

    // find class node
    const foundNode = sourceFile.getClasses()[0];

    // add jsdoc to node
    const nodeWithJSDoc = addJSDocToNode(foundNode.compilerNode, jsDoc);

    // print node
    const nodetext = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, nodeWithJSDoc, tsFile);

    expect(nodetext).toMatchInlineSnapshot(`
"/**
* @deprecated
* This is a test
* This is a test 2
*/
export class TestClass {
}"
    `);
  });

  test("addJSDocToNode - not deprecated", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });

    // create class
    const node = ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "TestClass",
      undefined,
      undefined,
      [],
    );
    // create file source
    const tsFile = ts.createSourceFile(
      "test.ts",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // create source file
    const tsSource = ts.factory.createSourceFile(
      [node],
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    );

    // print source file
    const fileString = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, tsSource, tsFile);

    // create ts-morph source file
    const sourceFile = project.createSourceFile("test.ts", fileString);

    if (!sourceFile) {
      throw new Error("Source file not found");
    }

    // add jsdoc to node
    const jsDoc = `/**
 * This is a test
 * This is a test 2
 */`;

    // find class node
    const foundNode = sourceFile.getClasses()[0];

    // add jsdoc to node
    const nodeWithJSDoc = addJSDocToNode(foundNode.compilerNode, jsDoc);

    // print node
    const nodetext = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, nodeWithJSDoc, tsFile);

    expect(nodetext).toMatchInlineSnapshot(`
"/**
* This is a test
* This is a test 2
*/
export class TestClass {
}"
    `);
  });

  test("addJSDocToNode - does not add comment if no jsdoc", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });

    // create class
    const node = ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "TestClass",
      undefined,
      undefined,
      [],
    );
    // create file source
    const tsFile = ts.createSourceFile(
      "test.ts",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // create source file
    const tsSource = ts.factory.createSourceFile(
      [node],
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    );

    // print source file
    const fileString = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, tsSource, tsFile);

    // create ts-morph source file
    const sourceFile = project.createSourceFile("test.ts", fileString);

    if (!sourceFile) {
      throw new Error("Source file not found");
    }

    // add jsdoc to node
    const jsDoc = undefined;

    // find class node
    const foundNode = sourceFile.getClasses()[0];

    // add jsdoc to node
    const nodeWithJSDoc = addJSDocToNode(foundNode.compilerNode, jsDoc);

    // print node
    const nodetext = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, nodeWithJSDoc, tsFile);

    expect(nodetext).toMatchInlineSnapshot(`
"export class TestClass {
}"
    `);
  });

  test("addJSDocToNode - adds comment if no jsdoc and deprecated true", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });

    // create class
    const node = ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "TestClass",
      undefined,
      undefined,
      [],
    );
    // create file source
    const tsFile = ts.createSourceFile(
      "test.ts",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // create source file
    const tsSource = ts.factory.createSourceFile(
      [node],
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    );

    // print source file
    const fileString = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, tsSource, tsFile);

    // create ts-morph source file
    const sourceFile = project.createSourceFile("test.ts", fileString);

    if (!sourceFile) {
      throw new Error("Source file not found");
    }

    // add jsdoc to node
    const jsDoc = undefined;

    // find class node
    const foundNode = sourceFile.getClasses()[0];

    // add jsdoc to node
    const nodeWithJSDoc = addJSDocToNode(foundNode.compilerNode, jsDoc);

    // print node
    const nodetext = ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, nodeWithJSDoc, tsFile);

    expect(nodetext).toMatchInlineSnapshot(`
"export class TestClass {
}"
    `);
  });
});
