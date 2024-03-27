import { createClient, UserConfig } from "@hey-api/openapi-ts";
import { print } from "./print.js";
import path from "path";
import { createSource } from "./createSource.js";
import { defaultOutputPath, requestsOutputPath } from "./constants.js";
import { safeParseNumber } from "./common.js";

export async function generate(options: UserConfig, version: string) {
  const openApiOutputPath = path.join(
    options.output ?? defaultOutputPath,
    requestsOutputPath
  );

  // loop through properties on the options object
  // if the property is a string of number then convert it to a number
  // if the property is a string of boolean then convert it to a boolean
  const formattedOptions = Object.entries(options).reduce((acc, [key, value]) => {
    const typedKey = key as keyof UserConfig;
    const parsedNumber = safeParseNumber(value);
    if (!isNaN(parsedNumber)) {
      (acc as any)[typedKey] = parsedNumber;
    } else if (value === "true") {
      (acc as any)[typedKey] = true;
    } else if (value === "false") {
      (acc as any)[typedKey] = false;
    }
    return acc;
  }, options);
  await createClient({
    ...formattedOptions,
    output: openApiOutputPath,
    // TODO: Implement this feature - useOptions
    useOptions: false,
  });
  const source = createSource(openApiOutputPath, version);
  print(source, formattedOptions);
}
