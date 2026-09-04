import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import App from "./App";

const el = document.getElementById("root");
if (!el) throw new Error("missing root");
createRoot(el).render(createElement(StrictMode, null, createElement(App)));
