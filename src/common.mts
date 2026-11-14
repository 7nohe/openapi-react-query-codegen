import path from "node:path";
import type { LimitedUserConfig } from "./cli.mjs";
import {
  mocksOutputPath,
  queriesOutputPath,
  requestsOutputPath,
} from "./constants.mjs";

/**
 * Safely parse a value into a number. Checks for NaN and Infinity.
 * Returns NaN if the string is not a valid number.
 * @param value The value to parse.
 * @returns The parsed number or NaN if the value is not a valid number.
 */
export function safeParseNumber(value: unknown): number {
  // `Number("")` is 0, which would silently turn a blank option such as
  // `--initialPageParam ""` into a numeric 0. Treat blank strings as NaN so
  // callers keep the original value.
  if (typeof value === "string" && value.trim() === "") {
    return Number.NaN;
  }
  const parsed = Number(value);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    return parsed;
  }
  return Number.NaN;
}

export function formatOptions(options: LimitedUserConfig) {
  // loop through properties on the options object
  // if the property is a string of number then convert it to a number
  // if the property is a string of boolean then convert it to a boolean
  const formattedOptions = Object.entries(options).reduce(
    (acc, [key, value]) => {
      const typedKey = key as keyof LimitedUserConfig;
      const typedValue = value as (typeof options)[keyof LimitedUserConfig];
      const parsedNumber = safeParseNumber(typedValue);
      if (value === "true" || value === true) {
        (acc as unknown as Record<string, boolean>)[typedKey] = true;
      } else if (value === "false" || value === false) {
        (acc as unknown as Record<string, boolean>)[typedKey] = false;
      } else if (!Number.isNaN(parsedNumber)) {
        (acc as unknown as Record<string, number>)[typedKey] = parsedNumber;
      } else {
        (
          acc as unknown as Record<
            string,
            string | number | undefined | boolean
          >
        )[typedKey] = typedValue;
      }
      return acc;
    },
    options,
  );
  return formattedOptions;
}

export function buildRequestsOutputPath(outputPath: string) {
  return path.join(outputPath, requestsOutputPath);
}

export function buildQueriesOutputPath(outputPath: string) {
  return path.join(outputPath, queriesOutputPath);
}

export function buildMocksOutputPath(outputPath: string) {
  return path.join(outputPath, mocksOutputPath);
}
