import { describe, expect, it } from 'bun:test'
import { formatSampledRgba, parseMermaidSvgDimensions } from '../mermaid-renderer'

describe('formatSampledRgba', () => {
  it('emits opaque rgb when alpha is exactly 255', () => {
    expect(formatSampledRgba(41, 40, 45, 255)).toBe('rgb(41, 40, 45)')
  })

  it('emits rgba with a fractional alpha channel when translucent', () => {
    expect(formatSampledRgba(118, 87, 200, 128)).toBe('rgba(118, 87, 200, 0.502)')
  })

  it('treats a missing alpha sample as fully opaque instead of inventing transparency', () => {
    expect(formatSampledRgba(250, 250, 251, undefined)).toBe('rgb(250, 250, 251)')
  })
})

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
