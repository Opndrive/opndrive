'use client';

import { Shield, Server, Key, Lock } from 'lucide-react';

export function PrivacySettingsPanel() {
  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">Your Data, Your Control</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Opndrive is designed with privacy and data sovereignty in mind
          </p>
        </div>
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Server className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Self-Hosted Architecture</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Opndrive runs entirely on your infrastructure. No data is ever transmitted to our
                servers or any third-party services. You maintain complete ownership and control
                over your files and metadata.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Key className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Your S3 Credentials</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You provide your own S3-compatible storage credentials (AWS S3, MinIO, etc.). These
                secrets remain on your server and are never shared with Opndrive developers or any
                external services.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">Security & Privacy</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Built-in protections for your self-hosted environment
          </p>
        </div>
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Shield className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Zero Data Collection</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Opndrive doesn't collect usage analytics, telemetry, or any personal information. No
                phone-home functionality, no tracking, no data mining. Your usage patterns remain
                completely private.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Lock className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Open Source & Transparent</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The entire codebase is open source, allowing you to audit every line of code. You
                can verify there are no backdoors, hidden data collection, or unexpected network
                calls to external services.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
