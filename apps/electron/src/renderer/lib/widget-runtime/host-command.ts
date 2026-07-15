import type { WidgetDescriptor } from '../../../shared/widget-runtime'

const COWART_OPEN_COMMANDS = [
  /^(?:请)?(?:帮我)?(?:打开|开启|启动|唤醒|开)(?:一下)?\s*cowart(?:\s*(?:canvas|画布|无限画布))?(?:吧|一下)?[。！!]?$/i,
  /^(?:请)?(?:帮我)?(?:打开|开启|启动|唤醒|开)(?:一下)?\s*(?:cowart\s*)?(?:canvas|画布|无限画布)(?:吧|一下)?[。！!]?$/i,
  /^(?:open|launch|start)\s+(?:the\s+)?cowart(?:\s+(?:canvas|widget))?[.!]?$/i,
]

export interface WidgetHostCommandContext {
  projectDir: string
}

export function widgetDescriptorFromHostCommand(
  message: string,
  context: WidgetHostCommandContext,
): WidgetDescriptor | null {
  const command = message.trim()
  if (!command || !COWART_OPEN_COMMANDS.some((pattern) => pattern.test(command))) return null

  return {
    kind: 'cowart-canvas',
    id: 'cowart-canvas:default',
    projectDir: context.projectDir,
    source: 'craft',
    title: 'Cowart Canvas',
  }
}
