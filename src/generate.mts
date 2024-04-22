import { createClient, UserConfig } from "@hey-api/openapi-ts";
import { print } from "./print.mjs";
import path from "path";
import { createSource } from "./createSource.mjs";
import { defaultOutputPath, requestsOutputPath } from "./constants.mjs";
import { safeParseNumber } from "./common.mjs";

export async function generate(options: UserConfig, version: string) {
  const openApiOutputPath = path.join(
    options.output ?? defaultOutputPath,
    requestsOutputPath
  );

  // loop through properties on the options object
  // if the property is a string of number then convert it to a number
  // if the property is a string of boolean then convert it to a boolean
  const formattedOptions = Object.entries(options).reduce(
    (acc, [key, value]) => {
      const typedKey = key as keyof UserConfig;
      const typedValue = value as (typeof options)[keyof UserConfig];
      const parsedNumber = safeParseNumber(typedValue);
      if (value === "true" || value === true) {
        (acc as any)[typedKey] = true;
      } else if (value === "false" || value === false) {
        (acc as any)[typedKey] = false;
      } else if (!isNaN(parsedNumber)) {
          (acc as any)[typedKey] = parsedNumber;
      } else {
        (acc as any)[typedKey] = typedValue;
      }
      return acc;
    },
    options
  );
  const config: UserConfig = {
    ...formattedOptions,
    output: openApiOutputPath,
    useOptions: true,
    exportCore: true,
    exportModels: true,
    exportServices: true,
    write: true,
  };
  await createClient(config);
  const source = await createSource({
    outputPath: openApiOutputPath,
    version,
    serviceEndName: "Service", // we are hard coding this because changing the service end name was depreciated in @hey-api/openapi-ts
  });
  await print(source, formattedOptions);
}
