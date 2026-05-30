import { useEffect, useRef } from "react";

const BUTTERFLY_SRC =
  "https://cdn.cursors-4u.net/css-previews/flying-cute-green-butterfly-048fdd1c-css.webp";
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

  return (
    <img
      ref={imgRef}
      src={BUTTERFLY_SRC}
      width={SIZE}
      height={SIZE}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 99999,
        transform: "translate(-6px, -6px)",
        imageRendering: "crisp-edges",
      }}
      aria-hidden
    />
  );
}
