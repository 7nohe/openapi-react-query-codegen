/**
 * Normalized operation information extracted from the OpenAPI service.
 * This is a pure JSON-serializable structure that can be consumed by generators.
 */
export interface OperationInfo {
  /** Method/function name as defined in service (e.g., "findPets") */
  methodName: string;
  /** Capitalized method name (e.g., "FindPets") */
  capitalizedMethodName: string;
  /** HTTP method (e.g., "GET", "POST", "PUT", "PATCH", "DELETE") */
  httpMethod: string;
  /** JSDoc comment string (if present) */
  jsDoc?: string;
  /** Whether the operation is deprecated */
  isDeprecated: boolean;
  /** Parameter information for the operation */
  parameters: OperationParameter[];
  /** Whether all parameters are optional */
  allParamsOptional: boolean;
  /** Whether this operation supports pagination (for infinite queries) */
  isPaginatable: boolean;
}

export interface OperationParameter {
  /** Parameter name */
  name: string;
  /** TypeScript type as string */
  typeName: string;
  /** Whether this parameter is optional */
  optional: boolean;
}

/**
 * Context for generating hooks and utilities.
 * Contains shared information needed across all generators.
 */
export interface GenerationContext {
  /** Client type: "@hey-api/client-fetch" or "@hey-api/client-axios" */
  client: "@hey-api/client-fetch" | "@hey-api/client-axios";
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
  /** Package version for generated comment */
  version: string;
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
