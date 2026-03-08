import { client } from "../openapi/requests/client.gen";

client.setConfig({
  baseUrl: "http://localhost:4010",
  throwOnError: true,
});
