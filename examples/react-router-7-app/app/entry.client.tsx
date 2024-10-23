import React from "react";
import ReactDOM from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { routes } from "./routes";

ReactDOM.hydrateRoot(
  document,
  <React.StrictMode>
    {/* @ts-expect-error */}
    <HydratedRouter routes={routes} />
  </React.StrictMode>,
);
