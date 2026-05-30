// Halo — root app with hash-based routing.
import { useEffect, useState } from "react";
import { LandingPage } from "./landing/LandingPage";
import { Dashboard } from "./dashboard/Dashboard";
import { ChatPage } from "./pages/ChatPage";
import { VisionPage } from "./pages/VisionPage";
import { ProductDiscoveryPage } from "./pages/ProductDiscoveryPage";
import { RelayPage } from "./pages/RelayPage";

function getRoute() {
  const h = window.location.hash;
  if (h.startsWith("#/app")) return "app" as const;
  if (h.startsWith("#/chat")) return "chat" as const;
  if (h.startsWith("#/vision")) return "vision" as const;
  if (h.startsWith("#/product-discovery")) return "product-discovery" as const;
  if (h.startsWith("#/relay")) return "relay" as const;
  return "landing" as const;
}

export function App(): JSX.Element {
  // Tick just triggers a re-render; route is always derived fresh.
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setTick((n) => n + 1);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", refresh);
    return () => window.removeEventListener("hashchange", refresh);
  }, []);

  const route = getRoute();

  if (route === "app") return <Dashboard onBack={() => { window.location.hash = "#/"; }} />;
  if (route === "chat") return <ChatPage />;
  if (route === "vision") return <VisionPage />;
  if (route === "product-discovery") return <ProductDiscoveryPage />;
  if (route === "relay") return <RelayPage />;
  return <LandingPage onSignIn={() => { window.location.hash = "#/app"; }} />;
}
