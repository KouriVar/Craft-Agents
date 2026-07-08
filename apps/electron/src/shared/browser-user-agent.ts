export function sanitizeEmbeddedBrowserUserAgent(userAgent: string): string {
  return userAgent.replace(/\sElectron\/[^\s]+/g, '')
}
