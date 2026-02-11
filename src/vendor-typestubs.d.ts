// Minimal type stubs for modules imported by @hey-api/openapi-ts but not used in this project.
// These are framework-specific client plugins bundled in a single package.
// Only the symbols actually referenced in @hey-api/openapi-ts type declarations are stubbed.

declare module "@angular/common/http" {
  export type HttpClient = any;
  export type HttpHeaders = any;
  export type HttpRequest<T = any> = any;
  export type HttpResponse<T = any> = any;
  export type HttpErrorResponse = any;
}

declare module "@angular/core" {
  export type Injector = any;
}

declare module "nuxt/app" {
  // AsyncDataOptions must be an empty interface (not `any`) so that
  // `keyof AsyncDataOptions<T>` = `never`, preserving `query` in:
  //   type FetchOptions$1<T> = Omit<UseFetchOptions<T,T>, keyof AsyncDataOptions<T>>
  export interface AsyncDataOptions<
    T = unknown,
    U = unknown,
    K = unknown,
    D = unknown,
  > {}
  // Must declare `query?` explicitly — it's preserved through:
  //   type FetchOptions$1<T> = Omit<UseFetchOptions<T,T>, keyof AsyncDataOptions<T>>
  // No index signature — it would leak through Omit and create type conflicts.
  export interface UseFetchOptions<T = unknown, U = unknown> {
    query?: unknown;
  }
  export function useAsyncData<T = unknown, E = unknown>(
    ...args: unknown[]
  ): unknown;
  export function useFetch<T = unknown, E = unknown>(
    ...args: unknown[]
  ): unknown;
  export function useLazyAsyncData<T = unknown, E = unknown>(
    ...args: unknown[]
  ): unknown;
  export function useLazyFetch<T = unknown, E = unknown>(
    ...args: unknown[]
  ): unknown;
}

declare module "vue" {
  export type Ref<T = any> = any;
}

declare module "ofetch" {
  export interface FetchOptions<T = any> {
    [key: string]: any;
  }
  export type ResponseType = any;
  export function ofetch<T = any>(...args: any[]): Promise<T>;
}

// Global $fetch used by @hey-api/client-nuxt types
declare function $fetch<T = any>(...args: any[]): Promise<T>;
