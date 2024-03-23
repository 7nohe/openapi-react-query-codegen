import axios from "axios";
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

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
  },
});

// Add a request interceptor
axiosInstance.interceptors.request.use(
  function (config) {
    // Do something before request is sent
    return config;
  },
  function (error) {
    // Do something with request error
    return Promise.reject(error);
  }
);

// Add a response interceptor
axiosInstance.interceptors.response.use(
  function (response) {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
  },
  function (error) {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    return Promise.reject(error);
  }
);

export const request = <T>(
  config: OpenAPIConfig,
  options: ApiRequestOptions
): CancelablePromise<T> => {
  return new CancelablePromise((resolve, reject, onCancel) => {
    onCancel(() => source.cancel("The user aborted a request."));

    let formattedHeaders = options.headers;
    if(options.mediaType) {
      formattedHeaders = {
        ...options.headers,
        "Content-Type": options.mediaType,
      };
    }

    return axiosInstance
      .request({
        url: options.url,
        data: options.body,
        method: options.method,
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
