import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import BlobCursor from "./components/ui/BlobCursor";
import "./design-tokens.css";
import "./atmosphere.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BlobCursor
      fillColor="#4f6b4c"
      trailCount={3}
      sizes={[50, 100, 60]}
      innerSizes={[16, 28, 18]}
      innerColor="rgba(180,220,180,0.6)"
      opacities={[0.35, 0.2, 0.28]}
      shadowColor="rgba(40,60,40,0.4)"
      shadowBlur={8}
      shadowOffsetX={0}
      shadowOffsetY={0}
      filterStdDeviation={22}
      useFilter={true}
      fastDuration={0.08}
      slowDuration={0.45}
      zIndex={9999}
    />
    <App />
  </React.StrictMode>,
);
