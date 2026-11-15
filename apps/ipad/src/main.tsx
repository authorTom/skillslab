import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadManagedConfig, watchManagedConfig } from "./data/provisioning";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./index.css";

// Read the MDM's settings straight away, without waiting on it: installed
// content opens regardless, and anything that needs them waits for this.
void loadManagedConfig();
watchManagedConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
