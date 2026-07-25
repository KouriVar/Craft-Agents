/**
 * Pure helpers for FreeFormInputContextBadge ↔ Radix Trigger prop forwarding.
 */

import type * as React from 'react'

export function assignBadgeRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (!ref) return
  if (typeof ref === 'function') {
    ref(value)
  } else {
    ;(ref as React.MutableRefObject<T | null>).current = value
  }
}

/** Merge forwardRef + optional buttonRef onto one DOM node. */
export function mergeBadgeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) assignBadgeRef(ref, value)
  }
}

export type BadgeTriggerForwarded = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> & {
  /** Radix Trigger open/closed marker (and other data-* attrs). */
  'data-state'?: string
  [dataAttr: `data-${string}`]: string | undefined
}

/**
 * Split consumer props from Radix Trigger forwarded props and produce the
 * attributes that must land on the real <button>.
 */
export function resolveBadgeButtonAttributes(input: {
  label: string
  disabled?: boolean
  className?: string
  dataTutorial?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  forwarded: BadgeTriggerForwarded
}): {
  buttonProps: BadgeTriggerForwarded
  composedOnClick: React.MouseEventHandler<HTMLButtonElement>
  disabled: boolean | undefined
  className: string | undefined
  ariaLabel: string | undefined
  dataTutorial: string | undefined
} {
  const {
    className: forwardedClassName,
    onClick: forwardedOnClick,
    disabled: forwardedDisabled,
    'aria-label': forwardedAriaLabel,
    ...triggerProps
  } = input.forwarded

  return {
    buttonProps: triggerProps,
    composedOnClick: (event) => {
      forwardedOnClick?.(event)
      input.onClick?.(event)
    },
    disabled: forwardedDisabled ?? input.disabled,
    className: [input.className, forwardedClassName].filter(Boolean).join(' ') || undefined,
    ariaLabel: forwardedAriaLabel ?? input.label,
    dataTutorial: input.dataTutorial,
  }
}
