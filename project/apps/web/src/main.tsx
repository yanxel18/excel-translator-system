import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import App from "./App";
import { LocaleProvider } from "./features/shared/LocaleProvider";
import "./index.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider
      defaultColorScheme="light"
      theme={{
        primaryColor: "blue",
        defaultRadius: "md",
        fontFamily: "Poppins, system-ui, sans-serif",
        fontSizes: {
          xs: "0.75rem",
          sm: "0.875rem",
          md: "1rem",
          lg: "1.125rem",
          xl: "1.25rem",
        },
        headings: {
          fontFamily: "Poppins, system-ui, sans-serif",
          fontWeight: "600",
          sizes: {
            h1: { fontSize: "1.625rem", lineHeight: "1.25" },
            h2: { fontSize: "1.125rem", lineHeight: "1.35" },
            h3: { fontSize: "1rem", lineHeight: "1.4" },
          },
        },
      }}
    >
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </MantineProvider>
  </React.StrictMode>,
);
