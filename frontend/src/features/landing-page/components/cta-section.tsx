import { Button } from '@/shared/components/ui';
import Image from 'next/image';
import { FaDiscord } from 'react-icons/fa';
import { DISCORD_URL } from '@/config/links';

interface CTASectionProps {
  handleGetStarted: () => Promise<void>;
  isLoading: boolean;
}

export default function CTASection({ handleGetStarted, isLoading }: CTASectionProps) {
  return (
    <section id="get-started" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-0 lg:px-8">
        <div className="bg-card/30 rounded-lg sm:rounded-xl shadow-md p-6 sm:p-8 md:p-12 lg:p-16 text-center">
          <div className="mx-auto mb-4 sm:mb-6 w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Opndrive"
              width={48}
              height={48}
              className="object-contain w-full h-full sm:w-16 sm:h-16 md:w-20 md:h-20"
            />
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6 max-w-3xl mx-auto leading-tight">
            Ready to take control of your S3 storage?
          </h2>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
            Connect your S3 bucket in minutes and start managing your files with{' '}
            <strong>Opndrive's</strong> beautiful, modern interface.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
            <Button
              size="lg"
              onClick={handleGetStarted}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 sm:px-8 md:px-10 lg:px-12 py-2.5 sm:py-3 md:py-4 text-sm sm:text-base md:text-lg font-medium min-w-[120px] sm:min-w-[140px] md:min-w-[160px]"
            >
              {isLoading ? 'Loading...' : 'Get Started'}
            </Button>

            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-discord-brand px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-4 text-sm sm:text-base md:text-lg font-medium text-discord-brand-foreground shadow-sm transition-colors duration-200 hover:bg-discord-brand-hover min-w-[120px] sm:min-w-[140px] md:min-w-[160px]"
            >
              <FaDiscord className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              Join our Discord
            </a>
          </div>

          <p className="mt-4 sm:mt-6 text-xs sm:text-sm text-muted-foreground">
            Hangouts and live demos every Wednesday at 5 PM UTC.
          </p>
        </div>
      </div>
    </section>
  );
}
