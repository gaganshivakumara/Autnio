import { useCallback, useEffect, useRef, useState } from "react";

type CameraFeedProps = {
  onFrame: (blob: Blob) => Promise<void> | void;
  registerCapture?: (capture: () => void) => void;
  captureLabel?: string;
  realtimeIntervalMs?: number;
};

const frameSize = 320;

export function CameraFeed({
  onFrame,
  registerCapture,
  captureLabel = "Check Surroundings",
  realtimeIntervalMs = 3500,
}: CameraFeedProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inFlightRef = useRef(false);
  const [error, setError] = useState<string>("");
  const [realTimeEnabled, setRealTimeEnabled] = useState(false);

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

  const captureFrame = useCallback(async (): Promise<void> => {
    if (!videoRef.current || inFlightRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    inFlightRef.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = frameSize;
    canvas.height = frameSize;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0, frameSize, frameSize);

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
      if (blob) await onFrame(blob);
    } finally {
      inFlightRef.current = false;
    }
  }, [onFrame]);

  useEffect(() => {
    if (!realTimeEnabled) return undefined;

    void captureFrame();
    const intervalId = window.setInterval(() => {
      void captureFrame();
    }, realtimeIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [captureFrame, realTimeEnabled, realtimeIntervalMs]);

  useEffect(() => {
    registerCapture?.(captureFrame);
  }, [registerCapture]);

  return (
    <div className="cameraFeed">
      <video ref={videoRef} autoPlay playsInline muted />
      {error ? <p className="error">{error}</p> : null}
      <div className="buttonRow">
        <button type="button" onClick={() => void captureFrame()}>
          {captureLabel}
        </button>
        <button type="button" onClick={() => setRealTimeEnabled((enabled) => !enabled)}>
          {realTimeEnabled ? "Stop Obstacle Guidance" : "Start Obstacle Guidance"}
        </button>
      </div>
    </div>
  );
}
