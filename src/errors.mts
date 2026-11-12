/**
 * Stable, machine-readable error codes printed by `--json`.
 * Changing or removing a code is a breaking change.
 */
export const ErrorCodes = {
  invalidArgument: "INVALID_ARGUMENT",
  inputNotFound: "INPUT_NOT_FOUND",
  inputParseError: "INPUT_PARSE_ERROR",
  clientGenerationFailed: "CLIENT_GENERATION_FAILED",
  generationFailed: "GENERATION_FAILED",
  outputOutOfDate: "OUTPUT_OUT_OF_DATE",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ExitCodes = {
  success: 0,
  outOfDate: 1,
  error: 2,
} as const;

export type ErrorDetails = Record<string, unknown>;

export class CodegenError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(
    code: ErrorCode,
    message: string,
    details: ErrorDetails = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CodegenError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Anything that is not already a {@link CodegenError} is an unexpected
 * failure in our own pipeline.
 */
export function toCodegenError(error: unknown): CodegenError {
  if (error instanceof CodegenError) {
    return error;
  }
  if (error instanceof Error) {
    return new CodegenError(
      ErrorCodes.generationFailed,
      error.message,
      { name: error.name },
      { cause: error },
    );
  }
  return new CodegenError(ErrorCodes.generationFailed, String(error));
}

export type JsonError = {
  code: ErrorCode;
  message: string;
  details: ErrorDetails;
};

export function toJsonError(error: CodegenError): JsonError {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
  };
}

export function formatErrorJson(error: CodegenError): string {
  return JSON.stringify(toJsonError(error));
}

/**
 * Human-readable rendering for the default (non-JSON) mode.
 * Unexpected failures keep their stack trace so they stay debuggable.
 */
export function formatErrorText(error: CodegenError): string {
  const cause = error.cause;
  if (error.code === ErrorCodes.generationFailed && cause instanceof Error) {
    return `error [${error.code}]: ${cause.stack ?? cause.message}`;
  }
  return `error [${error.code}]: ${error.message}`;
}
