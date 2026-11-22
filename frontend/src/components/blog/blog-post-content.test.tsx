/**
 * Copy buttons on a post's code blocks.
 *
 * The buttons are plain HTML inside the post, wired up by one listener on the
 * wrapper, so these tests click them the way a reader does and check what
 * reached the clipboard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BlogPostContent } from './blog-post-content';

const POST =
  '<p>Run this:</p>' +
  '<pre><code class="language-bash">aws s3 ls &lt;BUCKET&gt;\n</code></pre>' +
  '<pre><code class="language-js">const a = 1;\nconst b = 2;\n</code></pre>';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BlogPostContent code blocks', () => {
  it('copies the decoded code of the block that was pressed, without its last newline', async () => {
    render(<BlogPostContent content={POST} />);

    const buttons = screen.getAllByRole('button', { name: 'Copy code' });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[1]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;'));

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('aws s3 ls <BUCKET>'));
  });

  it('confirms the copy, then goes back to its resting state', async () => {
    vi.useFakeTimers();
    render(<BlogPostContent content={POST} />);
    const button = screen.getAllByRole('button', { name: 'Copy code' })[0];

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button.dataset.state).toBe('copied');
    expect(button.parentElement?.textContent).toContain('Copied');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(button.dataset.state).toBeUndefined();
    expect(button.parentElement?.textContent).not.toContain('Copied');
  });

  it('selects the code when the clipboard refuses, so the shortcut still works', async () => {
    writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
    render(<BlogPostContent content={POST} />);
    const button = screen.getAllByRole('button', { name: 'Copy code' })[0];

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button.dataset.state).toBe('selected');
    expect(window.getSelection()?.toString()).toContain('aws s3 ls <BUCKET>');
  });
});
