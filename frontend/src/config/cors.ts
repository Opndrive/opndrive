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
};

export const getCorsConfig = (provider: string): string => {
  return corsConfig[provider] || '';
};
