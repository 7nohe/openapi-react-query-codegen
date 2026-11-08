import { describe, expect, test } from "vitest";
import {
  capitalizeFirst,
  isValidIdentifier,
  nameFromPath,
  propertyKey,
  splitWords,
  toCamelCase,
  toEnumMemberName,
  toFunctionName,
  toTypeName,
  uniqueName,
} from "../../src/client/naming.mts";

describe("naming", () => {
  test("isValidIdentifier", () => {
    expect(isValidIdentifier("fooBar_1$")).toBe(true);
    expect(isValidIdentifier("1foo")).toBe(false);
    expect(isValidIdentifier("foo-bar")).toBe(false);
  });

  test("splitWords splits separators and a leading digit run", () => {
    expect(splitWords("find pet by id")).toEqual(["find", "pet", "by", "id"]);
    expect(splitWords("foo-bar_baz")).toEqual(["foo", "bar", "baz"]);
    expect(splitWords("123numericLead")).toEqual(["123", "numericLead"]);
    expect(splitWords("  ")).toEqual([]);
    expect(splitWords("v2Beta")).toEqual(["v2Beta"]);
  });

  test("toCamelCase", () => {
    expect(toCamelCase("find pet by id")).toBe("findPetById");
    expect(toCamelCase("findPets")).toBe("findPets");
    expect(toCamelCase("GET")).toBe("get");
    expect(toCamelCase("GetPets")).toBe("getPets");
    expect(toCamelCase("123numericLead")).toBe("_123NumericLead");
    expect(toCamelCase("***")).toBe("");
  });

  test("toFunctionName falls back and avoids reserved words", () => {
    expect(toFunctionName("delete")).toBe("delete_");
    expect(toFunctionName("***")).toBe("operation");
    expect(toFunctionName("addPet")).toBe("addPet");
  });

  test("toTypeName", () => {
    expect(toTypeName("Pet")).toBe("Pet");
    expect(toTypeName("NewPet")).toBe("NewPet");
    expect(toTypeName("errorMessage")).toBe("ErrorMessage");
    expect(toTypeName("my-odd schema")).toBe("MyOddSchema");
    expect(toTypeName("account_annual_revenue")).toBe("AccountAnnualRevenue");
    expect(toTypeName("FineTuneDPOHyperparameters")).toBe(
      "FineTuneDpoHyperparameters",
    );
    expect(toTypeName("MCPApprovalRequest")).toBe("McpApprovalRequest");
    expect(toTypeName("Foo123Bar")).toBe("Foo123Bar");
    expect(toTypeName("123abc")).toBe("_123Abc");
    expect(toTypeName("string")).toBe("String");
    expect(toTypeName("class")).toBe("Class");
    expect(toTypeName("---")).toBe("Schema");
  });

  test("nameFromPath builds a name from the method and path", () => {
    expect(toFunctionName(nameFromPath("get", "/pets/{petId}/toys"))).toBe(
      "getPetsByPetIdToys",
    );
    expect(toFunctionName(nameFromPath("POST", "/"))).toBe("post");
  });

  test("propertyKey quotes only when needed", () => {
    expect(propertyKey("name")).toBe("name");
    expect(propertyKey("X-Trace-Id")).toBe('"X-Trace-Id"');
  });

  test("uniqueName appends a counter", () => {
    const used = new Set<string>();
    expect(uniqueName("a", used)).toBe("a");
    expect(uniqueName("a", used)).toBe("a2");
    expect(uniqueName("a", used)).toBe("a3");
  });

  test("toEnumMemberName", () => {
    expect(toEnumMemberName("in-progress")).toBe("IN_PROGRESS");
    expect(toEnumMemberName("inProgress")).toBe("IN_PROGRESS");
    expect(toEnumMemberName("active")).toBe("ACTIVE");
    expect(toEnumMemberName(1)).toBe("_1");
    expect(toEnumMemberName(1, { numericKeys: true })).toBe("1");
    expect(toEnumMemberName("1st", { numericKeys: true })).toBe("_1ST");
    expect(toEnumMemberName(null)).toBe("NULL");
    expect(toEnumMemberName("")).toBe("EMPTY");
    expect(toEnumMemberName("***")).toBe("VALUE");
  });

  test("capitalizeFirst", () => {
    expect(capitalizeFirst("foo")).toBe("Foo");
  });
});
