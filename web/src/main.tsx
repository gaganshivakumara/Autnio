import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ButterflyCursor } from "./components/ui/ButterflyCursor";
import "./design-tokens.css";
import "./atmosphere.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ButterflyCursor />
    <App />
  </React.StrictMode>,
);
