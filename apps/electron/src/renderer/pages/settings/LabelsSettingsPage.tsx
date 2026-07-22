/**
 * LabelsSettingsPage
 *
 * Displays workspace label configuration in two data tables:
 * 1. Label Hierarchy - tree table with expand/collapse showing all labels
 * 2. Auto-Apply Rules - flat table showing all regex rules across labels
 *
 * Each section has an Edit button that opens an EditPopover for AI-assisted editing
 * of the underlying labels/config.json file.
 *
 * Data is loaded via the useLabels hook which subscribes to live config changes.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { EditPopover, EditButton, getEditConfig } from '@/components/ui/EditPopover'
import { getDocUrl } from '@craft-agent/shared/docs/doc-links'
import { Loader2, Plus } from 'lucide-react'
import { useAppShellContext, useActiveWorkspace } from '@/context/AppShellContext'
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
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type { LabelConfig } from '@craft-agent/shared/labels'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'labels',
}

export default function LabelsSettingsPage() {
  const { t } = useTranslation()
  const { activeWorkspaceId } = useAppShellContext()
  const activeWorkspace = useActiveWorkspace()
  const { labels, isLoading } = useLabels(activeWorkspaceId)
  const [createParent, setCreateParent] = React.useState<LabelConfig | null | undefined>(undefined)
  const [newLabelName, setNewLabelName] = React.useState('')
  const [isSaving, setIsSaving] = React.useState(false)

  // Resolve edit configs using the workspace root path
  const rootPath = activeWorkspace?.rootPath || ''
  const autoRulesEditConfig = getEditConfig('edit-auto-rules', rootPath)

  // Secondary action: open the labels config file directly in system editor
  const editFileAction = rootPath ? {
    label: t("common.editFile"),
    filePath: `${rootPath}/labels/config.json`,
  } : undefined

  const createLabel = async () => {
    const name = newLabelName.trim()
    if (!activeWorkspaceId || !name) return
    setIsSaving(true)
    try {
      await window.electronAPI.createLabel(activeWorkspaceId, {
        name,
        parentId: createParent?.id,
      })
      setCreateParent(undefined)
      setNewLabelName('')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteLabel = async (label: LabelConfig) => {
    if (!activeWorkspaceId || !window.confirm(`${t('sidebarMenu.deleteLabel')}: ${label.name}?`)) return
    await window.electronAPI.deleteLabel(activeWorkspaceId, label.id)
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t("settings.labels.title")} actions={<HeaderMenu route={routes.view.settings('labels')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-8">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* About Section */}
                  <SettingsSection title={t("settings.labels.aboutLabels")}>
                    <SettingsCard className="px-4 py-3.5">
                      <div className="text-sm text-muted-foreground leading-relaxed space-y-1.5">
                        <p>
                          {t("settings.labels.aboutText1")}
                        </p>
                        <p>
                          {t("settings.labels.aboutText2")}
                        </p>
                        <p>
                          {t("settings.labels.aboutText3")}
                        </p>
                        <p>
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.openUrl(getDocUrl('labels'))}
                            className="text-foreground/70 hover:text-foreground underline underline-offset-2"
                          >
                            {t("chat.learnMore")}
                          </button>
                        </p>
                      </div>
                    </SettingsCard>
                  </SettingsSection>

                  {/* Label Hierarchy Section */}
                  <SettingsSection
                    title={t("settings.labels.labelHierarchy")}
                    description={t("settings.labels.labelHierarchyDesc")}
                    action={
                      <Button variant="ghost" size="sm" onClick={() => setCreateParent(null)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {t('sidebarMenu.addNewLabel')}
                      </Button>
                    }
                  >
                    <SettingsCard className="p-0">
                      {labels.length > 0 ? (
                        <LabelsDataTable
                          data={labels}
                          searchable
                          maxHeight={350}
                          fullscreen
                          fullscreenTitle={t("settings.labels.labelHierarchy")}
                          onViewSessions={(label) => navigate(routes.view.label(label.id))}
                          onAddChild={(label) => setCreateParent(label)}
                          onDelete={(label) => { void deleteLabel(label) }}
                        />
                      ) : (
                        <div className="p-8 text-center text-muted-foreground">
                          <p className="text-sm">{t("settings.labels.noLabels")}</p>
                          <p className="text-xs mt-1 text-foreground/40">
                            {t("settings.labels.noLabelsDesc")}
                          </p>
                        </div>
                      )}
                    </SettingsCard>
                  </SettingsSection>

                  {/* Auto-Apply Rules Section */}
                  <SettingsSection
                    title={t("settings.labels.autoApplyRules")}
                    description={t("settings.labels.autoApplyRulesDesc")}
                    action={
                      <EditPopover
                        trigger={<EditButton />}
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
                        fullscreenTitle={t("settings.labels.autoApplyRules")}
                      />
                    </SettingsCard>
                  </SettingsSection>
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
      <Dialog open={createParent !== undefined} onOpenChange={(open) => {
        if (!open) {
          setCreateParent(undefined)
          setNewLabelName('')
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('sidebarMenu.addNewLabel')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void createLabel() }} className="space-y-4">
            <Input
              autoFocus
              value={newLabelName}
              onChange={(event) => setNewLabelName(event.target.value)}
              placeholder={t('editPopover.placeholder.addLabel')}
            />
            {createParent && (
              <p className="text-xs text-muted-foreground">
                {createParent.name}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={!newLabelName.trim() || isSaving}>
                {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
