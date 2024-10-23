import React from "react";
import ReactDOM from "react-dom/client";
import { Compoment, loader } from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./queryClient";
import "./axios";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { ClientFetchWrapper } from "./ClientFetchWrapper";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Compoment />,
    loader: loader(queryClient),
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ClientFetchWrapper>
        <RouterProvider router={router} />
      </ClientFetchWrapper>
      <ReactQueryDevtools buttonPosition="bottom-left" />
    </QueryClientProvider>
  </React.StrictMode>,
);
