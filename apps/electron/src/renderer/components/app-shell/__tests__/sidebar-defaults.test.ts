import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const APP_SHELL_DIR = resolve(import.meta.dir, '..')

function read(name: string): string {
  return readFileSync(join(APP_SHELL_DIR, name), 'utf8')
}

describe('Craft navigation defaults', () => {
  it('keeps the native session groups inside the primary rail', () => {
    const source = read('AppShell.tsx')
    const navigation = read('CodexNavigationSidebar.tsx')

    expect(source).toContain('recentSessions={codexSidebarSessions.recent}')
    expect(source).toContain("mode={isBrowserNavigation(navState) ? 'browser' : 'sessions'}")
    expect(navigation).toContain("mode === 'sessions'")
    expect(navigation).not.toContain('sessionsSlot')
  })

  it('opens project management from the projects section title', () => {
    const source = read('AppShell.tsx')
    const navigation = read('CodexNavigationSidebar.tsx')

    expect(source).not.toContain("id: 'nav:projects'")
    expect(source).toContain('projectsOpen={isProjectsNavigation(navState)}')
    expect(source).toContain('onProjectsOpen={handleProjectsClick}')
    expect(navigation).toContain('onClick={onProjectsOpen}')
    expect(navigation).not.toContain('onClick={onAddProject}')
    expect(navigation).not.toContain('MoreHorizontal')
  })

  it('keeps sessions and browser as modes of the same sidebar', () => {
    const source = read('AppShell.tsx')
    const switcher = read('SidebarModeSwitcher.tsx')

    expect(source).not.toContain("id: 'nav:browser',\n                        title: t('sidebar.browser')")
    expect(switcher).toContain("onClick={() => onModeChange('sessions')}")
    expect(switcher).toContain("onClick={() => onModeChange('browser')}")
    expect(switcher).not.toContain('onDynamic')
    expect(switcher).not.toContain('<Bell')
    expect(switcher).not.toContain('showModeMenu')
  })

  it('removes the desktop middle column and promotes collection lists to main content', () => {
    const source = read('AppShell.tsx')
    const stack = read('PanelStackContainer.tsx')

    expect(source).toContain('const navigatorAsMainContent = !isAutoCompact')
    expect(source).toContain("navigatorWidth={\n            isAutoCompact\n              ? sessionListWidth\n              : 0")
    expect(source).toContain('navigatorAsContent={navigatorAsMainContent}')
    expect(stack).toContain('data-panel-role="content-list"')
  })

  it('exposes header icon actions to assistive technology', () => {
    const source = read('../ui/HeaderIconButton.tsx')

    expect(source).toContain("aria-label={props['aria-label'] ?? tooltip}")
  })

  it('keeps processing feedback stable instead of cycling decorative copy', () => {
    const source = read('ChatDisplay.tsx')

    expect(source).toContain("const PROCESSING_MESSAGE_KEY = 'chat.processing.processing'")
    expect(source).not.toContain('PROCESSING_MESSAGE_KEYS')
    expect(source).not.toContain('messageIndex')
  })

  it('brands both sidebar modes with a readable Latin-CJK space', () => {
    const source = read('SidebarModeSwitcher.tsx')

    expect(source).toContain('`Craft ${modeLabel}`')
    expect(source).toContain("Craft {t('sidebar.sessions')}")
    expect(source).toContain("Craft {t('sidebar.browser')}")
  })

  it('keeps section labels on the traffic-light axis and session text on the content axis', () => {
    const source = read('CodexNavigationSidebar.tsx')

    expect(source).toContain('className="flex items-center px-3 pb-1.5 pt-4')
    expect(source).toContain("'pl-8',")
    expect(source).not.toContain("nested ? 'pl-9' : 'pl-3'")
  })

  it('uses Codex-scale navigation rows and emphasizes the current destination', () => {
    const navigation = read('CodexNavigationSidebar.tsx')
    const sidebar = read('LeftSidebar.tsx')
    const styles = readFileSync(join(resolve(APP_SHELL_DIR, '../..'), 'index.css'), 'utf8')

    expect(navigation).toContain("'group flex h-9 w-full")
    expect(navigation).toContain("'bg-foreground/[0.075] font-medium text-foreground'")
    expect(navigation).toContain('className="ca-codex-primary-nav"')
    expect(navigation).toContain('rounded-[8px] pl-1.5 pr-2.5')
    expect(sidebar).toContain('data-selected={link.variant === "default"}')
    expect(sidebar).toContain('? "bg-foreground/[0.07] text-foreground"')
    expect(styles).toContain('padding-left: 6px !important;')
  })

  it('makes the titlebar control toggle the sidebar directly', () => {
    const topBar = read('TopBar.tsx')
    const stack = read('PanelStackContainer.tsx')

    expect(topBar).toContain('onClick={activateSidebarToggle}')
    expect(topBar).toContain('titlebar-no-drag relative z-local')
    expect(topBar).toContain('className="titlebar-no-drag pointer-events-auto fixed z-splash"')
    expect(topBar).toContain('top: \'calc((var(--topbar-height) - 28px) / 2)\'')
    expect(topBar).toContain('data-sidebar-toggle="true"')
    expect(topBar).toContain('z-dropdown-backdrop')
    expect(topBar).not.toContain('<DropdownMenuTrigger asChild>')
    expect(stack).toContain("pointerEvents: hasSidebar ? 'auto' : 'none'")
  })

  it('uses OS-native context menus for session and browser rows', () => {
    const navigation = read('CodexNavigationSidebar.tsx')
    const preload = readFileSync(resolve(APP_SHELL_DIR, '../../../preload/bootstrap.ts'), 'utf8')
    const main = readFileSync(resolve(APP_SHELL_DIR, '../../../main/index.ts'), 'utf8')
    const windowManager = readFileSync(resolve(APP_SHELL_DIR, '../../../main/window-manager.ts'), 'utf8')

    expect(navigation).toContain('window.electronAPI.showNativeContextMenu(items)')
    expect(navigation).toContain('onContextMenu={openNativeMenu}')
    expect(navigation).not.toContain('<ContextMenu')
    expect(navigation).not.toContain('<SessionMenu')
    expect(preload).toContain("ipcRenderer.invoke('app:show-native-context-menu', items)")
    expect(main).toContain("ipcMain.handle('app:show-native-context-menu'")
    expect(main).toContain('Menu.buildFromTemplate(template).popup')
    expect(windowManager).not.toContain("window.webContents.on('context-menu'")
    expect(windowManager).not.toContain("label: 'Inspect Element'")
  })

  it('keeps the mode switcher neutral until hover or menu open', () => {
    const source = read('SidebarModeSwitcher.tsx')

    expect(source).toContain('className="flex h-11 items-center gap-1 pr-2 pb-1"')
    expect(source).not.toContain('className="flex h-11 items-center gap-1 px-2 pb-1"')
    expect(source).toContain('rounded-xl bg-transparent')
    expect(source).not.toContain('rounded-xl bg-foreground/[0.045]')
  })

  it('animates the review sidebar without leaving a hidden overflow width', () => {
    const source = read('PanelStackContainer.tsx')

    expect(source).toContain('<AnimatePresence initial={false}>')
    expect(source).toContain('{effectiveRightSidebarVisible && (')
    expect(source).toContain('initial={{ width: 0, marginLeft: -PANEL_GAP, opacity: 0, x: 18 }}')
    expect(source).toContain('exit={{ width: 0, marginLeft: -PANEL_GAP, opacity: 0, x: 18 }}')
    expect(source).toContain("'h-full w-full min-w-0")
    expect(source).not.toContain('width: effectiveRightSidebarVisible ? rightSidebarWidth : 0')
    expect(source).not.toContain('style={{ width: rightSidebarWidth }}')
  })

  it('limits the increased outer-window radius to non-maximized Windows windows', () => {
    const topBar = read('TopBar.tsx')
    const styles = readFileSync(join(resolve(APP_SHELL_DIR, '../..'), 'index.css'), 'utf8')

    expect(topBar).toContain('document.documentElement.dataset.windowMaximized = String(isMaximized)')
    expect(styles).toContain("html[data-platform='windows'] .ca-window-shell")
    expect(styles).toContain('--ca-windows-window-radius: 12px')
    expect(styles).toContain("html[data-platform='windows'][data-window-maximized='true'] .ca-window-shell")
  })

  it('keeps workspace functions and help as separate bottom-row buttons', () => {
    const topBar = read('TopBar.tsx')
    const workspaceSwitcher = read('WorkspaceSwitcher.tsx')

    expect(topBar).not.toContain('getDocUrl')
    expect(workspaceSwitcher).toContain('function SidebarHelpMenu()')
    expect(workspaceSwitcher).toContain("'flex items-center gap-1 px-[6px] pb-[6px]'")
    expect(workspaceSwitcher).toContain('flex h-10 w-10 shrink-0')
    expect(workspaceSwitcher).not.toContain('absolute right-1 top-1/2')
    expect(workspaceSwitcher).toContain("variant === 'sidebar' && !isCollapsed && <SidebarHelpMenu />")
  })

  it('hides navigation scrollbars and aligns the footer with the window edge inset', () => {
    const navigation = read('CodexNavigationSidebar.tsx')
    const stack = read('PanelStackContainer.tsx')

    expect(navigation).toContain('overflow-x-hidden overflow-y-auto scrollbar-hide pb-4')
    expect(navigation).toContain('className="shrink-0 pt-1"')
    expect(navigation).not.toContain('shrink-0 px-[6px] pb-1 pt-1')
    expect(stack).toContain('panel-scroll scrollbar-hide panel-stack-shell')
  })

  it('shows the compact environment section only for an actual Git repository', () => {
    const resources = read('SessionResourcesPopover.tsx')
    const git = read('SessionGitSection.tsx')

    expect(resources).not.toContain('isCodeRelatedSession')
    expect(resources).toContain('<SessionGitSection')
    expect(git).toContain("if (workingDirectories.length === 0 || (!loading && !status?.isRepository)) return null")
    expect(git).toContain("t('chat.gitCommitOrPush'")
    expect(git).toContain("t('chat.gitLocal'")
  })

  it('keeps the information popover content-sized and omits empty or redundant sections', () => {
    const resources = read('SessionResourcesPopover.tsx')

    expect(resources).toContain('style={{ maxHeight: measuredMaxHeight }}')
    expect(resources).not.toContain('height: measuredMaxHeight')
    expect(resources).not.toContain('<TaskContextSection')
    expect(resources).not.toContain("title={t('resources.title')}")
    expect(resources).toContain('sourceItems.length > 0')
    expect(resources).toContain('sessionFileItems.length > 0')
    expect(resources).toContain('outputs.length > 0')
  })
})
