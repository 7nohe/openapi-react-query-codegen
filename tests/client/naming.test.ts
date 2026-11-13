import { describe, expect, test } from "vitest";
import {
  capitalizeFirst,
  isValidIdentifier,
  nameFromPath,
  propertyKey,
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

  test("toCamelCase", () => {
    expect(toCamelCase("find pet by id")).toBe("findPetById");
    expect(toCamelCase("findPets")).toBe("findPets");
    expect(toCamelCase("GET")).toBe("get");
    expect(toCamelCase("GetPets")).toBe("getPets");
    expect(toCamelCase("123numericLead")).toBe("_123NumericLead");
    expect(toCamelCase("***")).toBe("");
  });

  // Every expected value below is what the v3 generator produced.
  test.each([
    ["getHTTPStatus", "getHttpStatus"],
    ["getUserID", "getUserId"],
    ["GETUsers", "getUsers"],
    ["UPPER_CASE", "upperCase"],
    ["APIs", "apis"],
    ["IDs", "ids"],
    ["APIs2", "apIs2"],
    ["APIs_List", "apisList"],
    ["ListAPIs_v2", "listApIsV2"],
    ["listAPIsV2", "listApisV2"],
    ["HTTPSserver", "httpSserver"],
    ["XMLHttpRequest", "xmlHttpRequest"],
    ["getXMLHTTPRequest", "getXmlhttpRequest"],
    ["iOSApp", "iOsApp"],
    ["get2FACode", "get2FaCode"],
    ["get3DModel", "get3dModel"],
    ["status200OK", "status200Ok"],
    ["HTTP200Status", "http200Status"],
    ["v2beta", "v2Beta"],
    ["a1b2c3", "a1B2C3"],
    ["1a2b3c", "_1A2B3C"],
    ["find_pets-by.id", "findPetsById"],
    ["repos/list-for-org", "reposListForOrg"],
    ["$get", "get"],
    ["__dunder", "dunder"],
    ["trailing_", "trailing"],
    ["foo,bar", "foo_bar"],
    ["user'sOrganization", "user_sOrganization"],
    ["foo%20bar", "foo_20Bar"],
  ])("toCamelCase(%s) is %s as in v3", (input, expected) => {
    expect(toCamelCase(input)).toBe(expected);
  });

  test.each([
    ["get", "/a-b/c-d", "getABCD"],
    ["get", "/foo/{id}:cancel", "getFooByIdCancel"],
    ["get", "/foo-{id}", "getFooById"],
    ["post", "/a-b/{c_d}/e-f", "postABByCDEF"],
    ["get", "/", "get"],
  ])("nameFromPath(%s, %s)", (method, path, expected) => {
    expect(nameFromPath(method, path)).toBe(expected);
  });

  test("a second pass folds what the path gave, as in v3", () => {
    expect(toFunctionName(nameFromPath("get", "/x/y/z"))).toBe("getXyz");
  });

  test.each([
    ["Low", "LOW"],
    ["HTTPServer", "HTTP_SERVER"],
    ["getUserID", "GET_USER_ID"],
    ["in-progress", "IN_PROGRESS"],
    ["inProgress", "IN_PROGRESS"],
    ["v1.2", "V1_2"],
    ["a b", "A_B"],
    ["-x", "-X"],
    ["_y", "_Y"],
    ["2a", "2A"],
    ["%", "%"],
    ["", ""],
    ["foo%bar", "FOO%BAR"],
    [1, "_1"],
    [-1, "_-1"],
    [1.5, "1_5"],
    [null, "NULL"],
  ])("toEnumMemberName(%j) is %s as in v3", (value, expected) => {
    expect(toEnumMemberName(value)).toBe(expected);
  });

  test("numeric keys stay numbers when asked for", () => {
    expect(toEnumMemberName(1, { numericKeys: true })).toBe("1");
    expect(toEnumMemberName(-1, { numericKeys: true })).toBe("-1");
  });

  test.each([
    ["Foo2a", "Foo2a"],
    ["Foo1B", "Foo1b"],
    ["Model3D", "Model3d"],
    ["A1b2", "A1B2"],
    ["Foo2aBar", "Foo2aBar"],
    ["APIs", "Apis"],
    ["user'sOrganization", "User_sOrganization"],
  ])("toTypeName(%s) is %s as in v3", (input, expected) => {
    expect(toTypeName(input)).toBe(expected);
  });

  test("toFunctionName falls back and avoids reserved words", () => {
    expect(toFunctionName("delete")).toBe("delete_");
    expect(toFunctionName("undefined")).toBe("undefined_");
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
    expect(toEnumMemberName("1st", { numericKeys: true })).toBe("1ST");
    expect(toEnumMemberName(null)).toBe("NULL");
    expect(toEnumMemberName("***")).toBe("***");
  });

  test("capitalizeFirst", () => {
    expect(capitalizeFirst("foo")).toBe("Foo");
  });
});
