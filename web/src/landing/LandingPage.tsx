// Halo — cinematic marketing landing page.
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";

export function LandingPage({ onSignIn: _onSignIn }: { onSignIn: () => void }) {
  const scrollToCapabilities = () => {
    document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Hero onScrollDown={scrollToCapabilities} />
      <div id="capabilities">
        <Capabilities />
      </div>
      <Statement />
      <Footer />
    </>
  );
}
