import os
import json
import time
import re
import secrets
import logging
from typing import Any, Dict

import boto3

# Configuration (can be overridden with environment variables)
REGION = os.getenv('AWS_REGION', 'us-east-1')
S3_ACCESSPOINT = os.getenv('S3_ACCESSPOINT_ARN', 'arn:aws:s3:us-east-1:440744238215:accesspoint/edf-rag-kb')
KEY_PREFIX = os.getenv('KEY_PREFIX', 'htmls/')
URL_TTL = int(os.getenv('URL_TTL_SECONDS', '900'))  # seconds

# Boto3 S3 client
s3 = boto3.client('s3', region_name=REGION)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _respond(status_code: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
        'body': json.dumps(payload),
    }


def lambda_handler(event, context):
    """Lambda handler: expects event.body to be JSON with { files: [{ name, type, size }] }

    Returns JSON: { uploads: [{ name, url, s3Key, method }] }
    """
    try:
        body = event.get('body', '')
        if isinstance(body, str):
            body = json.loads(body) if body else {}
        elif body is None:
            body = {}

        files = body.get('files', []) if isinstance(body, dict) else []
        if not isinstance(files, list) or len(files) == 0:
            return _respond(400, {'error': 'Missing files array'})

        uploads = []
        for f in files:
            name = f.get('name', 'file') if isinstance(f, dict) else 'file'
            ftype = f.get('type', 'text/html') if isinstance(f, dict) else 'text/html'

            # sanitize name to produce a safe key
            safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', name)
            rand = secrets.token_hex(4)
            # include millisecond timestamp to reduce collisions
            key = f"{KEY_PREFIX}{int(time.time() * 1000)}-{rand}-{safe_name}"

            params = {
                'Bucket': S3_ACCESSPOINT,
                'Key': key,
                'ContentType': ftype,
            }

            # generate presigned URL for PUT
            url = s3.generate_presigned_url(
                ClientMethod='put_object',
                Params=params,
                ExpiresIn=URL_TTL,
                HttpMethod='PUT',
            )

            uploads.append({'name': name, 'url': url, 's3Key': key, 'method': 'PUT'})

        return _respond(200, {'uploads': uploads})

    except Exception as e:
        logger.exception('upload-init error')
        return _respond(500, {'error': str(e)})
