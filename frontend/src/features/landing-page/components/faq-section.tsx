'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { faqData } from '../config/faq-section';

export default function FAQSection() {
  const [openItems, setOpenItems] = useState<number[]>([]);
  const [expandAll, setExpandAll] = useState(false);

  const toggleItem = (index: number) => {
    setOpenItems((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      setOpenItems([]);
    } else {
      setOpenItems(faqData.map((_, index) => index));
    }
    setExpandAll(!expandAll);
  };

  return (
    <section id="faq" className="bg-background py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] mb-3 sm:mb-4">
            Curious about Opndrive?
          </h2>
          <p className="text-sm sm:text-base md:text-lg lg:text-lg text-[var(--text-secondary)]">
            Take a look at our FAQ to learn more.
          </p>
        </div>

        {/* Expand All Button */}
        <div className="flex justify-end mb-6 sm:mb-8">
          <button
            onClick={toggleExpandAll}
            className="flex items-center gap-1.5 sm:gap-2 text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors px-2 py-1 rounded-md hover:bg-[var(--surface-hover)]"
          >
            <span className="text-xs sm:text-sm font-medium">
              {expandAll ? 'Collapse all' : 'Expand all'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${expandAll ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* FAQ Items */}
        <div className="space-y-0">
          {faqData.map((item, index) => (
            <div key={index} className="">
              <button
                onClick={() => toggleItem(index)}
                className="w-full py-4 sm:py-5 md:py-6 flex items-center justify-between text-left hover:bg-[var(--surface-hover)] transition-colors px-2 sm:px-3 md:px-4 -mx-2 sm:-mx-3 md:-mx-4 rounded-lg"
              >
                <h3 className="text-base sm:text-lg md:text-xl font-medium text-[var(--text-primary)] pr-3 sm:pr-4 leading-tight">
                  {item.question}
                </h3>
                <ChevronDown
                  className={`w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-blue)] transition-transform flex-shrink-0 ${
                    openItems.includes(index) ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openItems.includes(index) && (
                <div className="pb-4 sm:pb-5 md:pb-6 px-2 sm:px-3 md:px-4 -mx-2 sm:-mx-3 md:-mx-4">
                  <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
