'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { faqData } from '../config/faq-section';

export default function FAQSection() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  /**
   * Derived rather than stored. As its own state it could disagree with the
   * list it described: opening all eight by hand left the button still reading
   * "Expand all", and pressing it then changed nothing but its own label.
   */
  const allOpen = openItems.length === faqData.length;

  const toggleItem = (index: number) => {
    setOpenItems((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleExpandAll = () => {
    setOpenItems(allOpen ? [] : faqData.map((_, index) => index));
  };

  return (
    <section
      id="faq"
      className="scroll-mt-14 sm:scroll-mt-16 lg:scroll-mt-24 bg-background py-12 sm:py-16 md:py-20 lg:py-24"
    >
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
              {allOpen ? 'Collapse all' : 'Expand all'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${allOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* FAQ Items */}
        <div className="space-y-0">
          {faqData.map((item, index) => {
            const isOpen = openItems.includes(index);
            return (
              <div key={index}>
                {/* The heading wraps the control rather than sitting inside it.
                    A heading nested in a button is not a heading anyone can
                    navigate to, and these eight questions are the page's real
                    outline for a reader skipping through it. */}
                <h3>
                  <button
                    id={`faq-question-${index}`}
                    onClick={() => toggleItem(index)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${index}`}
                    className="w-full py-4 sm:py-5 md:py-6 flex items-center justify-between text-left hover:bg-[var(--surface-hover)] transition-colors px-2 sm:px-3 md:px-4 -mx-2 sm:-mx-3 md:-mx-4 rounded-lg"
                  >
                    <span className="text-base sm:text-lg md:text-xl font-medium text-[var(--text-primary)] pr-3 sm:pr-4 leading-tight">
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-blue)] transition-transform flex-shrink-0 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </h3>

                {/* The answer is always in the markup, collapsed to nothing by
                    a 0fr grid row rather than dropped from the tree.
                    Conditionally rendering it meant eight of the page's most
                    substantial answers - what the permissions are, where the
                    credentials live - reached a crawler as nothing at all.
                    `aria-hidden` still keeps a collapsed answer out of the
                    accessibility tree, which is safe here because the panel
                    holds only text, nothing focusable. */}
                <div
                  id={`faq-answer-${index}`}
                  role="region"
                  aria-labelledby={`faq-question-${index}`}
                  aria-hidden={!isOpen}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="pb-4 sm:pb-5 md:pb-6 px-2 sm:px-3 md:px-4 -mx-2 sm:-mx-3 md:-mx-4 text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
