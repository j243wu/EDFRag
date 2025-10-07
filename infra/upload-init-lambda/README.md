Deploying the upload-init Lambda + API Gateway (SAM)

This folder contains a minimal AWS SAM template and Lambda handler that returns presigned PUT URLs for uploading HTML files to your S3 Access Point.

Prereqs
- AWS CLI configured with credentials that can deploy CloudFormation/SAM and create IAM roles.
- AWS SAM CLI (sam) installed: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html

Steps
1) Build and package locally
   cd infra/upload-init-lambda
   sam build

2) Deploy (guided) — SAM will create an S3 bucket for code and deploy the stack
   sam deploy --guided

   During deploy, set parameters (accept defaults or change):
   - Stack Name: upload-init
   - AWS Region: us-east-1
   - Confirm changeset before deploy: Y
   - Allow SAM CLI to create roles with required permissions: Y

3) After deployment the output `UploadInitApiUrl` will contain the API URL you should set as `NEXT_PUBLIC_UPLOAD_INIT_URL` in Amplify environment variables.

IAM policy for the Lambda (minimal)

{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:us-east-1:440744238215:accesspoint/edf-rag-kb/*"
    }
  ]
}

Notes
- The handler uses the AWS SDK v2 `getSignedUrl` which is available in the Lambda runtime by default. If you prefer SDK v3, update the handler and package dependencies.
- The S3 Access Point ARN is set in the template; change if needed.
- The presigned URLs expire in 900s (15 minutes) by default.
