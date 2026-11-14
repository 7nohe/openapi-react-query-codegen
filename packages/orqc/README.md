# @7nohe/orqc

Short name for [`@7nohe/openapi-react-query-codegen`](https://www.npmjs.com/package/@7nohe/openapi-react-query-codegen), for running it once without installing:

```bash
npx @7nohe/orqc@beta -i ./petstore.yaml
```

Each version runs exactly the same version of `@7nohe/openapi-react-query-codegen`, so `npx @7nohe/orqc@4.0.0` is `@7nohe/openapi-react-query-codegen@4.0.0`. v4 is in beta: until 4.0.0 is released, `@beta` selects it, and a plain `npx @7nohe/orqc` runs the current stable release, v3.

In a project, install the main package instead and run its `orqc` command (v4 and later; in v3 the command is `openapi-rq`):

```bash
npm install -D @7nohe/openapi-react-query-codegen@beta
npx orqc -i ./petstore.yaml
```

Documentation: https://orqc.7nohe.dev
