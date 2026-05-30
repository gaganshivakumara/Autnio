const uploadEndpoint = import.meta.env.VITE_S3_UPLOAD_LAMBDA_URL as string;
const restApiUrl = import.meta.env.VITE_REST_API_URL as string;

export type VisionMode = "detect" | "stream";

export type VisionResult = {
  result: string;
  data: Record<string, unknown>;
};

type UploadResponse = {
  uploadUrl: string;
  imageS3Key: string;
  bucket: string;
};

export async function uploadFrame(blob: Blob, userId: string): Promise<UploadResponse> {
  const response = await fetch(uploadEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, extension: "jpg" }),
  });

  if (!response.ok) throw new Error(`Upload URL request failed: ${response.status}`);
  const upload = (await response.json()) as UploadResponse;

  const put = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!put.ok) throw new Error(`S3 upload failed: ${put.status}`);

  return upload;
}

export async function analyzeFrame(input: {
  imageS3Key: string;
  mode: VisionMode;
  prompt?: string;
}): Promise<VisionResult> {
  const response = await fetch(`${restApiUrl}/vision/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(`Vision request failed: ${response.status}`);
  return (await response.json()) as VisionResult;
}
