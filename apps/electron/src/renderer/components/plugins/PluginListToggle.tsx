import { Plug, Puzzle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { PluginListKind } from '@/atoms/plugins'

interface PluginListToggleProps {
  value: PluginListKind
  onChange: (value: PluginListKind) => void
  className?: string
}

/**
 * Agent plugins ⇄ browser extensions switch.
 * Intentionally mirrors the sessions List ⇄ Board control.
 */
export function PluginListToggle({ value, onChange, className }: PluginListToggleProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-surface border border-border/60 bg-foreground/[0.02] p-0.5',
        className,
      )}
      role="group"
      aria-label={t('sidebar.plugins')}
    >
      <ToggleButton
        active={value === 'plugins'}
        icon={Plug}
        label={t('sidebar.plugins')}
        onClick={() => onChange('plugins')}
      />
      <ToggleButton
        active={value === 'extensions'}
        icon={Puzzle}
        label={t('plugins.browserExtensions')}
        onClick={() => onChange('extensions')}
      />
    </div>
  )
}

function ToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Plug
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-minimal' : 'text-foreground/50 hover:text-foreground/80',
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </button>
  )
}
