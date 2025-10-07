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
import { getCorsConfig } from '@/config/cors';

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
  const [selectedProvider, setSelectedProvider] = useState('aws');

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

  // S3-Compatible Service Providers
  const s3Providers: DropdownOption[] = [
    { value: 'aws', label: 'Amazon Web Services (AWS)' },
    { value: 'wasabi', label: 'Wasabi Cloud Storage' },
    { value: 'backblaze', label: 'Backblaze B2' },
    { value: 'cloudflare', label: 'Cloudflare R2' },
    { value: 'minio', label: 'MinIO' },
  ];

  const [copiedCode, setCopiedCode] = useState(false);

  // Provider configurations
  const providerConfigs = {
    aws: {
      name: 'Amazon Web Services (AWS)',
      endpoint: '',
      defaultRegion: 'us-east-1',
      regions: awsRegions,
      docs: {
        title: 'Setup Your AWS S3 Bucket',
        corsInstructions:
          'Go to your AWS S3 Console → Select your bucket → Permissions tab → Cross-origin resource sharing (CORS)',
        permissions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html',
        docsLabel: 'AWS S3 CORS Documentation',
      },
    },
    wasabi: {
      name: 'Wasabi Cloud Storage',
      endpoint: 'https://s3.{{region}}.wasabisys.com',
      defaultRegion: 'us-east-1',
      regions: [
        { value: 'us-east-1', label: 'US East 1 (N. Virginia) - us-east-1' },
        { value: 'us-east-2', label: 'US East 2 (N. Virginia) - us-east-2' },
        { value: 'us-central-1', label: 'US Central 1 (Texas) - us-central-1' },
        { value: 'us-west-1', label: 'US West 1 (Oregon) - us-west-1' },
        { value: 'eu-central-1', label: 'EU Central 1 (Amsterdam) - eu-central-1' },
        { value: 'eu-central-2', label: 'EU Central 2 (Frankfurt) - eu-central-2' },
        { value: 'eu-west-1', label: 'EU West 1 (London) - eu-west-1' },
        { value: 'eu-west-2', label: 'EU West 2 (Paris) - eu-west-2' },
        { value: 'ap-northeast-1', label: 'AP Northeast 1 (Tokyo) - ap-northeast-1' },
        { value: 'ap-northeast-2', label: 'AP Northeast 2 (Osaka) - ap-northeast-2' },
        { value: 'ap-southeast-1', label: 'AP Southeast 1 (Singapore) - ap-southeast-1' },
        { value: 'ap-southeast-2', label: 'AP Southeast 2 (Sydney) - ap-southeast-2' },
      ],
      docs: {
        title: 'Setup Your Wasabi Bucket',
        corsInstructions:
          'Log into Wasabi Console → Select your bucket → Policies → CORS Configuration',
        permissions: ['GetObject', 'PutObject', 'DeleteObject', 'ListBucket'],
        docsUrl:
          'https://wasabi-support.zendesk.com/hc/en-us/articles/360015106031-How-do-I-enable-CORS-on-my-bucket-',
        docsLabel: 'Wasabi CORS Documentation',
      },
    },
    backblaze: {
      name: 'Backblaze B2',
      endpoint: 'https://s3.{{region}}.backblazeb2.com',
      defaultRegion: 'us-west-002',
      regions: [
        { value: 'us-west-002', label: 'US West (California) - us-west-002' },
        { value: 'us-west-001', label: 'US West (Arizona) - us-west-001' },
        { value: 'eu-central-003', label: 'EU Central (Amsterdam) - eu-central-003' },
      ],
      docs: {
        title: 'Setup Your Backblaze B2 Bucket',
        corsInstructions:
          'Install the B2 cli tool, authenticate and apply the CORS configuration using the command line. View the documentation for details.',
        permissions: ['listFiles', 'readFiles', 'writeFiles', 'deleteFiles'],
        docsUrl:
          'https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-cli#add-cors-rules-with-a-json-file-(macos-and-linux)',
        docsLabel: 'Backblaze B2 CORS Documentation',
      },
    },
    cloudflare: {
      name: 'Cloudflare R2',
      endpoint: 'https://{{accountId}}.r2.cloudflarestorage.com',
      defaultRegion: 'auto',
      regions: [
        { value: 'auto', label: 'Automatic - auto' },
        { value: 'wnam', label: 'Western North America - wnam' },
        { value: 'enam', label: 'Eastern North America - enam' },
        { value: 'weur', label: 'Western Europe - weur' },
        { value: 'eeur', label: 'Eastern Europe - eeur' },
        { value: 'apac', label: 'Asia Pacific - apac' },
      ],
      docs: {
        title: 'Setup Your Cloudflare R2 Bucket',
        corsInstructions:
          'Go to Cloudflare Dashboard → R2 Object Storage → Select your bucket → Settings → CORS Policy',
        permissions: ['Read', 'Write', 'Delete', 'List'],
        docsUrl: 'https://developers.cloudflare.com/r2/api/s3/api/',
        docsLabel: 'Cloudflare R2 API Documentation',
      },
    },
    minio: {
      name: 'MinIO',
      endpoint: 'https://your-minio-server.com',
      defaultRegion: 'us-east-1',
      regions: [{ value: 'us-east-1', label: 'US East 1 - us-east-1' }],
      docs: {
        title: 'Setup Your MinIO Server',
        corsInstructions:
          'Configure CORS using MinIO Client (mc) or MinIO Console → Buckets → Select bucket → Summary → Access Policy',
        permissions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        docsUrl: 'https://min.io/docs/minio/linux/developers/javascript/API.html',
        docsLabel: 'MinIO JavaScript API Documentation',
      },
    },
  };

  const currentProvider = providerConfigs[selectedProvider as keyof typeof providerConfigs];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Get the endpoint from provider config or use custom endpoint
      let endpoint = formCreds.endpoint;
      if (!endpoint && currentProvider.endpoint) {
        endpoint = currentProvider.endpoint.replace('{{region}}', formCreds.region);
      }

      // Only include endpoint if it has a value
      const credentials: Credentials = {
        accessKeyId: formCreds.accessKeyId,
        secretAccessKey: formCreds.secretAccessKey,
        bucketName: formCreds.bucketName,
        prefix: formCreds.prefix,
        region: formCreds.region,
        ...(endpoint && endpoint.trim() && { endpoint: endpoint.trim() }),
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

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = providerConfigs[providerId as keyof typeof providerConfigs];

    // Update form with provider defaults
    setFormCreds((prev) => ({
      ...prev,
      region: provider.defaultRegion,
      endpoint: provider.endpoint || '',
    }));
  };

  const corsConfig = getCorsConfig(selectedProvider);

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
                <h2 className="text-2xl font-bold text-foreground">S3-Compatible Storage</h2>
              </div>
              <p className="text-muted-foreground">
                Connect to AWS S3 or any S3-compatible storage service to manage your files.
              </p>
            </div>

            {/* Service Provider Selection */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Cloud className="h-4 w-4" />
                  Storage Provider
                </label>
                <CustomDropdown
                  options={s3Providers}
                  value={selectedProvider}
                  onChange={handleProviderChange}
                  placeholder="Select your storage provider"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Choose your S3-compatible storage provider. Each provider has specific
                  configuration requirements.
                </p>
              </div>
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
                  options={currentProvider.regions}
                  value={formCreds.region}
                  onChange={(value) => setFormCreds({ ...formCreds, region: value })}
                  placeholder={`Select ${currentProvider.name} Region`}
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
              {(selectedProvider !== 'aws' || formCreds.endpoint) && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Folder className="h-4 w-4" />
                    Endpoint
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                    placeholder={currentProvider.endpoint || 'Endpoint URL'}
                    value={formCreds.endpoint}
                    onChange={(e) => setFormCreds({ ...formCreds, endpoint: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedProvider === 'aws'
                      ? 'Optional custom endpoint URL for your S3 bucket.'
                      : currentProvider.endpoint
                        ? `Default: ${currentProvider.endpoint.replace('{{region}}', formCreds.region)}`
                        : 'Enter the endpoint URL for your storage service.'}
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full cursor-pointer" disabled={isLoading}>
                {isLoading ? 'Connecting...' : `Connect to ${currentProvider.name}`}
              </Button>
            </form>
          </div>

          {/* Documentation Section */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {currentProvider.docs.title}
              </h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">1. Configure CORS Policy</h4>
                  <p className="text-sm text-muted-foreground">
                    {currentProvider.docs.corsInstructions}
                  </p>
                </div>

                {/* Only show JSON section for providers that use JSON CORS config */}
                {['aws', 'wasabi', 'cloudflare'].includes(selectedProvider) && (
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
                      <pre className="text-xs text-foreground whitespace-pre-wrap">
                        {corsConfig}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">
                    {['aws', 'wasabi', 'cloudflare'].includes(selectedProvider) ? '3.' : '2.'}{' '}
                    Required Permissions
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Your credentials need these permissions:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                    {currentProvider.docs.permissions.map((permission, index) => (
                      <li key={index}>
                        • <code className="bg-muted px-1 rounded">{permission}</code>
                      </li>
                    ))}
                  </ul>
                </div>

                {currentProvider.docs.docsUrl !== '#' && (
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ExternalLink className="h-4 w-4" />
                      <a
                        href={currentProvider.docs.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors"
                      >
                        {currentProvider.docs.docsLabel}
                      </a>
                    </div>
                  </div>
                )}
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
