import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { errorResponse } from '../response.ts';

export const CRAFT_WIDGET_RESULT_PREFIX = '__CRAFT_WIDGET_DESCRIPTOR__';

export interface RenderCowartCanvasWidgetArgs {
  projectDir?: string;
  pageId?: string;
  title?: string;
}

function resolveProjectDir(input: string, baseDir: string): string {
  const expanded = input === '~' || input.startsWith('~/')
    ? resolve(homedir(), input.slice(2))
    : input;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded);
}

function normalizePageId(input?: string): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  const normalized = value.startsWith('page:') ? value : `page:${value}`;
  return /^page:[A-Za-z0-9_-]+$/.test(normalized) ? normalized : undefined;
}

export async function handleRenderCowartCanvasWidget(
  ctx: SessionToolContext,
  args: RenderCowartCanvasWidgetArgs,
): Promise<ToolResult> {
  const requestedProjectDir = args.projectDir?.trim() || ctx.workingDirectory;
  if (!requestedProjectDir) {
    return errorResponse('render_cowart_canvas_widget requires projectDir when the session has no working directory.');
  }

  const projectDir = resolveProjectDir(requestedProjectDir, ctx.workingDirectory || ctx.workspacePath);
  if (!ctx.fs.exists(projectDir) || !ctx.fs.isDirectory(projectDir)) {
    return errorResponse(`Cowart project directory was not found: ${projectDir}`);
  }

  const requestedPageId = args.pageId?.trim();
  const pageId = normalizePageId(requestedPageId);
  if (requestedPageId && !pageId) {
    return errorResponse(`Invalid Cowart pageId: ${requestedPageId}`);
  }
  const descriptor = {
    kind: 'cowart-canvas' as const,
    id: `cowart-canvas:${pageId || 'default'}`,
    projectDir,
    ...(pageId ? { pageId } : {}),
    source: 'cowart-tool' as const,
    ...(args.title?.trim() ? { title: args.title.trim() } : {}),
  };

  return {
    content: [{ type: 'text', text: `${CRAFT_WIDGET_RESULT_PREFIX}${JSON.stringify(descriptor)}` }],
    structuredContent: { widget: descriptor },
    isError: false,
  };
}
