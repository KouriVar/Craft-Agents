import { describe, expect, it } from 'bun:test'
import { buildBrowserSearchUrl, getHostname, looksLikeBrowserAddress, resolveBrowserAddress } from '../utils'

describe('getHostname', () => {
  it('returns stripped hostname for https URLs', () => {
    expect(getHostname('https://www.example.com/path?q=1')).toBe('example.com')
  })

  it('returns New Tab for about:blank', () => {
    expect(getHostname('about:blank')).toBe('New Tab')
  })

  it('returns filename for file URLs', () => {
    expect(getHostname('file:///Users/tester/report.html')).toBe('report.html')
  })

  it('returns Local File for file URLs without basename', () => {
    expect(getHostname('file:///Users/tester/folder/')).toBe('Local File')
  })

  it('returns protocol token for custom schemes with empty hostname', () => {
    expect(getHostname('data:text/html,hello')).toBe('data')
  })

  it('falls back to original input for malformed URLs', () => {
    expect(getHostname('not a url')).toBe('not a url')
  })
})

describe('resolveBrowserAddress', () => {
  it('keeps explicit URLs unchanged', () => {
    expect(resolveBrowserAddress('https://example.com/path')).toBe('https://example.com/path')
  })

  it('keeps host-like input as navigation', () => {
    expect(resolveBrowserAddress('example.com/docs')).toBe('example.com/docs')
  })

  it('uses Google for plain-text searches', () => {
    expect(resolveBrowserAddress('Craft Agents 浏览器')).toBe(
      'https://www.google.com/search?q=Craft%20Agents%20%E6%B5%8F%E8%A7%88%E5%99%A8',
    )
  })
})

describe('browser input helpers', () => {
  it('recognizes browser addresses without treating ordinary text as a URL', () => {
    expect(looksLikeBrowserAddress('localhost:5173')).toBe(true)
    expect(looksLikeBrowserAddress('example.com/docs')).toBe(true)
    expect(looksLikeBrowserAddress('Electron updater')).toBe(false)
  })

  it('can explicitly search text that resembles a host', () => {
    expect(buildBrowserSearchUrl('example.com')).toBe('https://www.google.com/search?q=example.com')
  })
})
