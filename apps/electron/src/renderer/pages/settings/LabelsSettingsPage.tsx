/**
 * LabelsSettingsPage
 *
 * Displays workspace label configuration in two data tables:
 * 1. Label Hierarchy - tree table with expand/collapse showing all labels
 * 2. Auto-Apply Rules - flat table showing all regex rules across labels
 *
 * Label creation uses an inline editor (document flow) under the section header.
 * Auto-apply rules still open EditPopover for AI-assisted editing of labels/config.json.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { EditPopover, getEditConfig } from '@/components/ui/EditPopover'
import { getDocUrl } from '@craft-agent/shared/docs/doc-links'
import {
  SYSTEM_COLOR_NAMES,
  resolveEntityColor,
  type EntityColor,
  type SystemColorName,
} from '@craft-agent/shared/colors'
import { useAppShellContext, useActiveWorkspace } from '@/context/AppShellContext'
import { useTheme } from '@/hooks/useTheme'
import { useLabels } from '@/hooks/useLabels'
import {
  LabelsDataTable,
  AutoRulesDataTable,
} from '@/components/info'
import {
  SettingsSection,
  SettingsCard,
} from '@/components/settings'
import { routes } from '@/lib/navigate'
import { navigate } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type { LabelConfig } from '@craft-agent/shared/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'labels',
}

/** Shared ghost/sm action used by both section headers (forwardRef for EditPopover asChild). */
const SectionActionButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(function SectionActionButton({ children, className, ...props }, ref) {
  return (
    <Button ref={ref} variant="ghost" size="sm" className={className} {...props}>
      {children}
    </Button>
  )
})

export default function LabelsSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const { activeWorkspaceId } = useAppShellContext()
  const activeWorkspace = useActiveWorkspace()
  const { labels, isLoading } = useLabels(activeWorkspaceId)
  const [createParent, setCreateParent] = React.useState<LabelConfig | null | undefined>(undefined)
  const [draftName, setDraftName] = React.useState('')
  const [selectedColor, setSelectedColor] = React.useState<EntityColor | undefined>(undefined)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  const rootPath = activeWorkspace?.rootPath || ''
  const autoRulesEditConfig = getEditConfig('edit-auto-rules', rootPath)

  const editFileAction = rootPath ? {
    label: t('common.editFile'),
    filePath: `${rootPath}/labels/config.json`,
  } : undefined

  const isCreating = createParent !== undefined
  const isDirty = draftName.trim().length > 0 || selectedColor !== undefined

  const resetDraft = React.useCallback(() => {
    setCreateParent(undefined)
    setDraftName('')
    setSelectedColor(undefined)
    setNameError(null)
  }, [])

  React.useEffect(() => {
    if (!isCreating) return
    // Focus after the inline row mounts
    const id = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [isCreating, createParent])

  const submitCreate = async () => {
    const name = draftName.trim()
    if (!activeWorkspaceId) return

    if (!name) {
      setNameError(t('settings.labels.nameRequired'))
      nameInputRef.current?.focus()
      return
    }

    setIsSaving(true)
    try {
      await window.electronAPI.createLabel(activeWorkspaceId, {
        name,
        ...(selectedColor !== undefined ? { color: selectedColor } : {}),
        parentId: createParent?.id,
      })
      resetDraft()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleHierarchyAction = () => {
    if (!isCreating) {
      setCreateParent(null)
      return
    }
    if (!isDirty) {
      resetDraft()
      return
    }
    void submitCreate()
  }

  const deleteLabel = async (label: LabelConfig) => {
    if (!activeWorkspaceId || !window.confirm(`${t('sidebarMenu.deleteLabel')}: ${label.name}?`)) return
    await window.electronAPI.deleteLabel(activeWorkspaceId, label.id)
  }

  const hierarchyActionLabel = !isCreating
    ? t('settings.labels.add')
    : !isDirty
      ? t('common.cancel')
      : t('common.save')

  const body = (
            <div className="space-y-8">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <SettingsSection title={t('settings.labels.aboutLabels')}>
                    <SettingsCard className="px-4 py-3.5">
                      <div className="text-sm text-muted-foreground leading-relaxed space-y-1.5">
                        <p>{t('settings.labels.aboutText1')}</p>
                        <p>{t('settings.labels.aboutText2')}</p>
                        <p>{t('settings.labels.aboutText3')}</p>
                        <p>
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.openUrl(getDocUrl('labels'))}
                            className="text-foreground/70 hover:text-foreground underline underline-offset-2"
                          >
                            {t('chat.learnMore')}
                          </button>
                        </p>
                      </div>
                    </SettingsCard>
                  </SettingsSection>

                  <SettingsSection
                    title={t('settings.labels.labelHierarchy')}
                    description={t('settings.labels.labelHierarchyDesc')}
                    action={
                      <SectionActionButton
                        disabled={isSaving}
                        onClick={handleHierarchyAction}
                      >
                        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {hierarchyActionLabel}
                      </SectionActionButton>
                    }
                  >
                    {isCreating && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div
                            className={cn(
                              'relative min-w-[12rem] flex-1 rounded-control shadow-minimal has-[:focus-visible]:bg-background',
                              nameError && 'ring-1 ring-destructive',
                            )}
                          >
                            <Input
                              ref={nameInputRef}
                              value={draftName}
                              disabled={isSaving}
                              onChange={(event) => {
                                setDraftName(event.target.value)
                                if (nameError) setNameError(null)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void submitCreate()
                                } else if (event.key === 'Escape') {
                                  event.preventDefault()
                                  resetDraft()
                                }
                              }}
                              placeholder={
                                createParent
                                  ? t('settings.labels.addChildPlaceholder', { name: createParent.name })
                                  : t('settings.labels.namePlaceholder')
                              }
                              className="bg-muted/50 border-0 shadow-none focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-transparent"
                              aria-invalid={nameError ? true : undefined}
                              aria-describedby={nameError ? 'label-name-error' : undefined}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('common.color')}>
                            {SYSTEM_COLOR_NAMES.map((colorName: SystemColorName) => {
                              const isActive = selectedColor === colorName
                              const resolved = resolveEntityColor(colorName, isDark)
                              return (
                                <button
                                  key={colorName}
                                  type="button"
                                  disabled={isSaving}
                                  title={colorName}
                                  aria-label={colorName}
                                  aria-pressed={isActive}
                                  onClick={() => {
                                    setSelectedColor((prev) => (prev === colorName ? undefined : colorName))
                                  }}
                                  className={cn(
                                    'relative h-5 w-5 rounded-full transition-all flex items-center justify-center',
                                    isActive
                                      ? 'ring-2 ring-offset-2 ring-foreground ring-offset-background'
                                      : 'ring-1 ring-foreground/10 hover:ring-foreground/40 hover:scale-110',
                                  )}
                                  style={{ backgroundColor: resolved }}
                                >
                                  {isActive && (
                                    <Check
                                      className="h-3 w-3 text-white"
                                      strokeWidth={3}
                                      style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}
                                    />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {nameError && (
                          <p id="label-name-error" className="text-sm text-destructive">
                            {nameError}
                          </p>
                        )}
                      </div>
                    )}

                    <SettingsCard className="p-0">
                      {labels.length > 0 ? (
                        <LabelsDataTable
                          data={labels}
                          searchable
                          maxHeight={350}
                          fullscreen
                          fullscreenTitle={t('settings.labels.labelHierarchy')}
                          onViewSessions={(label) => navigate(routes.view.label(label.id))}
                          onAddChild={(label) => {
                            setDraftName('')
                            setSelectedColor(undefined)
                            setNameError(null)
                            setCreateParent(label)
                          }}
                          onDelete={(label) => { void deleteLabel(label) }}
                        />
                      ) : (
                        <div className="p-8 text-center text-muted-foreground">
                          <p className="text-sm">{t('settings.labels.noLabels')}</p>
                          <p className="text-xs mt-1 text-foreground/40">
                            {t('settings.labels.noLabelsDesc')}
                          </p>
                        </div>
                      )}
                    </SettingsCard>
                  </SettingsSection>

                  <SettingsSection
                    title={t('settings.labels.autoApplyRules')}
                    description={t('settings.labels.autoApplyRulesDesc')}
                    action={
                      <EditPopover
                        trigger={
                          <SectionActionButton>
                            {t('settings.labels.add')}
                          </SectionActionButton>
                        }
                        context={autoRulesEditConfig.context}
                        example={autoRulesEditConfig.example}
                        displayLabel={autoRulesEditConfig.displayLabel}
                        model={autoRulesEditConfig.model}
                        systemPromptPreset={autoRulesEditConfig.systemPromptPreset}
                        secondaryAction={editFileAction}
                      />
                    }
                  >
                    <SettingsCard className="p-0">
                      <AutoRulesDataTable
                        data={labels}
                        searchable
                        maxHeight={350}
                        fullscreen
                        fullscreenTitle={t('settings.labels.autoApplyRules')}
                      />
                    </SettingsCard>
                  </SettingsSection>
                </>
              )}
            </div>
  )

  if (embedded) return body

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('settings.labels.title')} actions={<HeaderMenu route={routes.view.settings('labels')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            {body}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
