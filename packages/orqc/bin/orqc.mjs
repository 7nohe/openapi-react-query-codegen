#!/usr/bin/env node
// The package only exports its library entry, so locate the CLI next to it.
const entry = import.meta.resolve("@7nohe/openapi-react-query-codegen");
await import(new URL("./cli.mjs", entry).href);
