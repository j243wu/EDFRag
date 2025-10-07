This project includes a server API to issue presigned S3 upload URLs used by the Knowledge Base page.

What I added

- app/api/upload-init/route.ts — POST endpoint that accepts { files: [{name,type,size}] } and returns presigned PUT URLs. It uses the AWS SDK v3 to sign PutObject requests and stores files under the `htmls/` prefix on the specified S3 access point.

Requirements

- Install AWS SDK v3 packages in the project (server-side):
  npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

- Configure AWS credentials (the server must have permission to PutObject on the access point). You can provide credentials via environment variables or an IAM role if deployed.

- The S3 access point used in the code is:
  arn:aws:s3:us-east-1:440744238215:accesspoint/edf-rag-kb

- If you want the upload-init route to use a different region or access point, edit `app/api/upload-init/route.ts`.

Environment variables

- NEXT_PUBLIC_UPLOAD_INIT_URL — should point to the deploy URL for `/api/upload-init` (e.g. https://.../api/upload-init)

Security

- The presigned URLs are valid for 15 minutes by default. Adjust `expiresIn` in the code if needed.

Notes

- The current implementation uses PUT uploads directly to the presigned URL. If you prefer form POST uploads, the server can return POST policy documents instead.
