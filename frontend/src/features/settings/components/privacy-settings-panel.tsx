'use client';

import Link from 'next/link';
import { Shield, Server, Key, Lock, BarChart3 } from 'lucide-react';

/**
 * What this panel says has to match what the app actually does.
 *
 * It used to claim zero data collection and that credentials stayed "on your
 * server". Both were written for a self-hosted deployment and neither survived
 * the hosted one: opndrive.app runs Vercel Analytics and Speed Insights, and
 * credentials live in the browser's localStorage rather than on any server.
 *
 * The copy below therefore separates the two deployments wherever they differ,
 * and names the analytics rather than denying it.
 */
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
              <h4 className="font-medium text-foreground mb-2">Your Files Never Reach Us</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Opndrive talks to your storage provider directly from your browser. Your files, and
                the names of your files, are never uploaded to an Opndrive server, because there is
                no Opndrive server in that path. This is true whether you use the hosted app or run
                your own copy.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Key className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Your S3 Credentials</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You bring your own S3-compatible credentials, and they are never transmitted to
                Opndrive or to any third party. They are stored in this browser, in localStorage, so
                that your session survives a refresh. Anything with access to this browser profile
                can read them, so use keys scoped to a single bucket with only the permissions you
                need, and sign out on a shared device.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">What We Collect</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Different on the hosted app and a self-hosted install
          </p>
        </div>
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <BarChart3 className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Analytics On The Hosted App</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                opndrive.app uses Vercel Web Analytics and Speed Insights to count page views and
                measure load times. Neither sets a cookie, and neither builds a profile of you. Page
                addresses are stripped of your search terms and file paths before they are sent, so
                what gets recorded is which page was opened, not what was in it.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Shield className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">No Accounts, No Tracking</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                There is no Opndrive account, so we hold no name, email address or password. There
                are no advertising trackers, no retargeting pixels, no session recording and no
                third-party marketing tools anywhere in the app, and nothing about you is ever sold
                or shared.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 border border-border">
            <Lock className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Self-Hosting Reports To Nobody</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Both analytics tools report to a collector that only exists on Vercel's platform,
                and they only ever address your own deployment. Run Opndrive anywhere else and there
                is nothing behind that address, so no usage data reaches Vercel or us. The codebase
                is open source, so you can verify every network call it makes rather than taking
                this page at its word.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">The Full Details</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything above, written out properly
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/privacy"
            className="text-sm text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </Link>
          <Link
            href="/privacy#storage"
            className="text-sm text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            What is stored in your browser
          </Link>
          <Link
            href="/terms"
            className="text-sm text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
