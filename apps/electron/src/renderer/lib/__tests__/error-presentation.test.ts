import { describe, expect, it } from 'bun:test'
import { getErrorPresentation } from '../error-presentation'

describe('getErrorPresentation', () => {
  it('unwraps provider JSON envelopes for the conversation surface', () => {
    const raw = JSON.stringify({
      error: {
        message: 'The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed pi/deepseek-v4-flash.',
        type: 'invalid_request_error',
        code: 'invalid_request_error',
      },
    })

    const result = getErrorPresentation({ content: raw })

    expect(result.content).toContain('The supported API model names')
    expect(result.content).not.toMatch(/^\s*\{/)
    expect(result.details).toContain('Type: invalid_request_error')
    expect(result.details).toContain('Code: invalid_request_error')
    expect(result.original).toBe(raw)
  })

  it('keeps already readable errors unchanged', () => {
    const result = getErrorPresentation({
      content: 'Connection timed out',
      errorTitle: 'Connection failed',
      errorDetails: ['Try again'],
    })

    expect(result.title).toBe('Connection failed')
    expect(result.content).toBe('Connection timed out')
    expect(result.details).toEqual(['Try again'])
    expect(result.original).toBeUndefined()
  })
})
