/**
 * What a post is made of, read from its HTML: for now, its FAQ.
 *
 * A post that ends with its own "FAQ" section should not have the product FAQ
 * stacked underneath it, and the questions it answers can be described to
 * search engines as an FAQPage. Both need the same thing: the questions and
 * answers the post shows.
 */

import type { Element, ElementContent, Root, RootContent } from 'hast';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

export interface PostFaqItem {
  question: string;
  /** The answer as plain text, whitespace collapsed. */
  answer: string;
}

/** "FAQ", "FAQs", "Frequently asked questions", with or without more after it. */
const FAQ_HEADING = /^(faqs?|frequently asked questions)\b/i;

function isElement(node: RootContent | ElementContent, tagName?: string): node is Element {
  return node.type === 'element' && (tagName === undefined || node.tagName === tagName);
}

function text(nodes: Array<RootContent | ElementContent>): string {
  return nodes
    .map((node) => toString(node))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FaqHeading {
  heading: Element;
  parent: Root | Element;
  index: number;
}

/**
 * The post's FAQ heading: the first `<h2>` reading "FAQ" (or "Frequently asked
 * questions"), or with id "faq". Null when the post has none.
 */
export function findFaqHeading(tree: Root): FaqHeading | null {
  let found: FaqHeading | null = null;

  visit(tree, 'element', (node, index, parent) => {
    if (found || node.tagName !== 'h2' || index === undefined || !parent) return;
    if (node.properties?.id === 'faq' || FAQ_HEADING.test(toString(node).trim())) {
      found = { heading: node, parent: parent as Root | Element, index };
    }
  });

  return found;
}

/**
 * The questions and answers under the post's FAQ heading.
 *
 * The section is an `<h2>` reading "FAQ" (or "Frequently asked questions", or
 * with id "faq"); each question is an `<h3>` inside it, and its answer is
 * everything up to the next question or the end of the section. A question
 * with no answer under it is left out. Empty when the post has no FAQ.
 */
export function extractFaq(tree: Root): PostFaqItem[] {
  const section = findFaqHeading(tree);
  if (!section) return [];
  const { parent, index } = section;
  const start = index + 1;

  const items: PostFaqItem[] = [];
  let question: string | null = null;
  let answer: Array<RootContent | ElementContent> = [];

  const finish = () => {
    const answerText = text(answer);
    if (question && answerText) items.push({ question, answer: answerText });
  };

  for (const node of parent.children.slice(start)) {
    // The next section of the post ends the FAQ.
    if (isElement(node, 'h2') || isElement(node, 'h1')) break;

    if (isElement(node, 'h3')) {
      finish();
      question = toString(node).replace(/\s+/g, ' ').trim();
      answer = [];
    } else if (question) {
      answer.push(node);
    }
  }
  finish();

  return items;
}
