import { createClient } from "@hey-api/client-fetch";

export function ClientFetchWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  createClient({ baseUrl: "http://localhost:4010" });

  return <>{children}</>;
}
