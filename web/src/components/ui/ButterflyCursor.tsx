import { useEffect, useRef } from "react";

// Two wing-position frames extracted from the cursors-4u animation CSS
const FRAME_1 =
  "data:image/webp;base64,UklGRqoAAABXRUJQVlA4TJ0AAAAvH8AHEC8gEEjyd5tpDYFAsr9bTAsECLdqNZn/EP5SQgK4akA3bt6PGWQEYhVADgOY4v5bcs0fTdITQET/JyBw9ken/FSjU36q0ZnAuoifsFMwOnNpxAlTDQARs9QbIVRpoi27pfSfYG+5ylgxZuc2dBZcpeYVEmfO48DUTHJtaQHhnFVpwYqMI7C6eezHkm3CSisw6yeAPZ2xwDcDAA==";

const FRAME_2 =
  "data:image/webp;base64,UklGRqYAAABXRUJQVlA4TJkAAAAvH8AHEC8gEEjyd5tpDYFAsr9bTAsECLdqNZn/EP5SQgK4ra01b76GAZyfBcTxABbRAIlQzwlm/2GSQJU+ov8TEKjeqeQloZKXhCqB/BhesBKMAATB6Nun6UnrzCwVV6XMweu5nZlHH5oTF9Hcu2A8WG4JMh69z0JjoV+G4N4yCOcmgaQdQ0Ipgd3XnCnbF79SMFu3HGCB/wgA";

// Wing-flap timing: hold wings-up ~800ms, wings-down ~200ms
const FRAMES: [string, number][] = [
  [FRAME_1, 800],
  [FRAME_2, 200],
];

const SIZE = 72;

export function ButterflyCursor() {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (imgRef.current) {
        imgRef.current.style.left = `${e.clientX}px`;
        imgRef.current.style.top = `${e.clientY}px`;
      }
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  // Animate between frames
  useEffect(() => {
    let frameIdx = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (imgRef.current) imgRef.current.src = FRAMES[frameIdx][0];
      timer = setTimeout(() => {
        frameIdx = (frameIdx + 1) % FRAMES.length;
        tick();
      }, FRAMES[frameIdx][1]);
    };

    tick();
    return () => clearTimeout(timer);
  }, []);

  return (
    <img
      ref={imgRef}
      src={FRAME_1}
      width={SIZE}
      height={SIZE}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 99999,
        transform: "translate(-6px, -6px)",
        imageRendering: "pixelated",
      }}
      aria-hidden
    />
  );
}
