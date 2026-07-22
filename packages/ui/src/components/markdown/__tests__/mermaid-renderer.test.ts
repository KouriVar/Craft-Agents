import { describe, expect, it } from 'bun:test'
import { parseMermaidSvgDimensions } from '../mermaid-renderer'

describe('parseMermaidSvgDimensions', () => {
  it('reads numeric SVG dimensions', () => {
    expect(parseMermaidSvgDimensions('<svg width="640" height="360"></svg>')).toEqual({
      width: 640,
      height: 360,
    })
  })

  it('falls back to the viewBox used by official Mermaid responsive SVGs', () => {
    expect(parseMermaidSvgDimensions('<svg width="100%" viewBox="0 0 825.5 412"></svg>')).toEqual({
      width: 825.5,
      height: 412,
    })
  })

  it('returns null when no usable dimensions exist', () => {
    expect(parseMermaidSvgDimensions('<svg></svg>')).toBeNull()
  })
})
