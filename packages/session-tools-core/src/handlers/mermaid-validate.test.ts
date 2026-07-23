import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { handleMermaidValidate } from './mermaid-validate.ts';

/**
 * `handleMermaidValidate` installs LinkeDOM onto globalThis (window/document/
 * HTMLElement/navigator) the first time it runs. Capture and restore so later
 * suites do not inherit a half-browser environment.
 */
const GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'DOMParser',
  'XMLSerializer',
] as const;

type GlobalSnapshot = Partial<Record<(typeof GLOBAL_KEYS)[number], unknown>>;

function snapshotGlobals(): GlobalSnapshot {
  const g = globalThis as unknown as Record<string, unknown>;
  const snap: GlobalSnapshot = {};
  for (const key of GLOBAL_KEYS) {
    if (key in g) snap[key] = g[key];
  }
  return snap;
}

function restoreGlobals(snap: GlobalSnapshot): void {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snap, key)) {
      g[key] = snap[key];
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
}

function parseResult(result: Awaited<ReturnType<typeof handleMermaidValidate>>) {
  return JSON.parse(result.content[0]!.text) as { valid: boolean; message?: string; error?: string; diagramType?: string };
}

describe('handleMermaidValidate', () => {
  let globalsBefore: GlobalSnapshot;

  beforeAll(() => {
    globalsBefore = snapshotGlobals();
  });

  afterAll(() => {
    restoreGlobals(globalsBefore);
  });

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
