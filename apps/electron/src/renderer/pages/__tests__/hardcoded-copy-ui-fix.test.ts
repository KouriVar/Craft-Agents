import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')

describe('hardcoded UI copy fixes', () => {
  it('ServerSettingsPage uses common.* / settings.server.notConfigured keys', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'apps/electron/src/renderer/pages/settings/ServerSettingsPage.tsx'),
      'utf8',
    )
    expect(source).toContain("t('common.browse')")
    expect(source).toContain("t('common.reset')")
    expect(source).toContain("t('common.save')")
    expect(source).toContain("t('settings.server.notConfigured')")
    expect(source).not.toMatch(/>\s*Browse\s*</)
    expect(source).not.toMatch(/>\s*Reset\s*</)
    expect(source).not.toMatch(/>\s*Save\s*</)
    expect(source).not.toContain("'Not configured'")
  })

  it('ChatPage uses chat.sessionMessagesUnavailable instead of hardcoded English', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'apps/electron/src/renderer/pages/ChatPage.tsx'),
      'utf8',
    )
    expect(source).toContain("t('chat.sessionMessagesUnavailable')")
    expect(source).not.toContain('Session messages are not available')
  })

  it('SidebarMenu delete actions use destructive MenuItem variant', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'apps/electron/src/renderer/components/app-shell/SidebarMenu.tsx'),
      'utf8',
    )
    expect(source).toMatch(/onDeleteLabel\(labelId\)\}\s+variant="destructive"/)
    expect(source).toMatch(/onDeleteView\(viewId\)\}\s+variant="destructive"/)
  })

  it('ChatDisplay unrendered empty state uses i18n keys', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx'),
      'utf8',
    )
    expect(source).toContain("t('chat.unrenderedMessagesTitle')")
    expect(source).toContain("t('chat.unrenderedMessagesDesc')")
    expect(source).not.toContain('Conversation loaded, but no renderable messages were found.')
  })

  it('BackgroundFinishedChip avoids purple/indigo user-visible classes', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'apps/electron/src/renderer/components/app-shell/BackgroundFinishedChip.tsx'),
      'utf8',
    )
    expect(source).not.toContain('text-purple-')
    expect(source).not.toContain('bg-purple-')
    expect(source).not.toContain('ring-purple-')
    expect(source).not.toContain('text-indigo-')
    expect(source).not.toContain('bg-indigo-')
    expect(source).toContain('text-accent')
  })
})
