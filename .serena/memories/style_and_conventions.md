# Style and conventions
- Code: TypeScript strict, NodeNext modules, ESNext target. Imports organized; prefer named imports. Uses ts-morph/TypeScript factory for AST-based codegen.
- Formatting/lint: Biome enforced (formatter + linter). 2-space indent, spaces not tabs. Import organization enabled. Biome ignores build artifacts (dist, docs/.astro, examples outputs).
- Generated output: Comments include generator version header. Use double quotes and trailing commas (ts-morph manipulation settings). Keep code ASCII unless needed.
- Tests: Vitest. Coverage flag enabled in test script.