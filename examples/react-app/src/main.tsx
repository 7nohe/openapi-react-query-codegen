import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { queryClient } from "./queryClient";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</React.StrictMode>,
);
