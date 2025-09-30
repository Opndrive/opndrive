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
    <section id="faq" className=" bg-background py-24 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-medium text-[var(--text-primary)] mb-4">
            Curious about Opndrive?
          </h2>
          <p className="text-lg text-[var(--text-secondary)]">
            Take a look at our FAQ to learn more.
          </p>
        </div>

        {/* Expand All Button */}
        <div className="flex justify-end mb-8">
          <button
            onClick={toggleExpandAll}
            className="flex items-center gap-2 text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
          >
            <span className="text-sm font-medium">{expandAll ? 'Collapse all' : 'Expand all'}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${expandAll ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* FAQ Items */}
        <div className="space-y-0">
          {faqData.map((item, index) => (
            <div key={index} className="">
              <button
                onClick={() => toggleItem(index)}
                className="w-full py-6 flex items-center justify-between text-left hover:bg-[var(--surface-hover)] transition-colors px-4 -mx-4 rounded-lg"
              >
                <h3 className="text-xl font-medium text-[var(--text-primary)] pr-4">
                  {item.question}
                </h3>
                <ChevronDown
                  className={`w-5 h-5 text-[var(--accent-blue)] transition-transform flex-shrink-0 ${
                    openItems.includes(index) ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openItems.includes(index) && (
                <div className="pb-6 px-4 -mx-4">
                  <p className="text-[var(--text-secondary)] leading-relaxed">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
