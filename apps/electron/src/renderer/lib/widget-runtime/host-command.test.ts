import { describe, expect, test } from 'bun:test'
import { widgetDescriptorFromHostCommand } from './host-command'

describe('widgetDescriptorFromHostCommand', () => {
  test.each([
    '开启cowart canvas',
    '开一下cowart',
    '打开 Cowart 画布',
    '请启动 Cowart 无限画布',
    'open cowart canvas',
  ])('opens Cowart for an explicit host command: %s', (message) => {
    expect(widgetDescriptorFromHostCommand(message, { projectDir: '/tmp/project' })).toMatchObject({
      kind: 'cowart-canvas',
      projectDir: '/tmp/project',
      source: 'craft',
    })
  })

  test.each([
    'Cowart 是什么？',
    '研究一下如何打开 Cowart canvas',
    '不要打开 Cowart 画布',
  ])('ignores Cowart discussion: %s', (message) => {
    expect(widgetDescriptorFromHostCommand(message, { projectDir: '/tmp/project' })).toBeNull()
  })
})
