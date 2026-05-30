// Dev 3/4 — generates a pre-signed S3 PUT URL for camera frame uploads
// The browser uploads the frame directly to S3, then passes the S3 key
// to the vision Lambda endpoint (POST /vision/image or /vision/text).
//
// Env vars: VISION_BUCKET
// IAM: s3:PutObject on vision bucket granted by FunctionsStack
//
// Returns:
//   { statusCode: 200, body: { result: "ok", data: { uploadUrl, s3Key } } }
// The browser PUTs the JPEG frame to uploadUrl, then sends s3Key to /vision/image.

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');

const s3 = new S3Client({});

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub ?? 'unknown';
  const s3Key = `frames/${userId}/${randomUUID()}.jpg`;

  const command = new PutObjectCommand({
    Bucket: process.env.VISION_BUCKET,
    Key: s3Key,
    ContentType: 'image/jpeg',
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

  return {
    statusCode: 200,
    body: JSON.stringify({ result: 'ok', data: { uploadUrl, s3Key } }),
  };
};
