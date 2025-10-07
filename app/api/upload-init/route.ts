import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_ACCESSPOINT = 'arn:aws:s3:us-east-1:440744238215:accesspoint/edf-rag-kb';
const BUCKET_PREFIX = 'htmls/';

const s3 = new S3Client({ region: 'us-east-1' });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const files: { name: string; type: string; size: number }[] = body.files || [];
    if (!files.length) return NextResponse.json({ uploads: [] });

    const uploads = await Promise.all(files.map(async (f) => {
      const key = `${BUCKET_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2,8)}-${f.name}`;
      const cmd = new PutObjectCommand({ Bucket: S3_ACCESSPOINT, Key: key, ContentType: f.type });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 900 });
      return { name: f.name, url, s3Key: key, method: 'PUT' };
    }));

    return NextResponse.json({ uploads });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
