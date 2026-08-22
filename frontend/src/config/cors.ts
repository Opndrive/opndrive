const corsConfig: Record<string, string> = {
  aws: `
{
    "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
    ],
    "AllowedOrigins": [
        "https://your-domain.com"
    ],
    "ExposeHeaders": [
        "ETag"
    ],
    "MaxAgeSeconds": 3000
}`,
  cloudflare: `
{
    "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
    ],
    "AllowedOrigins": [
        "https://your-domain.com"
    ],
    "ExposeHeaders": [
        "ETag"
    ],
    "MaxAgeSeconds": 3000
}`,
  backblaze: `
[
    {
    "corsRuleName": "cors-rules",
    "allowedOrigins": [
        "https://your-domain.com",
    ],
    "allowedHeaders": ["*"],
    "allowedOperations": [
        "s3_get", 
        "s3_put", 
        "s3_delete", 
        "s3_head"
    ],
    "exposeHeaders": [
        "ETag"
    ],
    "maxAgeSeconds": 3600
    }
]`,
  // Wasabi accepts the same shape as S3 but wants AllowedHeaders set, without
  // which the presigned upload preflight is rejected.
  wasabi: `
{
    "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
    ],
    "AllowedOrigins": [
        "https://your-domain.com"
    ],
    "AllowedHeaders": [
        "*"
    ],
    "ExposeHeaders": [
        "ETag"
    ],
    "MaxAgeSeconds": 3000
}`,
  // Applied with: mc admin config set myminio api cors_allow_origin="..."
  // or through the console. The JSON below mirrors the S3 shape mc expects.
  minio: `
{
    "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
    ],
    "AllowedOrigins": [
        "https://your-domain.com"
    ],
    "AllowedHeaders": [
        "*"
    ],
    "ExposeHeaders": [
        "ETag"
    ],
    "MaxAgeSeconds": 3000
}`,
  // The plain S3 shape, for anything not named above. AllowedHeaders is set
  // because a service we cannot test against is the one most likely to reject
  // the presigned-upload preflight without it.
  custom: `
{
    "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
    ],
    "AllowedOrigins": [
        "https://your-domain.com"
    ],
    "AllowedHeaders": [
        "*"
    ],
    "ExposeHeaders": [
        "ETag"
    ],
    "MaxAgeSeconds": 3000
}`,
};

export const getCorsConfig = (provider: string): string => {
  return corsConfig[provider] || '';
};
