// Halo — cinematic marketing landing page.
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";

export function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <>
      <Hero onSignIn={onSignIn} />
      <Capabilities />
      <Statement />
      <Footer />
    </>
  );
}
