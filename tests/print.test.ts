import { describe, test, expect, vi, beforeEach } from "vitest";
import { print } from "../src/print.mjs";
import * as common from "../src/common.mjs";
import { mkdir, writeFile } from "fs/promises";

vi.mock("fs/promises", () => {
  return {
    mkdir: vi.fn(() => Promise.resolve()),
    writeFile: vi.fn(() => Promise.resolve()),
  };
});

describe("print", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  test("print - doesn't create folders if folders exist", async () => {
    const exists = vi.spyOn(common, "exists");
    exists.mockImplementation(() => Promise.resolve(true));
    const result = await print(
      [
        {
          name: "test.ts",
          content: 'console.log("test")',
        },
      ],
      {
        output: "dist",
      }
    );
    expect(exists).toBeCalledTimes(2);
    expect(result).toBeUndefined();
    expect(mkdir).toBeCalledTimes(0);
    expect(writeFile).toBeCalledTimes(1);
  });

  test("print - creates folders if folders don't exist", async () => {
    const exists = vi.spyOn(common, "exists");
    exists.mockImplementation(() => Promise.resolve(false));
    const result = await print(
      [
        {
          name: "test.ts",
          content: 'console.log("test")',
        },
      ],
      {
        output: "dist",
      }
    );
    expect(exists).toBeCalledTimes(2);
    expect(result).toBeUndefined();
    expect(mkdir).toBeCalledTimes(2);
    expect(writeFile).toBeCalledTimes(1);
  });
});
