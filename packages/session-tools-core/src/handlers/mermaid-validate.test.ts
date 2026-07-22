import { describe, expect, it } from 'bun:test';
import { handleMermaidValidate } from './mermaid-validate.ts';

function parseResult(result: Awaited<ReturnType<typeof handleMermaidValidate>>) {
  return JSON.parse(result.content[0]!.text) as { valid: boolean; message?: string; error?: string; diagramType?: string };
}

describe('handleMermaidValidate', () => {
  it('accepts xychart-beta diagrams supported by the renderer', async () => {
    const result = await handleMermaidValidate({} as any, {
      code: [
        'xychart-beta',
        '  title "Monthly Revenue"',
        '  x-axis [Jan, Feb, Mar]',
        '  y-axis "Revenue" 0 --> 100',
        '  bar [25, 45, 80]',
        '  line [20, 50, 70]',
      ].join('\n'),
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result).valid).toBe(true);
  });

  it('accepts YAML frontmatter before the diagram', async () => {
    const result = await handleMermaidValidate({} as any, {
      code: [
        '---',
        'title: Frontmatter Example',
        '---',
        'graph LR',
        '  A --> B',
      ].join('\n'),
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result).valid).toBe(true);
  });

  it('accepts mindmaps supported by official Mermaid', async () => {
    const result = await handleMermaidValidate({} as any, {
      code: [
        'mindmap',
        '  root((Coffee beans))',
        '    Arabica',
        '    Robusta',
      ].join('\n'),
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toMatchObject({ valid: true, diagramType: 'mindmap' });
  });

  it('accepts timeline diagrams supported by official Mermaid', async () => {
    const result = await handleMermaidValidate({} as any, {
      code: [
        'timeline',
        '  title Product history',
        '  2025 : Prototype',
        '  2026 : Release',
      ].join('\n'),
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toMatchObject({ valid: true, diagramType: 'timeline' });
  });

  it('returns an error for invalid diagrams', async () => {
    const result = await handleMermaidValidate({} as any, {
      code: 'notADiagram\n  A --> B',
    });

    expect(result.isError).toBe(true);
    expect(parseResult(result).valid).toBe(false);
  });
});
