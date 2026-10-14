import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Recovery } from "./Recovery";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><Recovery><App /></Recovery></StrictMode>);
