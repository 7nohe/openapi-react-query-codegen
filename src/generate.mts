import path from "node:path";
import { type UserConfig, createClient } from "@hey-api/openapi-ts";
import { safeParseNumber } from "./common.mjs";
import { defaultOutputPath, requestsOutputPath } from "./constants.mjs";
import { createSource } from "./createSource.mjs";
import { print } from "./print.mjs";

export async function generate(options: UserConfig, version: string) {
  const openApiOutputPath = path.join(
    options.output ?? defaultOutputPath,
    requestsOutputPath,
  );

  // loop through properties on the options object
  // if the property is a string of number then convert it to a number
  // if the property is a string of boolean then convert it to a boolean
  const formattedOptions = Object.entries(options).reduce(
    (acc, [key, value]) => {
      const typedKey = key as keyof UserConfig;
      const typedValue = value as (typeof options)[keyof UserConfig];
      const parsedNumber = safeParseNumber(typedValue);
      if (!Number.isNaN(parsedNumber)) {
        (acc[typedKey] as unknown as number) = parsedNumber;
      } else if (value === "true") {
        (acc[typedKey] as unknown as boolean) = true;
      } else if (value === "false") {
        (acc[typedKey] as unknown as boolean) = false;
      } else {
        (acc[typedKey] as unknown as
          | string
          | boolean
          | Record<string, unknown>
          | undefined) = typedValue;
      }
      return acc;
    },
    options,
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
