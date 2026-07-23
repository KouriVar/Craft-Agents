import type { ComponentEntry } from './types'
import { MessagingSettingsPagePreview } from '../demos/messaging/MessagingSettingsPagePreview'
import { PairingCodeDialogPreview } from '../demos/messaging/PairingCodeDialogPreview'
import { MessagingSubmenuPreview } from '../demos/messaging/MessagingSubmenuPreview'

export const messagingComponents: ComponentEntry[] = [
  {
    id: 'messaging-settings-page',
    name: 'Messaging Settings Page',
    category: 'Messaging',
    description: 'Lark + WeChat settings page with inline bindings',
    component: MessagingSettingsPagePreview,
    layout: 'full',
    props: [
      {
        name: 'larkConnected',
        description: 'Whether the Lark app is connected',
        control: { type: 'boolean' },
        defaultValue: false,
      },
      {
        name: 'wechatConnected',
        description: 'Whether the WeChat adapter is connected',
        control: { type: 'boolean' },
        defaultValue: false,
      },
      {
        name: 'bindings',
        description: 'Bindings preset to show in the table',
        control: {
          type: 'select',
          options: [
            { label: 'None', value: 'none' },
            { label: 'One binding', value: 'one' },
            { label: 'Many bindings', value: 'many' },
          ],
        },
        defaultValue: 'none',
      },
    ],
    variants: [
      {
        name: 'Both disconnected',
        props: { larkConnected: false, wechatConnected: false, bindings: 'none' },
      },
      {
        name: 'Lark only',
        props: { larkConnected: true, wechatConnected: false, bindings: 'none' },
      },
      {
        name: 'Both connected, no bindings',
        props: { larkConnected: true, wechatConnected: true, bindings: 'none' },
      },
      {
        name: 'Both connected, 3 bindings',
        props: { larkConnected: true, wechatConnected: true, bindings: 'many' },
      },
    ],
  },
  {
    id: 'messaging-pairing-code-dialog',
    name: 'Pairing Code Dialog',
    category: 'Messaging',
    description: '6-digit pairing code modal (Lark + WeChat)',
    component: PairingCodeDialogPreview,
    layout: 'centered',
    props: [
      {
        name: 'platform',
        description: 'Messaging platform',
        control: {
          type: 'select',
          options: [
            { label: 'Lark', value: 'lark' },
            { label: 'WeChat', value: 'wechat' },
          ],
        },
        defaultValue: 'lark',
      },
      {
        name: 'code',
        description: '6-digit pairing code (empty → "generating" state)',
        control: { type: 'string', placeholder: '482193' },
        defaultValue: '482193',
      },
      {
        name: 'expiresInSeconds',
        description: 'Seconds remaining until the code expires (-1 to hide the timer)',
        control: { type: 'number', min: -1, max: 600, step: 1 },
        defaultValue: 300,
      },
      {
        name: 'error',
        description: 'Error text to show in place of the code',
        control: { type: 'string', placeholder: '' },
        defaultValue: '',
      },
    ],
    variants: [
      {
        name: 'Lark',
        props: {
          platform: 'lark',
          code: '482193',
          expiresInSeconds: 300,
          error: '',
        },
      },
      {
        name: 'WeChat',
        props: {
          platform: 'wechat',
          code: '482193',
          expiresInSeconds: 300,
          error: '',
        },
      },
      {
        name: 'Loading (no code)',
        props: {
          platform: 'lark',
          code: '',
          expiresInSeconds: -1,
          error: '',
        },
      },
      {
        name: 'Error: rate limited',
        props: {
          platform: 'lark',
          code: '',
          expiresInSeconds: -1,
          error: 'Too many pairing code requests. Please wait a moment and try again.',
        },
      },
      {
        name: 'Expired',
        props: {
          platform: 'lark',
          code: '482193',
          expiresInSeconds: 0,
          error: '',
        },
      },
    ],
  },
  {
    id: 'messaging-submenu',
    name: 'Messaging Submenu',
    category: 'Messaging',
    description: 'Session menu → Connect Messaging submenu (Lark / WeChat)',
    component: MessagingSubmenuPreview,
    layout: 'top',
    previewOverflow: 'visible',
    props: [
      {
        name: 'larkConnected',
        description: 'Whether the Lark app is connected (changes flow)',
        control: { type: 'boolean' },
        defaultValue: true,
      },
      {
        name: 'wechatConnected',
        description: 'Whether the WeChat adapter is connected (changes flow)',
        control: { type: 'boolean' },
        defaultValue: true,
      },
    ],
    variants: [
      {
        name: 'Both connected',
        props: { larkConnected: true, wechatConnected: true },
      },
      {
        name: 'Nothing connected',
        props: { larkConnected: false, wechatConnected: false },
      },
      {
        name: 'WeChat only',
        props: { larkConnected: false, wechatConnected: true },
      },
    ],
  },
]
