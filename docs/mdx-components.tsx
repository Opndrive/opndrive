import type { MDXComponents } from 'mdx/types';
import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import { Mermaid } from './components/mermaid';

const docsComponents = getDocsMDXComponents({
  Mermaid,
});

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...docsComponents,
    ...components,
  };
}
