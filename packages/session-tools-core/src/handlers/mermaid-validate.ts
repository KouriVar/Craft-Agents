/**
 * Mermaid Validate Handler
 *
 * Validates Mermaid diagram syntax using the official Mermaid parser.
 * Some official diagram parsers sanitize labels while parsing. A lightweight
 * LinkeDOM document is installed before Mermaid loads so those parsers use the
 * same DOMPurify path as the browser without pulling JSDOM into CA's main bundle.
 */

import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { normalizeMermaidSource } from '../validation.ts';

export interface MermaidValidateArgs {
  code: string;
  render?: boolean;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function getOfficialMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const globals = globalThis as unknown as Record<string, unknown>;
      if (typeof globals.document === 'undefined') {
        const { parseHTML } = await import('linkedom');
        const parsed = parseHTML('<!doctype html><html><body></body></html>') as unknown as Record<string, unknown>;
        const window = parsed.window as Record<string, unknown>;
        globals.window = window;
        globals.document = window.document;
        globals.navigator = window.navigator;
        globals.Node = window.Node;
        globals.Element = window.Element;
        globals.HTMLElement = window.HTMLElement;
        globals.SVGElement = window.SVGElement;
        globals.DOMParser = window.DOMParser;
        globals.XMLSerializer = window.XMLSerializer;
      }
      return (await import('mermaid')).default;
    })();
  }
  return mermaidPromise;
}

/**
 * Handle the mermaid_validate tool call.
 *
 * Uses the same official Mermaid package as the renderer, so every diagram type
 * accepted by the pinned Mermaid version follows one syntax authority. YAML
 * frontmatter is stripped before validation because CA handles it as metadata.
 */
export async function handleMermaidValidate(
  _ctx: SessionToolContext,
  args: MermaidValidateArgs
): Promise<ToolResult> {
  const { code } = args;

  try {
    const mermaid = await getOfficialMermaid();
    const result = await mermaid.parse(normalizeMermaidSource(code));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: true,
          message: 'Diagram syntax is valid',
          diagramType: result.diagramType,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: false,
          error: errorMessage,
          suggestion: 'Check the syntax against ~/.craft-agent/docs/mermaid.md or the official Mermaid syntax reference',
        }, null, 2),
      }],
      isError: true,
    };
  }
}
