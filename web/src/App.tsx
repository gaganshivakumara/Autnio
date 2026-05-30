// Halo — root app with hash-based routing.
import { useEffect, useState } from "react";
import { LandingPage } from "./landing/LandingPage";
import { Dashboard } from "./dashboard/Dashboard";
import { ChatPage } from "./pages/ChatPage";
import { VisionPage } from "./pages/VisionPage";
import { ProductDiscoveryPage } from "./pages/ProductDiscoveryPage";
import { RelayPage } from "./pages/RelayPage";

type Route = "landing" | "app" | "chat" | "vision" | "product-discovery" | "relay";

function getRoute(): Route {
  const h = window.location.hash;
  if (h === "#/app") return "app";
  if (h === "#/chat") return "chat";
  if (h === "#/vision") return "vision";
  if (h === "#/product-discovery") return "product-discovery";
  if (h === "#/relay") return "relay";
  return "landing";
}

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHash = () => {
      setRoute(getRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goToLanding = () => { window.location.hash = "#/"; };

  if (route === "app") return <Dashboard onBack={goToLanding} />;
  if (route === "chat") return <ChatPage />;
  if (route === "vision") return <VisionPage />;
  if (route === "product-discovery") return <ProductDiscoveryPage />;
  if (route === "relay") return <RelayPage />;

  return <LandingPage onSignIn={() => { window.location.hash = "#/app"; }} />;
}
