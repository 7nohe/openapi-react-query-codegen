// Static analysis of generated output: how much an agent has to read to use
// one operation, and how large the browser bundle is.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const SOURCE = /\.(ts|tsx|mts|cts)$/;

/** Every file under `root`, as absolute paths. */
function listFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * @param {string} harnessDir directory whose node_modules holds `ts6`,
 * `gpt-tokenizer` and `esbuild`
 */
export function createAnalyzer(harnessDir) {
  const require = createRequire(join(harnessDir, "package.json"));
  /** @type {typeof import("typescript")} */
  const ts = require("ts6");
  const tokenizer = require("gpt-tokenizer");
  const esbuild = require("esbuild");

  const countTokens = (text) => {
    try {
      return tokenizer.encode(text, { allowedSpecial: "all" }).length;
    } catch {
      return tokenizer.encode(text).length;
    }
  };

  /** Parses every source file under `root` into top-level declarations, imports and re-exports. */
  function index(root) {
    /** @type {Map<string, any>} */
    const files = new Map();
    for (const path of listFiles(root)) {
      if (!SOURCE.test(path)) continue;
      const text = readFileSync(path, "utf8");
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const file = {
        path,
        text,
        source,
        tokens: undefined,
        /** @type {Map<string, any[]>} */ decls: new Map(),
        /** @type {Map<string, { from: string, name: string }>} */ imports:
          new Map(),
        /** @type {{ from: string, names: Map<string, string> | null }[]} */ reexports:
          [],
      };
      const declare = (name, node) => {
        const list = file.decls.get(name);
        if (list) list.push(node);
        else file.decls.set(name, [node]);
      };
      for (const statement of source.statements) {
        if (ts.isVariableStatement(statement)) {
          for (const d of statement.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) declare(d.name.text, statement);
          }
        } else if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement) ||
            ts.isEnumDeclaration(statement) ||
            ts.isModuleDeclaration(statement)) &&
          statement.name &&
          ts.isIdentifier(statement.name)
        ) {
          declare(statement.name.text, statement);
        } else if (
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text.startsWith(".")
        ) {
          const from = statement.moduleSpecifier.text;
          const clause = statement.importClause;
          if (clause?.name)
            file.imports.set(clause.name.text, { from, name: "default" });
          if (
            clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings)
          ) {
            for (const el of clause.namedBindings.elements) {
              file.imports.set(el.name.text, {
                from,
                name: (el.propertyName ?? el.name).text,
              });
            }
          }
        } else if (
          ts.isExportDeclaration(statement) &&
          statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text.startsWith(".")
        ) {
          const from = statement.moduleSpecifier.text;
          if (!statement.exportClause) {
            file.reexports.push({ from, names: null });
          } else if (ts.isNamedExports(statement.exportClause)) {
            const names = new Map();
            for (const el of statement.exportClause.elements) {
              names.set(el.name.text, (el.propertyName ?? el.name).text);
            }
            file.reexports.push({ from, names });
          }
        }
      }
      files.set(path, file);
    }

    const resolveModule = (fromFile, specifier) => {
      const base = resolve(dirname(fromFile), specifier);
      const bare = base.replace(/\.(js|mjs|cjs)$/, "");
      for (const candidate of [
        base,
        `${bare}.ts`,
        `${bare}.tsx`,
        `${bare}.d.ts`,
        `${bare}.mts`,
        join(bare, "index.ts"),
      ]) {
        if (files.has(candidate)) return candidate;
      }
      return undefined;
    };

    /** Where the export `name` of `path` is declared, following re-exports. */
    const resolveExport = (path, name, seen = new Set()) => {
      const key = `${path}\0${name}`;
      if (seen.has(key)) return undefined;
      seen.add(key);
      const file = files.get(path);
      if (!file) return undefined;
      if (file.decls.has(name)) return { path, name };
      for (const { from, names } of file.reexports) {
        const target = resolveModule(path, from);
        if (!target) continue;
        if (names) {
          if (!names.has(name)) continue;
          const hit = resolveExport(target, names.get(name), seen);
          if (hit) return hit;
        } else {
          const hit = resolveExport(target, name, seen);
          if (hit) return hit;
        }
      }
      return undefined;
    };

    /** Where the identifier `name` used inside `path` is declared. */
    const resolveName = (path, name) => {
      const file = files.get(path);
      if (file.decls.has(name)) return { path, name };
      const imported = file.imports.get(name);
      if (!imported) return undefined;
      const target = resolveModule(path, imported.from);
      return target ? resolveExport(target, imported.name) : undefined;
    };

    const fileTokens = (path) => {
      const file = files.get(path);
      file.tokens ??= countTokens(file.text);
      return file.tokens;
    };

    return { files, resolveName, fileTokens };
  }

  /** Identifiers a declaration refers to, without property names. */
  function references(node) {
    const names = new Set();
    const visit = (n) => {
      if (ts.isIdentifier(n)) {
        const p = n.parent;
        const isPropertyName =
          ((ts.isPropertyAccessExpression(p) ||
            ts.isPropertyAssignment(p) ||
            ts.isPropertySignature(p) ||
            ts.isMethodSignature(p) ||
            ts.isMethodDeclaration(p) ||
            ts.isPropertyDeclaration(p) ||
            ts.isEnumMember(p) ||
            ts.isJsxAttribute(p)) &&
            p.name === n) ||
          (ts.isBindingElement(p) && p.propertyName === n) ||
          (ts.isQualifiedName(p) && p.right === n);
        if (!isPropertyName) names.add(n.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return names;
  }

  /**
   * What reading one export costs: its declaration, plus everything that
   * declaration names, `depth` levels deep.
   */
  function lookup(project, start, depth = 2) {
    const seen = new Map();
    let queue = [{ ...start, level: 0 }];
    while (queue.length > 0) {
      const next = [];
      for (const item of queue) {
        const key = `${item.path}\0${item.name}`;
        if (seen.has(key)) continue;
        const nodes = project.files.get(item.path).decls.get(item.name);
        seen.set(key, { ...item, nodes });
        if (item.level >= depth) continue;
        for (const node of nodes) {
          for (const name of references(node)) {
            if (name === item.name) continue;
            const hit = project.resolveName(item.path, name);
            if (hit) next.push({ ...hit, level: item.level + 1 });
          }
        }
      }
      queue = next;
    }
    const declarations = [...seen.values()];
    const paths = [...new Set(declarations.map((d) => d.path))];
    const text = (d) =>
      [...new Set(d.nodes)].map((n) => n.getText()).join("\n");
    return {
      declarationTokens: countTokens(text(declarations[0])),
      closureDeclarations: declarations.length,
      closureTokens: declarations.reduce(
        (sum, d) => sum + countTokens(text(d)),
        0,
      ),
      files: paths.length,
      fileTokens: paths.reduce((sum, p) => sum + project.fileTokens(p), 0),
    };
  }

  /** The same lookup for openapi-typescript, whose output is indexed types. */
  function lookupIndexedTypes(project, op) {
    const file = [...project.files.values()].find((f) =>
      f.path.endsWith("schema.d.ts"),
    );
    if (!file) return undefined;
    const members = (name) => file.decls.get(name)?.[0]?.members ?? [];
    const named = (list, name) =>
      list.find(
        (m) =>
          m.name &&
          (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) &&
          m.name.text === name,
      );
    const pathItem = named(members("paths"), op.path);
    const method =
      pathItem?.type && ts.isTypeLiteralNode(pathItem.type)
        ? named(pathItem.type.members, op.method)
        : undefined;
    if (!method) return undefined;
    const parts = [method.getText()];
    const operation = named(members("operations"), op.id);
    if (operation) parts.push(operation.getText());
    const schemasMember = named(members("components"), "schemas");
    const schemas =
      schemasMember?.type && ts.isTypeLiteralNode(schemasMember.type)
        ? schemasMember.type.members
        : [];
    const referenced = new Set();
    for (const m of (operation ?? method)
      .getText()
      .matchAll(/components\["schemas"\]\["([^"]+)"\]/g)) {
      referenced.add(m[1]);
    }
    for (const name of referenced) {
      const schema = named(schemas, name);
      if (schema) parts.push(schema.getText());
    }
    return {
      declarationTokens: countTokens(parts[0]),
      closureDeclarations: parts.length,
      closureTokens: parts.reduce((sum, p) => sum + countTokens(p), 0),
      files: 1,
      fileTokens: project.fileTokens(file.path),
    };
  }

  /**
   * @param {{ dir: string, out: string, tool: import("./tools.mjs").Tool, operations: import("./tools.mjs").Operation[] }} input
   */
  function analyze({ dir, out, tool, operations }) {
    const root = join(dir, out);
    const project = index(root);
    const perFile = [...project.files.keys()].map((p) => project.fileTokens(p));
    const totals = {
      sourceFiles: perFile.length,
      totalTokens: perFile.reduce((a, b) => a + b, 0),
      largestFileTokens: Math.max(0, ...perFile),
    };

    const byName = new Map();
    for (const file of project.files.values()) {
      for (const name of file.decls.keys()) {
        const key = normalize(name);
        if (!byName.has(key)) byName.set(key, { path: file.path, name });
      }
    }
    const lookups = [];
    const entryLines = [];
    for (const op of operations) {
      if (!tool.hookName) {
        const result = lookupIndexedTypes(project, op);
        lookups.push({ operation: op.id, export: "$api", ...result });
        continue;
      }
      const start = byName.get(normalize(tool.hookName(op)));
      if (!start) {
        lookups.push({ operation: op.id, export: null });
        continue;
      }
      lookups.push({
        operation: op.id,
        export: start.name,
        file: relative(root, start.path),
        ...lookup(project, start),
      });
      const from = `./${relative(dir, start.path).replace(SOURCE, "")}`;
      entryLines.push(`export { ${start.name} } from ${JSON.stringify(from)};`);
    }
    if (!tool.hookName) {
      entryLines.push(`export { $api } from "./${out}/client";`);
    }

    let bundle;
    if (entryLines.length > 0) {
      const entry = join(dir, `entry.${tool.id}.ts`);
      writeFileSync(entry, `${entryLines.join("\n")}\n`);
      try {
        const result = esbuild.buildSync({
          entryPoints: [entry],
          absWorkingDir: dir,
          bundle: true,
          minify: true,
          format: "esm",
          platform: "browser",
          target: "es2022",
          write: false,
          logLevel: "silent",
          external: ["react", "react/jsx-runtime", "@tanstack/react-query"],
        });
        const code = result.outputFiles[0].contents;
        bundle = { bytes: code.length, gzipBytes: gzipSync(code).length };
      } catch (error) {
        bundle = { error: String(error.message ?? error).slice(0, 300) };
      }
    }
    return { ...totals, lookups, bundle };
  }

  return { analyze };
}

/** Files, bytes and lines under `root`. */
export function outputSize(root) {
  let bytes = 0;
  let lines = 0;
  const files = listFiles(root);
  for (const path of files) {
    bytes += statSync(path).size;
    lines += readFileSync(path, "utf8").split("\n").length - 1;
  }
  return { files: files.length, bytes, lines };
}
