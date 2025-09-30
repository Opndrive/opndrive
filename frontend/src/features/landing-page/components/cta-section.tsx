import { Button } from '@/shared/components/ui';
import Image from 'next/image';

interface CTASectionProps {
  handleGetStarted: () => Promise<void>;
  isLoading: boolean;
}

export default function CTASection({ handleGetStarted, isLoading }: CTASectionProps) {
  return (
    <section id="get-started" className="py-16 sm:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-card/30 rounded-xl shadow-md p-8 sm:p-12 md:p-16 text-center">
          <div className="mx-auto mb-6 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
            <Image
              src="/logo-nobg.png"
              alt="Opndrive"
              width={72}
              height={72}
              className="object-contain"
            />
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 sm:mb-6 max-w-3xl mx-auto leading-tight">
            Ready to take control of your S3 storage?
          </h2>

          <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto">
            Connect your S3 bucket in minutes and start managing your files with{' '}
            <strong>Opndrive's</strong> beautiful, modern interface.
          </p>

          <div className="flex justify-center items-center">
            <Button
              size="lg"
              onClick={handleGetStarted}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 sm:px-10 py-3 sm:py-4 text-base sm:text-lg font-medium"
            >
              {isLoading ? 'Loading...' : 'Get Started'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
