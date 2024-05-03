import axios from "axios";
import type { RawAxiosRequestHeaders } from "axios";

import type { ApiRequestOptions } from "./ApiRequestOptions";
import { CancelablePromise } from "./CancelablePromise";
import type { OpenAPIConfig } from "./OpenAPI";

// Optional: Get and link the cancelation token, so the request can be aborted.
const source = axios.CancelToken.source();

const axiosInstance = axios.create({
  // Your custom Axios instance config
  baseURL: "http://localhost:4010",
  headers: {
    // Your custom headers
  } satisfies RawAxiosRequestHeaders,
});

// Add a request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    // Do something before request is sent
    if (!config.url || !config.params) {
      return config;
    }

    for (const [key, value] of Object.entries<string>(config.params)) {
      const stringToSearch = `{${key}}`;
      if (
        config.url !== undefined &&
        config.url.search(stringToSearch) !== -1
      ) {
        config.url = config.url.replace(`{${key}}`, encodeURIComponent(value));
        delete config.params[key];
      }
    }

    return config;
  },
  (error) => {
    // Do something with request error
    return Promise.reject(error);
  },
);

// Add a response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
  },
  (error) => {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    return Promise.reject(error);
  },
);

export const request = <T>(
  config: OpenAPIConfig,
  options: ApiRequestOptions,
): CancelablePromise<T> => {
  return new CancelablePromise((resolve, reject, onCancel) => {
    onCancel(() => source.cancel("The user aborted a request."));

    let formattedHeaders = options.headers as RawAxiosRequestHeaders;
    if (options.mediaType) {
      formattedHeaders = {
        ...options.headers,
        "Content-Type": options.mediaType,
      } satisfies RawAxiosRequestHeaders;
    }

    return axiosInstance
      .request({
        url: options.url,
        data: options.body,
        method: options.method,
        params: options.path,
        headers: formattedHeaders,
        cancelToken: source.token,
      })
      .then((res) => {
        resolve(res.data);
      })
      .catch((error) => {
        reject(error);
      });
  });
};
