export function shouldShowEmbeddedBrowserSurface(options: {
  nativeViewsSuspended: boolean
  isCrashed: boolean
}): boolean {
  return !options.nativeViewsSuspended && !options.isCrashed
}
