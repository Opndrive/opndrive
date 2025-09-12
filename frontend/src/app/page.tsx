'use client';

import { useState } from 'react';
import Navbar from '@/components/landing-page/navbar';
import { Button } from '@/shared/components/ui';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Credentials } from '@opndrive/s3-api';

export default function LandingPage() {
  const router = useRouter();
  const { createSession } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [formCreds, setFormCreds] = useState<Credentials>({
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    prefix: '',
    region: '',
  });

  const handleGetStarted = () => {
    const stored = localStorage.getItem('s3_user_session');
    if (stored) {
      // Already logged in → go to dashboard
      router.push('/dashboard');
    } else {
      // No session → show dialog
      setShowDialog(true);
    }
  };

  const handleSubmit = async () => {
    try {
      await createSession(formCreds);
      setShowDialog(false);
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('Invalid credentials, please try again.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        <section className="w-full py-24 md:py-32 lg:py-40">
          <div className="container mx-auto px-4 text-center md:px-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="max-w-3xl space-y-3">
                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
                  Your Secure, Open-Source Cloud Storage
                </h1>
                <p className="text-lg text-muted-foreground md:text-xl">
                  Opndrive offers a powerful, AI-enhanced platform for seamless file sharing and
                  collaboration, giving you full control over your data.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-4 min-[400px]:flex-row">
                <Button size="lg" onClick={handleGetStarted}>
                  Get Started for Free
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-center border-t border-border bg-secondary py-4">
        <p className="text-sm text-secondary-foreground">
          &copy; {new Date().getFullYear()} Opndrive. All Rights Reserved.
        </p>
      </footer>

      {/* Simple credentials modal */}
      {showDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Enter AWS Credentials</h2>
            <input
              className="w-full mb-2 p-2 border rounded"
              placeholder="Access Key ID"
              value={formCreds.accessKeyId}
              onChange={(e) => setFormCreds({ ...formCreds, accessKeyId: e.target.value })}
            />
            <input
              className="w-full mb-2 p-2 border rounded"
              placeholder="Secret Access Key"
              type="password"
              value={formCreds.secretAccessKey}
              onChange={(e) => setFormCreds({ ...formCreds, secretAccessKey: e.target.value })}
            />
            <input
              className="w-full mb-2 p-2 border rounded"
              placeholder="Bucket Name"
              value={formCreds.bucketName}
              onChange={(e) => setFormCreds({ ...formCreds, bucketName: e.target.value })}
            />
            <input
              className="w-full mb-2 p-2 border rounded"
              placeholder="Region"
              value={formCreds.region}
              onChange={(e) => setFormCreds({ ...formCreds, region: e.target.value })}
            />
            <input
              className="w-full mb-4 p-2 border rounded"
              placeholder="Prefix (optional)"
              value={formCreds.prefix}
              onChange={(e) => setFormCreds({ ...formCreds, prefix: e.target.value })}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>Continue</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
