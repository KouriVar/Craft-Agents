import { describe, expect, test } from 'bun:test'
import {
  CRAFT_WIDGET_RESULT_PREFIX,
  parseWidgetContent,
  widgetDescriptorFromToolResult,
  widgetDescriptorFromToolResultText,
} from './parser'

describe('parseWidgetContent', () => {
  test('leaves ordinary markdown as one markdown block', () => {
    const blocks = parseWidgetContent('Hello **world**')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'markdown', content: 'Hello **world**' })
  })

  test('splits markdown around an inline visualization directive', () => {
    const blocks = parseWidgetContent('Before\n\n::codex-inline-vis{file="demo.html"}\n\nAfter')
    expect(blocks.map((block) => block.type)).toEqual(['markdown', 'widget', 'markdown'])
    expect(blocks[1]).toMatchObject({
      type: 'widget',
      descriptor: { kind: 'visualize-html', file: 'demo.html', source: 'codex-inline-vis' },
    })
  })

  test('parses optional inline visualization attributes', () => {
    const blocks = parseWidgetContent('::codex-inline-vis{file="demo.html" title="Demo chart" height=720}')
    expect(blocks[0]).toMatchObject({
      type: 'widget',
      descriptor: {
        kind: 'visualize-html',
        file: 'demo.html',
        title: 'Demo chart',
        height: 720,
        source: 'codex-inline-vis',
      },
    })
  })

  test('parses Craft visualize widget directives', () => {
    const blocks = parseWidgetContent('::craft-widget{kind="visualize-html" file=".craft/visualizations/demo.html" title="Craft demo"}')
    expect(blocks[0]).toMatchObject({
      type: 'widget',
      descriptor: {
        kind: 'visualize-html',
        file: '.craft/visualizations/demo.html',
        title: 'Craft demo',
        source: 'craft',
      },
    })
  })

  test('parses Craft Cowart widget directives', () => {
    const blocks = parseWidgetContent('::craft-widget{kind="cowart-canvas" projectDir="/tmp/project" pageId="page:main" title="Canvas"}')
    expect(blocks[0]).toMatchObject({
      type: 'widget',
      descriptor: {
        kind: 'cowart-canvas',
        projectDir: '/tmp/project',
        pageId: 'page:main',
        title: 'Canvas',
        source: 'craft',
      },
    })
  })

  test('accepts unquoted attribute values', () => {
    const content = '::codex-inline-vis{file=demo.html}'
    expect(parseWidgetContent(content)[0]).toMatchObject({
      type: 'widget',
      descriptor: { kind: 'visualize-html', file: 'demo.html' },
    })
  })

  test('leaves directives without required attributes as markdown', () => {
    const content = '::codex-inline-vis{title="Missing file"}'
    expect(parseWidgetContent(content)[0]).toMatchObject({ type: 'markdown', content })
  })

  test('only renders a directive that occupies its own line', () => {
    const content = 'Example: ::codex-inline-vis{file="demo.html"}'
    expect(parseWidgetContent(content)).toEqual([
      expect.objectContaining({ type: 'markdown', content }),
    ])
  })

  test('does not render directives inside fenced code blocks', () => {
    const content = [
      '```text',
      '::codex-inline-vis{file="demo.html"}',
      '```',
      '',
      '::codex-inline-vis{file="real.html"}',
    ].join('\n')
    const blocks = parseWidgetContent(content)
    expect(blocks.filter((block) => block.type === 'widget')).toHaveLength(1)
    expect(blocks.find((block) => block.type === 'widget')).toMatchObject({
      descriptor: { file: 'real.html' },
    })
    expect(blocks[0]).toMatchObject({
      type: 'markdown',
      content: expect.stringContaining('file="demo.html"'),
    })
  })

  test('does not render indented code as a directive', () => {
    const content = '    ::codex-inline-vis{file="demo.html"}'
    expect(parseWidgetContent(content)).toEqual([
      expect.objectContaining({ type: 'markdown', content }),
    ])
  })
})

describe('widgetDescriptorFromToolResult', () => {
  test('adapts a Cowart tool result', () => {
    expect(widgetDescriptorFromToolResult({
      kind: 'cowart-canvas',
      projectDir: '/tmp/project',
      pageId: 'page-1',
    })).toMatchObject({
      kind: 'cowart-canvas',
      projectDir: '/tmp/project',
      pageId: 'page-1',
      source: 'cowart-tool',
    })
  })

  test('adapts a marked tool result string', () => {
    const descriptor = widgetDescriptorFromToolResultText(
      `${CRAFT_WIDGET_RESULT_PREFIX}${JSON.stringify({
        kind: 'cowart-canvas',
        projectDir: '/tmp/project',
        pageId: 'page-2',
        source: 'cowart-tool',
      })}`,
    )
    expect(descriptor).toMatchObject({ kind: 'cowart-canvas', pageId: 'page-2' })
  })

  test('ignores ordinary and malformed tool results', () => {
    expect(widgetDescriptorFromToolResultText('ordinary result')).toBeNull()
    expect(widgetDescriptorFromToolResultText(`${CRAFT_WIDGET_RESULT_PREFIX}{bad json`)).toBeNull()
  })
})
