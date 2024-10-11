import { client } from "../openapi/requests/services.gen";

client.setConfig({
  baseURL: "http://localhost:4010",
  throwOnError: true,
});
