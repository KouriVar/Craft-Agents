import { describe, expect, it } from 'bun:test'
import {
  appendBrowserIntentCorrection,
  classifyBrowserNewTabIntent,
  getBrowserIntentSignature,
  normalizeBrowserIntentCorrections,
  type BrowserIntentCorrection,
} from '../new-tab-intent'

describe('classifyBrowserNewTabIntent', () => {
  it('opens explicit URLs, domains, localhost and IP addresses', () => {
    for (const value of ['https://example.com/docs', 'example.com', 'localhost:5173', '192.168.1.10']) {
      expect(classifyBrowserNewTabIntent(value).intent).toBe('navigate')
    }
  })

  it('uses search for short topics and names', () => {
    expect(classifyBrowserNewTabIntent('Electron updater').intent).toBe('search')
    expect(classifyBrowserNewTabIntent('上海天气').intent).toBe('search')
  })

  it('uses intelligent Q&A for questions and requested tasks', () => {
    expect(classifyBrowserNewTabIntent('Electron updater 为什么会降级').intent).toBe('ask-ai')
    expect(classifyBrowserNewTabIntent('帮我比较 Electron 和 Tauri').intent).toBe('ask-ai')
    expect(classifyBrowserNewTabIntent('How do I debug this updater?').intent).toBe('ask-ai')
  })

  it('does not store submitted text in its learning signature', () => {
    const prompt = '帮我分析这个不能公开的项目代号 Orion'
    expect(getBrowserIntentSignature(prompt)).not.toContain('Orion')
    expect(getBrowserIntentSignature(prompt)).not.toContain('项目代号')
  })

  it('learns only after two consistent corrections for similar input features', () => {
    const first = '上海天气怎么样'
    const similar = '北京天气怎么样'
    const initial = classifyBrowserNewTabIntent(first)
    expect(initial.intent).toBe('ask-ai')

    let history = appendBrowserIntentCorrection([], first, 'ask-ai', 'search', 1)
    expect(classifyBrowserNewTabIntent(similar, history).source).toBe('rule')

    history = appendBrowserIntentCorrection(history, similar, 'ask-ai', 'search', 2)
    expect(classifyBrowserNewTabIntent('深圳天气怎么样', history)).toEqual({
      intent: 'search',
      confidence: 'medium',
      source: 'history',
    })
  })

  it('keeps a bounded correction history', () => {
    let history: BrowserIntentCorrection[] = []
    for (let index = 0; index < 140; index += 1) {
      history = appendBrowserIntentCorrection(history, `如何处理问题 ${index}`, 'ask-ai', 'search', index)
    }
    expect(history).toHaveLength(120)
    expect(history[0]?.timestamp).toBe(20)
  })

  it('recovers safely from malformed persisted history', () => {
    expect(normalizeBrowserIntentCorrections({ corrections: [] })).toEqual([])
    expect(normalizeBrowserIntentCorrections([
      null,
      { signature: 'safe', from: 'search', to: 'ask-ai', timestamp: 1 },
      { signature: 'bad', from: 'unknown', to: 'search', timestamp: 2 },
    ])).toEqual([{ signature: 'safe', from: 'search', to: 'ask-ai', timestamp: 1 }])
  })
})
