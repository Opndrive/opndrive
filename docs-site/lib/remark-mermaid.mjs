import { visit } from 'unist-util-visit';
import { valueToEstree } from 'estree-util-value-to-estree';

/** Turns ```mermaid fences into <Mermaid chart={"..."} /> before Nextra's
 *  syntax highlighter processes the tree, since raw diagram source is
 *  needed as-is (Shiki-highlighted output can't be un-rendered back to text).
 *
 *  The chart source is passed as a JS expression (estree Literal), not a
 *  plain JSX string attribute - a plain string attribute gets its newlines
 *  collapsed during MDX's whitespace normalization, which silently turns a
 *  multi-line diagram into one unparseable line for Mermaid. */
export function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || !parent || index === null || index === undefined) return;

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'Mermaid',
        attributes: [
          {
            type: 'mdxJsxAttribute',
            name: 'chart',
            value: {
              type: 'mdxJsxAttributeValueExpression',
              value: JSON.stringify(node.value),
              data: {
                estree: {
                  type: 'Program',
                  body: [{ type: 'ExpressionStatement', expression: valueToEstree(node.value) }],
                  sourceType: 'module',
                },
              },
            },
          },
        ],
        children: [],
      };
    });
  };
}
