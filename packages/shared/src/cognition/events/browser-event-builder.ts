/**
 * Browser cognition event builders — metadata only (no cookies/body/history dumps).
 */

import { truncateText, sanitizeUrl, maskSecretsInText } from './event-sanitizer.ts'
import { parseBrowserPageParts } from './browser-page-filter.ts'
import {
  COGNITION_SCHEMA_VERSION,
  type BrowserBookmarkCreatedEvent,
  type BrowserPageClosedEvent,
  type BrowserPageOpenedEvent,
  type BrowserTabAttachedEvent,
  type CognitionEvidenceRef,
  type CognitionEventInput,
  type CognitionSubjectRef,
} from '../types.ts'

function sessionTaskSubject(sessionId: string): CognitionSubjectRef {
  return { kind: 'session_task', id: sessionId }
}

type BrowserBaseFields = {
  workspaceId?: string
  projectId?: string
  sessionId?: string
  timestamp?: number
  correlationId?: string
  causationId?: string
}

function browserBase(
  fields: BrowserBaseFields,
  extras: { idempotencyKey: string; summary: string; evidenceRefs: CognitionEvidenceRef[] },
): Pick<
  CognitionEventInput,
  | 'workspaceId'
  | 'projectId'
  | 'sessionId'
  | 'subject'
  | 'timestamp'
  | 'schemaVersion'
  | 'correlationId'
  | 'causationId'
  | 'idempotencyKey'
  | 'summary'
  | 'evidenceRefs'
  | 'source'
> {
  return {
    source: 'browser',
    workspaceId: fields.workspaceId,
    projectId: fields.projectId,
    sessionId: fields.sessionId,
    subject: fields.sessionId ? sessionTaskSubject(fields.sessionId) : undefined,
    timestamp: fields.timestamp ?? Date.now(),
    schemaVersion: COGNITION_SCHEMA_VERSION,
    correlationId: fields.correlationId,
    causationId: fields.causationId,
    idempotencyKey: extras.idempotencyKey,
    summary: truncateText(extras.summary, 480),
    evidenceRefs: extras.evidenceRefs.slice(0, 12),
  }
}

function tabEvidence(tabId: string, title: string, url?: string): CognitionEvidenceRef[] {
  return [{
    type: 'browser_tab',
    id: tabId,
    label: truncateText(maskSecretsInText(title) || tabId, 80),
    url: url ? sanitizeUrl(url) : undefined,
  }]
}

function safeTitle(title?: string, fallback = 'page'): string {
  return truncateText(maskSecretsInText(title?.trim() || fallback), 120)
}

export function buildBrowserPageOpenedEvent(
  fields: BrowserBaseFields & {
    tabId: string
    url: string
    title?: string
    ownerType: 'session' | 'manual'
    boundSessionId?: string
    trigger?: 'load' | 'spa' | 'agent_navigate'
  },
): Omit<BrowserPageOpenedEvent, 'id' | 'sequence'> | null {
  const parts = parseBrowserPageParts(fields.url)
  if (!parts) return null
  const title = safeTitle(fields.title, parts.hostname)
  const bucket = Math.floor((fields.timestamp ?? Date.now()) / 60_000)
  const sessionId = fields.sessionId || fields.boundSessionId
  return {
    type: 'browser.page_opened',
    ...browserBase({ ...fields, sessionId }, {
      idempotencyKey: `browser.page_opened:${fields.tabId}:${parts.hostname}${parts.pathname}:${bucket}`,
      summary: `Opened ${title} (${parts.hostname})`,
      evidenceRefs: tabEvidence(fields.tabId, title, parts.sanitizedUrl),
    }),
    payload: {
      tabId: fields.tabId,
      hostname: parts.hostname,
      pathname: parts.pathname,
      title,
      ownerType: fields.ownerType,
      boundSessionId: fields.boundSessionId,
      trigger: fields.trigger ?? 'load',
    },
  }
}

export function buildBrowserTabAttachedEvent(
  fields: BrowserBaseFields & {
    tabId: string
    boundSessionId: string
    ownerType?: 'session' | 'manual'
    url?: string
    title?: string
  },
): Omit<BrowserTabAttachedEvent, 'id' | 'sequence'> {
  const parts = fields.url ? parseBrowserPageParts(fields.url) : null
  const title = safeTitle(fields.title, parts?.hostname || 'tab')
  return {
    type: 'browser.tab_attached',
    ...browserBase({ ...fields, sessionId: fields.sessionId || fields.boundSessionId }, {
      idempotencyKey: `browser.tab_attached:${fields.tabId}:${fields.boundSessionId}`,
      summary: `Browser tab attached to session (${title})`,
      evidenceRefs: tabEvidence(fields.tabId, title, parts?.sanitizedUrl),
    }),
    payload: {
      tabId: fields.tabId,
      hostname: parts?.hostname,
      pathname: parts?.pathname,
      title,
      boundSessionId: fields.boundSessionId,
      ownerType: fields.ownerType ?? 'session',
    },
  }
}

export function buildBrowserBookmarkCreatedEvent(
  fields: BrowserBaseFields & {
    bookmarkId: string
    url: string
    title?: string
  },
): Omit<BrowserBookmarkCreatedEvent, 'id' | 'sequence'> | null {
  const parts = parseBrowserPageParts(fields.url)
  if (!parts) return null
  const title = safeTitle(fields.title, parts.hostname)
  return {
    type: 'browser.bookmark_created',
    ...browserBase(fields, {
      idempotencyKey: `browser.bookmark_created:${fields.bookmarkId}`,
      summary: `Bookmarked ${title} (${parts.hostname})`,
      evidenceRefs: [{
        type: 'browser_tab',
        id: fields.bookmarkId,
        label: title,
        url: parts.sanitizedUrl,
      }],
    }),
    payload: {
      bookmarkId: fields.bookmarkId,
      hostname: parts.hostname,
      pathname: parts.pathname,
      title,
    },
  }
}

export function buildBrowserPageClosedEvent(
  fields: BrowserBaseFields & {
    tabId: string
    url?: string
    title?: string
    boundSessionId?: string
  },
): Omit<BrowserPageClosedEvent, 'id' | 'sequence'> {
  const parts = fields.url ? parseBrowserPageParts(fields.url) : null
  const title = safeTitle(fields.title, parts?.hostname || 'tab')
  return {
    type: 'browser.page_closed',
    ...browserBase({ ...fields, sessionId: fields.sessionId || fields.boundSessionId }, {
      idempotencyKey: `browser.page_closed:${fields.tabId}`,
      summary: `Closed browser tab (${title})`,
      evidenceRefs: tabEvidence(fields.tabId, title, parts?.sanitizedUrl),
    }),
    payload: {
      tabId: fields.tabId,
      hostname: parts?.hostname,
      pathname: parts?.pathname,
      title,
      boundSessionId: fields.boundSessionId,
    },
  }
}
