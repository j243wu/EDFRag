# AWS BMO KafkaidApp – Next.js Starter (TypeScript)

A static Next.js (App Router) frontend for an API Gateway → Lambda RAG backend.

## Quickstart
```bash
npm install
cp .env.local.example .env.local
# edit NEXT_PUBLIC_API_GATEWAY_URL
npm run dev
```

## Build
```bash
npm run build
```
Outputs static site to `out/` for S3+CloudFront or Amplify Hosting.

## Notes
- Ensure API Gateway CORS allows your site origin.
- Lambda should return `{ text, sources: [{title?, url}] }` and complete < 28s.
