import * as React from 'react'
import { CheckCircle2, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsInput,
  SettingsSecretInput,
  SettingsSection,
} from '@/components/settings'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'accounts',
}

export default function AccountsSettingsPage() {
  const { t } = useTranslation()
  const [clientId, setClientId] = React.useState('')
  const [clientSecret, setClientSecret] = React.useState('')
  const [configured, setConfigured] = React.useState(false)
  const [hasClientSecret, setHasClientSecret] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const status = await window.electronAPI.getOAuthApp('google')
      setClientId(status.clientId ?? '')
      setConfigured(status.configured)
      setHasClientSecret(status.hasClientSecret)
      setClientSecret('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!clientId.trim() || (!clientSecret.trim() && !hasClientSecret)) return
    setSaving(true)
    try {
      const status = await window.electronAPI.setOAuthApp({
        provider: 'google',
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      })
      setConfigured(status.configured)
      setHasClientSecret(status.hasClientSecret)
      setClientSecret('')
      toast.success(t('settings.accounts.saved'))
    } catch (error) {
      toast.error(t('settings.accounts.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await window.electronAPI.deleteOAuthApp('google')
      setClientId('')
      setClientSecret('')
      setConfigured(false)
      setHasClientSecret(false)
      toast.success(t('settings.accounts.removed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.accounts.title')}
        actions={<HeaderMenu route={routes.view.settings('accounts')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            <SettingsSection
              title={t('settings.accounts.googleTitle')}
              description={t('settings.accounts.googleDescription')}
            >
              <SettingsCard>
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-foreground/[0.05]">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>Google OAuth</span>
                      {configured && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {configured
                        ? t('settings.accounts.configured')
                        : t('settings.accounts.notConfigured')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { void window.electronAPI.openUrl('https://console.cloud.google.com/apis/credentials') }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('settings.accounts.openGoogleCloud')}
                  </Button>
                </div>
                <SettingsInput
                  label={t('settings.accounts.clientId')}
                  description={t('settings.accounts.clientIdDescription')}
                  value={clientId}
                  onChange={setClientId}
                  placeholder="000000000000-example.apps.googleusercontent.com"
                  disabled={loading || saving}
                  inCard
                />
                <SettingsSecretInput
                  label={t('settings.accounts.clientSecret')}
                  description={hasClientSecret
                    ? t('settings.accounts.clientSecretSaved')
                    : t('settings.accounts.clientSecretDescription')}
                  value={clientSecret}
                  onChange={setClientSecret}
                  placeholder={hasClientSecret
                    ? t('settings.accounts.keepExistingSecret')
                    : t('settings.accounts.enterClientSecret')}
                  disabled={loading || saving}
                  inCard
                />
                <SettingsCardFooter>
                  {configured && (
                    <Button variant="ghost" size="sm" onClick={() => { void remove() }} disabled={saving}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('common.remove')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => { void save() }}
                    disabled={loading || saving || !clientId.trim() || (!clientSecret.trim() && !hasClientSecret)}
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </SettingsCardFooter>
              </SettingsCard>
            </SettingsSection>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
