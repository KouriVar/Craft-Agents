import { describe, expect, test } from 'bun:test';
import type { SessionToolContext } from '../context.ts';
import {
  CRAFT_WIDGET_RESULT_PREFIX,
  handleRenderCowartCanvasWidget,
} from './render-cowart-canvas-widget.ts';

function context(projectDir?: string): SessionToolContext {
  return {
    workspacePath: '/workspace',
    workingDirectory: projectDir,
    fs: {
      exists: (path: string) => path === '/project',
      isDirectory: (path: string) => path === '/project',
    },
  } as unknown as SessionToolContext;
}

describe('handleRenderCowartCanvasWidget', () => {
  test('returns a widget descriptor for the session working directory', async () => {
    const result = await handleRenderCowartCanvasWidget(context('/project'), { pageId: 'page-1' });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text.startsWith(CRAFT_WIDGET_RESULT_PREFIX)).toBe(true);
    expect(result.structuredContent?.widget).toMatchObject({
      kind: 'cowart-canvas',
      projectDir: '/project',
      pageId: 'page:page-1',
      source: 'cowart-tool',
    });
  });

  test('requires an existing directory', async () => {
    const result = await handleRenderCowartCanvasWidget(context(), { projectDir: '/missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
  });

  test('requires projectDir when the context has no working directory', async () => {
    const result = await handleRenderCowartCanvasWidget(context(), {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires projectDir');
  });

  test('rejects an unsafe page ID', async () => {
    const result = await handleRenderCowartCanvasWidget(context('/project'), { pageId: '../other' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid Cowart pageId');
  });
});
