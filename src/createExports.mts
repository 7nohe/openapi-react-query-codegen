import { createUseMutation } from "./createUseMutation.mjs";
import { createUseQuery } from "./createUseQuery.mjs";
import type { Service } from "./service.mjs";

export const createExports = (service: Service) => {
	const { klasses } = service;
	const methods = klasses.flatMap((k) => k.methods);

	const allGet = methods.filter((m) => m.httpMethodName === "'GET'");
	const allPost = methods.filter((m) => m.httpMethodName === "'POST'");

	const allQueries = allGet.map((m) => createUseQuery(m));
	const allMutations = allPost.map((m) => createUseMutation(m));

	const commonInQueries = allQueries.flatMap(
		({ apiResponse, returnType, key }) => [apiResponse, returnType, key],
	);
	const commonInMutations = allMutations.flatMap(({ mutationResult }) => [
		mutationResult,
	]);

	const allCommon = [...commonInQueries, ...commonInMutations];

	const mainQueries = allQueries.flatMap(({ queryHook }) => [queryHook]);
	const mainMutations = allMutations.flatMap(({ mutationHook }) => [
		mutationHook,
	]);

	const mainExports = [...mainQueries, ...mainMutations];

	const suspenseQueries = allQueries.flatMap(({ suspenseQueryHook }) => [
		suspenseQueryHook,
	]);

	const suspenseExports = [...suspenseQueries];

	return {
		/**
		 * Common types and variables between queries (regular and suspense) and mutations
		 */
		allCommon,
		/**
		 * Main exports are the hooks that are used in the components
		 */
		mainExports,
		/**
		 * Suspense exports are the hooks that are used in the suspense components
		 */
		suspenseExports,
	};
};
