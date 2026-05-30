// Halo — root app with hash-based routing.
import { useCallback, useEffect, useState } from "react";
import { LandingPage } from "./landing/LandingPage";
import { Dashboard } from "./dashboard/Dashboard";

type Route = "landing" | "app";

function getRoute(): Route {
  return window.location.hash === "#/app" ? "app" : "landing";
}

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goToApp = useCallback(() => {
    window.location.hash = "#/app";
    window.scrollTo(0, 0);
  }, []);

  const goToLanding = useCallback(() => {
    window.location.hash = "#/";
    window.scrollTo(0, 0);
  }, []);

  if (route === "app") {
    return <Dashboard onBack={goToLanding} />;
  }

  return <LandingPage onSignIn={goToApp} />;
}
