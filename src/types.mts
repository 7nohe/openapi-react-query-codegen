/**
 * Normalized operation information extracted from the OpenAPI service.
 * This is a pure JSON-serializable structure that can be consumed by generators.
 */
export interface OperationInfo {
  /** Method/function name as defined in service (e.g., "findPets") */
  methodName: string;
  /** Capitalized method name (e.g., "FindPets") */
  capitalizedMethodName: string;
  /** Generated Data type name of the operation (e.g., "FindPetsData"). */
  dataTypeName?: string;
  /**
   * Name of the operation's error type alias (e.g., "FindPetsError"), or
   * undefined when the operation declares no error responses with a body.
   * A colliding name gets a number appended, so this is not always the data
   * type's stem plus "Error".
   */
  errorTypeName?: string;
  /** HTTP method (e.g., "GET", "POST", "PUT", "PATCH", "DELETE") */
  httpMethod: string;
  /** JSDoc comment string (if present) */
  jsDoc?: string;
  /** Whether all parameters are optional */
  allParamsOptional: boolean;
  /** Whether this operation supports pagination (for infinite queries) */
  isPaginatable: boolean;
  /** Type of the configured page query parameter */
  pageParamType?: string;
  /** Resolved primitive kind of the configured page query parameter */
  pageParamTypeKind?: PageParamTypeKind;
}

export type PageParamTypeKind = "string" | "number" | "other";

/**
 * Context for generating hooks and utilities.
 * Contains shared information needed across all generators.
 */
export interface GenerationContext {
  /** Client type: "fetch" or "axios" */
  client: "fetch" | "axios";
  /** Model type names exported from the models file */
  modelNames: string[];
  /** Service function names exported from the service file */
  serviceNames: string[];
  /** Page param name for infinite queries (e.g., "page") */
  pageParam: string;
  /** Next page param name for infinite queries (e.g., "nextPage") */
  nextPageParam: string;
  /** Initial page param value for infinite queries */
  initialPageParam: string;
  /** Omit the initial page param entirely (sends no page param on the first request) */
  omitInitialPageParam: boolean;
  /** Package version for generated comment */
  version: string;
  /**
   * Extension of relative import specifiers: ".js" when the consuming project
   * resolves modules the Node way (`node16` / `nodenext`), else none.
   */
  importExtension?: "" | ".js";
}

/**
 * Generated output for a single file.
 */
export interface GeneratedFile {
  /** Filename without path (e.g., "queries.ts") */
  name: string;
  /** File content as string */
  content: string;
}
