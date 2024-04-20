import { useDefaultServiceFindPetsSuspense } from "../../openapi/queries/suspense";

export const SuspenseChild = () => {
	const { data } = useDefaultServiceFindPetsSuspense({ tags: [], limit: 10 });

	if (!Array.isArray(data)) {
		return <div>Error!</div>;
	}

	return (
		<ul>
			{data?.map((pet, index) => (
				<li key={pet.id}>{pet.name}</li>
			))}
		</ul>
	);
};
