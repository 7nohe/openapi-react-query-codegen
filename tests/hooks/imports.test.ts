import { describe, expect, it } from "vitest";
import { toFunctionName } from "../../src/client/naming.mjs";
import { buildSchemaNames } from "../../src/client/operations.mjs";
import {
  buildFileImports,
  printImports,
  relativeModule,
  TANSTACK_IMPORTS,
} from "../../src/hooks/imports.mjs";

const references = (
  mentioned: string[],
  services: string[] = [],
  models: string[] = [],
) => ({ services, models, mentioned: new Set(mentioned) });

describe("relativeModule", () => {
  it("should append the import extension", () => {
    expect(relativeModule("./common")).toBe("./common");
    expect(relativeModule("./common", { importExtension: ".js" })).toBe(
      "./common.js",
    );
  });
});

describe("buildFileImports", () => {
  it("should keep the fixed names the code mentions", () => {
    const imports = buildFileImports(
      {},
      references(["useQuery", "UseQueryOptions", "Options", "Common"]),
    );
    expect(imports).toEqual([
      {
        moduleSpecifier: "@tanstack/react-query",
        namedImports: [
          { name: "useQuery" },
          { name: "UseQueryOptions", isTypeOnly: true },
        ],
      },
      { moduleSpecifier: "axios", namedImports: [] },
      {
        moduleSpecifier: "../requests/sdk.gen",
        namedImports: [{ name: "Options", isTypeOnly: true }],
      },
      {
        moduleSpecifier: "../requests/types.gen",
        isTypeOnly: true,
        namedImports: [],
      },
      { moduleSpecifier: "./common", namespaceImport: "Common" },
    ]);
  });

  it("should import the declared services and models whatever is mentioned", () => {
    const imports = buildFileImports(
      {},
      references([], ["findPets", "addPet"], ["Pet"]),
    );
    expect(imports[2].namedImports).toEqual([
      { name: "findPets" },
      { name: "addPet" },
    ]);
    // Models are types; a type-only declaration keeps the output compatible
    // with `verbatimModuleSyntax`.
    expect(imports[3]).toEqual({
      moduleSpecifier: "../requests/types.gen",
      isTypeOnly: true,
      namedImports: [{ name: "Pet" }],
    });
  });

  it("should import AxiosError as a value and Common only when mentioned", () => {
    const imports = buildFileImports({}, references(["AxiosError"]));
    expect(imports[1]).toEqual({
      moduleSpecifier: "axios",
      namedImports: [{ name: "AxiosError" }],
    });
    expect(imports.some((i) => i.namespaceImport)).toBe(false);
  });

  it("should carry the import extension into relative modules", () => {
    const imports = buildFileImports(
      { importExtension: ".js" },
      references(["Common"]),
    );
    expect(imports.map((i) => i.moduleSpecifier)).toEqual([
      "@tanstack/react-query",
      "axios",
      "../requests/sdk.gen.js",
      "../requests/types.gen.js",
      "./common.js",
    ]);
  });
});

describe("printImports", () => {
  it("should leave out a declaration without names", () => {
    expect(printImports(buildFileImports({}, references([])))).toBe("");
  });

  it("should sort names regardless of case and of the type modifier", () => {
    expect(
      printImports([
        {
          moduleSpecifier: "m",
          namedImports: [
            { name: "b" },
            { name: "C", isTypeOnly: true },
            { name: "A" },
            { name: "a2" },
          ],
        },
      ]),
    ).toBe('import { A, a2, b, type C } from "m";\n');
  });

  it("should put packages before relative modules, each in order", () => {
    expect(
      printImports(
        buildFileImports(
          {},
          references(
            ["Common", "Options", "useQuery", "AxiosError"],
            ["findPets"],
            ["Pet"],
          ),
        ),
      ),
    ).toBe(
      [
        'import { useQuery } from "@tanstack/react-query";',
        'import { AxiosError } from "axios";',
        'import { findPets, type Options } from "../requests/sdk.gen";',
        'import type { Pet } from "../requests/types.gen";',
        'import * as Common from "./common";',
        "",
      ].join("\n"),
    );
  });
});

// Whether a fixed name is imported is decided by whether the code mentions it,
// which only works while nothing from a specification can have that name.
describe("the names the hook files use", () => {
  const types = [
    ...TANSTACK_IMPORTS.filter((named) => named.isTypeOnly).map(
      (named) => named.name,
    ),
    "Options",
    "Common",
    "AxiosError",
    // Type parameters of the hooks.
    "TData",
    "TError",
    "TQueryKey",
    "TContext",
  ];
  const values = [
    ...TANSTACK_IMPORTS.filter((named) => !named.isTypeOnly).map(
      (named) => named.name,
    ),
    // Parameters and locals of the hooks.
    "clientOptions",
    "queryKey",
    "mutationKey",
    "options",
    "queryClient",
    "pageParam",
    "signal",
    "undefined",
  ];

  it.each(types)("%s cannot be the name of a schema", (name) => {
    const names = buildSchemaNames({ components: { schemas: { [name]: {} } } });
    expect(names.get(name)).not.toBe(name);
  });

  it.each(values)("%s cannot be the name of an operation", (name) => {
    expect(toFunctionName(name)).not.toBe(name);
  });
});
