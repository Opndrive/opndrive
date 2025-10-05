'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button, CustomDropdown, type DropdownOption } from '@/shared/components/ui';
import { Credentials } from '@opndrive/s3-api';
import {
  ArrowLeft,
  Cloud,
  Shield,
  Key,
  Database,
  MapPin,
  Folder,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import Link from 'next/link';

export default function ConnectPage() {
  const router = useRouter();
  const { createSession } = useAuth();
  const [formCreds, setFormCreds] = useState<Credentials>({
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    prefix: '',
    endpoint: '',
    region: 'us-east-1',
  });
  const [isLoading, setIsLoading] = useState(false);

  // AWS Regions
  const awsRegions: DropdownOption[] = [
    { value: 'us-east-1', label: 'US East (N. Virginia) - us-east-1' },
    { value: 'us-east-2', label: 'US East (Ohio) - us-east-2' },
    { value: 'us-west-1', label: 'US West (N. California) - us-west-1' },
    { value: 'us-west-2', label: 'US West (Oregon) - us-west-2' },
    { value: 'ap-south-1', label: 'Asia Pacific (Mumbai) - ap-south-1' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo) - ap-northeast-1' },
    { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul) - ap-northeast-2' },
    { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka) - ap-northeast-3' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore) - ap-southeast-1' },
    { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney) - ap-southeast-2' },
    { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta) - ap-southeast-3' },
    { value: 'ca-central-1', label: 'Canada (Central) - ca-central-1' },
    { value: 'eu-central-1', label: 'Europe (Frankfurt) - eu-central-1' },
    { value: 'eu-west-1', label: 'Europe (Ireland) - eu-west-1' },
    { value: 'eu-west-2', label: 'Europe (London) - eu-west-2' },
    { value: 'eu-west-3', label: 'Europe (Paris) - eu-west-3' },
    { value: 'eu-north-1', label: 'Europe (Stockholm) - eu-north-1' },
    { value: 'eu-south-1', label: 'Europe (Milan) - eu-south-1' },
    { value: 'me-south-1', label: 'Middle East (Bahrain) - me-south-1' },
    { value: 'sa-east-1', label: 'South America (São Paulo) - sa-east-1' },
    { value: 'af-south-1', label: 'Africa (Cape Town) - af-south-1' },
  ];
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Only include endpoint if it has a value
      const credentials: Credentials = {
        accessKeyId: formCreds.accessKeyId,
        secretAccessKey: formCreds.secretAccessKey,
        bucketName: formCreds.bucketName,
        prefix: formCreds.prefix,
        region: formCreds.region,
        ...(formCreds.endpoint &&
          formCreds.endpoint.trim() && { endpoint: formCreds.endpoint.trim() }),
      };

      await createSession(credentials);
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('Invalid credentials, please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const corsConfig = `{
  "AllowedHeaders": [
    "*"
  ],
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
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(corsConfig);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
            <div className="h-4 w-px bg-border" />
            <h1 className="text-lg font-semibold text-foreground">Connect to AWS S3</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="space-y-6">
            <div className="text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Cloud className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">AWS S3 Configuration</h2>
              </div>
              <p className="text-muted-foreground">
                Connect your AWS S3 bucket to start managing your files with Opndrive.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Key className="h-4 w-4" />
                  Access Key ID
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  placeholder="Enter your AWS Access Key ID"
                  value={formCreds.accessKeyId}
                  onChange={(e) => setFormCreds({ ...formCreds, accessKeyId: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Shield className="h-4 w-4" />
                  Secret Access Key
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  placeholder="Enter your AWS Secret Access Key"
                  value={formCreds.secretAccessKey}
                  onChange={(e) => setFormCreds({ ...formCreds, secretAccessKey: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Database className="h-4 w-4" />
                  Bucket Name
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  placeholder="your-bucket-name"
                  value={formCreds.bucketName}
                  onChange={(e) => setFormCreds({ ...formCreds, bucketName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MapPin className="h-4 w-4" />
                  Region
                </label>
                <CustomDropdown
                  options={awsRegions}
                  value={formCreds.region}
                  onChange={(value) => setFormCreds({ ...formCreds, region: value })}
                  placeholder="Select AWS Region"
                  disabled={isLoading}
                  allowCustomValue={true}
                  customValuePlaceholder="Enter custom region..."
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Folder className="h-4 w-4" />
                  Prefix (Optional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  placeholder="folder-path/ (optional)"
                  value={formCreds.prefix}
                  onChange={(e) => setFormCreds({ ...formCreds, prefix: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Optional folder path within your bucket to use as the root directory.
                </p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Folder className="h-4 w-4" />
                  Endpoint
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  placeholder="Endpoint URL (optional)"
                  value={formCreds.endpoint}
                  onChange={(e) => setFormCreds({ ...formCreds, endpoint: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Optional custom endpoint URL for your S3 bucket.
                </p>
              </div>

              <Button type="submit" className="w-full cursor-pointer" disabled={isLoading}>
                {isLoading ? 'Connecting...' : 'Connect to S3'}
              </Button>
            </form>
          </div>

          {/* Documentation Section */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Setup Your S3 Bucket</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">1. Configure CORS Policy</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to your AWS S3 Console → Select your bucket → Permissions tab → Cross-origin
                    resource sharing (CORS)
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">2. Paste this JSON</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyToClipboard}
                      className="flex items-center gap-2"
                    >
                      {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedCode ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="bg-muted p-3 rounded-md overflow-x-auto">
                    <pre className="text-xs text-foreground whitespace-pre-wrap">{corsConfig}</pre>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">
                    3. Required IAM Permissions
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Your AWS credentials need these S3 permissions:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                    <li>
                      • <code className="bg-muted px-1 rounded">s3:GetObject</code>
                    </li>
                    <li>
                      • <code className="bg-muted px-1 rounded">s3:PutObject</code>
                    </li>
                    <li>
                      • <code className="bg-muted px-1 rounded">s3:DeleteObject</code>
                    </li>
                    <li>
                      • <code className="bg-muted px-1 rounded">s3:ListBucket</code>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ExternalLink className="h-4 w-4" />
                    <a
                      href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground transition-colors"
                    >
                      AWS S3 CORS Documentation
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">Security Note</h4>
                  <p className="text-xs text-muted-foreground">
                    Your credentials are stored locally in your browser and never sent to our
                    servers. All file operations happen directly between your browser and AWS S3.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
