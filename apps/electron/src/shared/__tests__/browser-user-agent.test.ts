import { describe, expect, it } from 'bun:test'
import { sanitizeEmbeddedBrowserUserAgent } from '../browser-user-agent'

describe('sanitizeEmbeddedBrowserUserAgent', () => {
  it('removes Electron product tokens from embedded browser user agents', () => {
    const userAgent = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Electron/39.2.7'

    expect(sanitizeEmbeddedBrowserUserAgent(userAgent)).toBe(
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    )
  })

  it('leaves normal browser user agents unchanged', () => {
    const userAgent = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'

    expect(sanitizeEmbeddedBrowserUserAgent(userAgent)).toBe(userAgent)
  })
})
