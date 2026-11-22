/**
 * Reading a post's own FAQ out of its HTML: what counts as the section, what
 * counts as a question and its answer, and where the section ends.
 */
import { describe, expect, it } from 'vitest';
import { fromHtml } from 'hast-util-from-html';
import { extractFaq } from './outline';
import { renderPostContent } from './render';

const faqOf = (html: string) => extractFaq(fromHtml(html, { fragment: true }));

describe('extractFaq', () => {
  it('reads each question under the FAQ heading with everything up to the next one', () => {
    const faq = faqOf(
      '<h2 id="intro">Intro</h2><p>Not part of it.</p>' +
        '<h2 id="faq">FAQ</h2>' +
        '<h3>Can CORS cause SignatureDoesNotMatch?</h3><p>No.</p><p>CORS fails  first.</p>' +
        '<h3>Why only some file names?</h3><ul><li>Key encoding.</li></ul>' +
        '<h2>Check it in this order</h2><h3>Not a question</h3><p>Nope.</p>'
    );

    expect(faq).toEqual([
      { question: 'Can CORS cause SignatureDoesNotMatch?', answer: 'No. CORS fails first.' },
      { question: 'Why only some file names?', answer: 'Key encoding.' },
    ]);
  });

  it.each([
    '<h2>Frequently asked questions</h2>',
    '<h2>FAQs</h2>',
    '<h2>FAQ: presigned uploads</h2>',
    '<h2 id="faq">Questions people ask</h2>',
  ])('recognises %s as the FAQ heading', (heading) => {
    expect(faqOf(`${heading}<h3>Q?</h3><p>A.</p>`)).toEqual([{ question: 'Q?', answer: 'A.' }]);
  });

  it('finds nothing in a post without an FAQ section', () => {
    expect(faqOf('<h2>Steps</h2><h3>One?</h3><p>Do this.</p>')).toEqual([]);
  });

  it('leaves out a question with no answer under it', () => {
    expect(faqOf('<h2>FAQ</h2><h3>Empty?</h3><h3>Full?</h3><p>Yes.</p>')).toEqual([
      { question: 'Full?', answer: 'Yes.' },
    ]);
  });

  it('decodes entities in questions and answers', () => {
    expect(faqOf('<h2>FAQ</h2><h3>R2 &amp; B2?</h3><p>Both work &mdash; mostly.</p>')).toEqual([
      { question: 'R2 & B2?', answer: 'Both work — mostly.' },
    ]);
  });
});

describe('renderPostContent', () => {
  it('reports the FAQ it found alongside the HTML', async () => {
    const rendered = await renderPostContent('<h2>FAQ</h2><h3>Q?</h3><p>A.</p>');
    expect(rendered.faq).toEqual([{ question: 'Q?', answer: 'A.' }]);
  });

  it('wraps a bare table in a scrollable region, and leaves a wrapped one alone', async () => {
    const { html } = await renderPostContent(
      '<table><caption>Causes</caption><tr><td>a</td></tr></table>' +
        '<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table><tr><td>b</td></tr></table></div>'
    );
    const root = document.createElement('div');
    root.innerHTML = html;

    const wraps = root.querySelectorAll('.table-wrap');
    expect(wraps).toHaveLength(2);
    expect(wraps[0]!.getAttribute('role')).toBe('region');
    expect(wraps[0]!.getAttribute('tabindex')).toBe('0');
    expect(wraps[0]!.getAttribute('aria-label')).toBe('Causes');
    expect(root.querySelectorAll('.table-wrap .table-wrap')).toHaveLength(0);
  });
});
