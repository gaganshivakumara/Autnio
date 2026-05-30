import { useEffect, useRef, useState } from "react";

export function CameraFeed({ onFrame }: { onFrame: (blob: Blob) => void }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let stream: MediaStream | undefined;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((mediaStream) => {
        stream = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not start camera");
      });

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const captureFrame = (): void => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0, 512, 512);
    canvas.toBlob((blob) => blob && onFrame(blob), "image/jpeg", 0.85);
  };

  return (
    <div className="cameraFeed">
      <video ref={videoRef} autoPlay playsInline muted />
      {error ? <p className="error">{error}</p> : null}
      <button type="button" onClick={captureFrame}>
        Analyze Scene
      </button>
    </div>
  );
}
