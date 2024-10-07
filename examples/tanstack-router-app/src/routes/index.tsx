import { createFileRoute } from "@tanstack/react-router";
import { ensureUseFindPetsData } from "../../openapi/queries/ensureQueryData";
import { useFindPetsSuspense } from "../../openapi/queries/suspense";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await ensureUseFindPetsData(context.queryClient);
  },
  component: HomeComponent,
});
function HomeComponent() {
  const petsSuspense = useFindPetsSuspense();
  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {petsSuspense.data?.map?.((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <div>{post.name}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
