import { Project, SyntaxKind } from "ts-morph";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSource } from "../src/createSource.mjs";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";

/**
 * Test for Issue #181: useSuspenseQuery must not contain undefined type for data
 *
 * This test uses ts-morph to parse the generated code and verify the actual TypeScript types.
 *
 * According to TanStack Query docs:
 * "This works nicely in TypeScript, because data is guaranteed to be defined
 *  (as errors and loading states are handled by Suspense- and ErrorBoundaries)."
 *
 * Reference: https://tanstack.com/query/latest/docs/framework/react/guides/suspense
 */
describe("Issue #181: useSuspenseQuery data type should not include undefined", () => {
  const fileName = "issue-181";

  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  test("useFindPetsSuspense return type data should not include undefined", async () => {
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      client: "@hey-api/client-axios",
    });

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs).toBeDefined();

    // Parse with ts-morph to get TypeScript type information
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
      },
    });

    // Add TanStack Query types (mock definitions for type resolution)
    project.createSourceFile(
      "node_modules/@tanstack/react-query/index.d.ts",
      `
      export type UseSuspenseQueryResult<TData = unknown, TError = unknown> = {
        data: TData;
        error: TError | null;
      };
      export type UseQueryResult<TData = unknown, TError = unknown> = {
        data: TData | undefined;
        error: TError | null;
      };
      export declare function useSuspenseQuery<TData, TError>(options: any): UseSuspenseQueryResult<TData, TError>;
      export type UseQueryOptions<TData = unknown, TError = unknown> = any;
      export type UseSuspenseQueryOptions<TData = unknown, TError = unknown> = any;
    `,
    );

    const sourceFile = project.createSourceFile(
      "suspense.ts",
      suspenseTs!.content,
    );

    // Get useFindPetsSuspense variable declaration
    const hookDeclaration = sourceFile
      .getVariableDeclarations()
      .find((v) => v.getName() === "useFindPetsSuspense");

    expect(hookDeclaration).toBeDefined();

    // Get the arrow function initializer
    const initializer = hookDeclaration!.getInitializer();
    expect(initializer).toBeDefined();

    // Get return type by looking at the arrow function's return type
    const arrowFunction = initializer!.asKind(SyntaxKind.ArrowFunction);
    expect(arrowFunction).toBeDefined();

    const returnType = arrowFunction!.getReturnType();
    const returnTypeText = returnType.getText();

    console.log("\n=== Issue #181 Type Check ===");
    console.log("Hook return type:", returnTypeText);

    // Get the 'data' property from the return type
    const dataProperty = returnType.getProperty("data");
    expect(dataProperty).toBeDefined();

    const dataValueDeclaration = dataProperty!.getValueDeclaration();
    const dataType = dataValueDeclaration
      ? dataValueDeclaration.getType()
      : dataProperty!.getTypeAtLocation(sourceFile);
    const dataTypeText = dataType.getText();

    console.log("Data property type:", dataTypeText);
    console.log("===========================\n");

    // BEFORE FIX: This assertion SHOULD FAIL because data includes undefined
    // AFTER FIX: This assertion should PASS because data won't include undefined
    expect(dataTypeText).not.toContain("undefined");
  });

  test("options parameter should use UseSuspenseQueryOptions type", async () => {
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      client: "@hey-api/client-axios",
    });

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs).toBeDefined();

    // Simply check the generated code string for the correct type usage
    // This is more reliable than trying to resolve complex generic types

    // BEFORE FIX: Uses UseQueryOptions (incorrect)
    const hasUseQueryOptions = suspenseTs!.content.match(
      /options\?:\s*Omit<UseQueryOptions<TData,\s*TError>/,
    );

    // AFTER FIX: Uses UseSuspenseQueryOptions (correct)
    const hasUseSuspenseQueryOptions = suspenseTs!.content.match(
      /options\?:\s*Omit<UseSuspenseQueryOptions<TData,\s*TError>/,
    );

    console.log("\n=== Issue #181 Options Type Check ===");
    console.log("Has UseQueryOptions:", !!hasUseQueryOptions);
    console.log("Has UseSuspenseQueryOptions:", !!hasUseSuspenseQueryOptions);
    console.log("=====================================\n");

    // BEFORE FIX: This assertion SHOULD FAIL
    // AFTER FIX: This assertion should PASS
    expect(hasUseSuspenseQueryOptions).toBeTruthy();
    expect(hasUseQueryOptions).toBeFalsy();
  });

  test("suspense.ts should import UseSuspenseQueryOptions", async () => {
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      client: "@hey-api/client-axios",
    });

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs).toBeDefined();

    // Check if UseSuspenseQueryOptions is imported
    const hasImport = suspenseTs!.content.includes("UseSuspenseQueryOptions");

    console.log("\n=== Issue #181 Import Check ===");
    console.log("Has UseSuspenseQueryOptions import:", hasImport);
    console.log("===============================\n");

    // BEFORE FIX: This assertion SHOULD FAIL
    // AFTER FIX: This assertion should PASS
    expect(hasImport).toBeTruthy();
  });
});
