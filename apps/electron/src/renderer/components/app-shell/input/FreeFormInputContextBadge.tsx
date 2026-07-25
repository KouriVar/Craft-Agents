import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { FadingText } from '@/components/ui/fading-text'
import { cn } from '@/lib/utils'
import { mergeBadgeRefs, resolveBadgeButtonAttributes } from './badge-button-props'

export type FreeFormInputContextBadgeProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> & {
  /** Left area - fully customizable (icon, avatar stack, etc.) */
  icon: React.ReactNode
  /** Label text - shown in expanded state or collapsed with selection */
  label: string
  /** Whether to show expanded state (icon + label + chevron) vs collapsed */
  isExpanded?: boolean
  /** Whether there's an active selection (affects collapsed state styling and shows label) */
  hasSelection?: boolean
  /** Show chevron indicator (for dropdowns) - only visible in expanded state */
  showChevron?: boolean
  /** Tooltip content - can be string or ReactNode for rich content */
  tooltip?: React.ReactNode
  /** Whether the badge is currently "open" (e.g., dropdown is shown) */
  isOpen?: boolean
  /**
   * When set with `showChevron`, chevron becomes a separate control
   * (body click ≠ chevron click). Used by ContextSuggestionBadge.
   */
  onChevronClick?: React.MouseEventHandler<HTMLButtonElement>
  /** Accessible label for the split chevron control */
  chevronAriaLabel?: string
  /**
   * Optional explicit button ref (in addition to forwardRef).
   * Prefer the forwarded ref from DropdownMenuTrigger asChild.
   */
  buttonRef?: React.Ref<HTMLButtonElement>
  /** Data attribute for tutorials */
  'data-tutorial'?: string
}

export { mergeBadgeRefs } from './badge-button-props'

/**
 * FreeFormInputContextBadge - Unified context badge for Sources, Files, and Folder selectors
 *
 * Visual States:
 * - Expanded: Icon + Label + Chevron, no background, hover shows background
 * - Collapsed (no selection): Icon only, no background, hover shows background
 * - Collapsed (has selection): Icon + Label (fading), bg-background + shadow-minimal
 * - Open: bg-foreground/5 (like hover)
 *
 * Radix DropdownMenuTrigger asChild / PopoverTrigger asChild must land on the real
 * <button> — extra button props (ref, aria-*, data-state, pointer/keyboard handlers)
 * are forwarded onto that node.
 */
export const FreeFormInputContextBadge = React.forwardRef<HTMLButtonElement, FreeFormInputContextBadgeProps>(
  function FreeFormInputContextBadge(
    {
      icon,
      label,
      isExpanded = false,
      hasSelection = false,
      showChevron = false,
      onClick,
      tooltip,
      isOpen = false,
      onChevronClick,
      chevronAriaLabel,
      disabled = false,
      className,
      buttonRef,
      'data-tutorial': dataTutorial,
      ...forwarded
    },
    ref
  ) {
    // Show label in expanded state OR in collapsed state with selection
    const showLabel = isExpanded || hasSelection
    const splitChevron = Boolean(onChevronClick) && showChevron && isExpanded

    const resolved = resolveBadgeButtonAttributes({
      label,
      disabled,
      className,
      dataTutorial,
      onClick,
      forwarded,
    })

    const shellClassName = cn(
      // Base styles - shrink + min-w-0 allows badge to compress in tight layouts
      "input-toolbar-btn inline-flex items-center h-7 rounded-[6px] text-[13px] text-foreground transition-colors select-none shrink min-w-0",
      "disabled:opacity-50 disabled:pointer-events-none",
      // Collapsed with selection: visible background + thin 1px border + margin
      !isExpanded && hasSelection && "bg-background border border-foreground/5 mx-0.5",
      // Hover state (when not already showing background from selection)
      !(!isExpanded && hasSelection) && !splitChevron && "hover:bg-foreground/5",
      splitChevron && "hover:bg-foreground/5",
      // Open state (dropdown shown)
      isOpen && "bg-foreground/5",
      resolved.className,
    )

    const labelNode = showLabel ? (
      isExpanded ? (
        <span className={cn("truncate max-w-[120px] min-w-0 shrink", !hasSelection && "opacity-50")}>
          {label}
        </span>
      ) : (
        <FadingText className="max-w-[140px] min-w-0 shrink" fadeWidth={20}>
          {label}
        </FadingText>
      )
    ) : null

    const button = splitChevron ? (
      <span className={shellClassName} data-tutorial={resolved.dataTutorial}>
        <button
          {...resolved.buttonProps}
          ref={mergeBadgeRefs(ref, buttonRef)}
          type="button"
          aria-label={resolved.ariaLabel}
          disabled={resolved.disabled}
          onClick={resolved.composedOnClick}
          className={cn(
            "inline-flex items-center gap-1.5 h-full min-w-0 rounded-l-[6px]",
            showLabel ? "pl-2 pr-1" : "px-1.5",
          )}
        >
          <span className="shrink-0 flex items-center">{icon}</span>
          {labelNode}
        </button>
        <button
          type="button"
          disabled={resolved.disabled}
          aria-label={chevronAriaLabel ?? label}
          aria-expanded={isOpen}
          onClick={onChevronClick}
          className="inline-flex items-center justify-center h-full pl-0.5 pr-1.5 rounded-r-[6px] hover:bg-foreground/5"
        >
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </span>
    ) : (
      <button
        {...resolved.buttonProps}
        ref={mergeBadgeRefs(ref, buttonRef)}
        type="button"
        aria-label={resolved.ariaLabel}
        disabled={resolved.disabled}
        data-tutorial={resolved.dataTutorial}
        onClick={resolved.composedOnClick}
        className={cn(
          shellClassName,
          "gap-1.5",
          showLabel ? "px-2" : "px-1.5",
        )}
      >
        <span className="shrink-0 flex items-center">
          {icon}
        </span>
        {labelNode}
        {isExpanded && showChevron && (
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        )}
      </button>
    )

    // Tooltip wraps the same button element (asChild) so consumer-passed Trigger
    // props still land on the focusable <button>. Prefer Tooltip outside
    // DropdownMenuTrigger when this badge is itself an asChild Trigger target
    // (see ContextSuggestionBadge). Split-chevron badges skip asChild tooltip.
    if (tooltip && !isOpen && !splitChevron) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side="top">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )
    }

    if (tooltip && !isOpen && splitChevron) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex min-w-0 shrink">{button}</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )
    }

    return button
  }
)

FreeFormInputContextBadge.displayName = 'FreeFormInputContextBadge'
