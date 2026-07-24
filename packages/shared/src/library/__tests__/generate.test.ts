import { describe, expect, it } from 'bun:test'
import {
  buildExcerptFallbackDocument,
  injectCraftSectionAnchors,
  sanitizeLibraryModelMarkdown,
} from '../generate.ts'
import {
  isLegacyDefaultSessionBlock,
  migrateLegacySessionBodyDenyToAsk,
} from '../../privacy/migrations.ts'
import { createDefaultPrivacyPolicy } from '../../privacy/defaults.ts'

describe('library generate sanitize', () => {
  it('strips surrounding markdown fences and keeps title', () => {
    const raw = '```markdown\n# 标题\n\n## 概述\n\n内容一二三四五六七八\n```'
    const cleaned = sanitizeLibraryModelMarkdown(raw, '回退')
    expect(cleaned.ok).toBe(true)
    if (!cleaned.ok) return
    expect(cleaned.title).toBe('标题')
    expect(cleaned.markdown).not.toContain('```')
    expect(cleaned.markdown).toContain('## 概述')
  })

  it('rejects empty output', () => {
    expect(sanitizeLibraryModelMarkdown('   ', 't').ok).toBe(false)
  })

  it('adds title when missing', () => {
    const cleaned = sanitizeLibraryModelMarkdown('## 主要内容\n\n足够长的正文内容在这里\n', '自动标题')
    expect(cleaned.ok).toBe(true)
    if (!cleaned.ok) return
    expect(cleaned.markdown.startsWith('# 自动标题')).toBe(true)
  })
})

describe('craft-section injection', () => {
  it('inserts anchors after headings and uses document-level sources when per-section ids omitted', () => {
    const md = '# T\n\n## A\n\nbody\n\n## B\n\nmore\n'
    const { body, sourceReferences } = injectCraftSectionAnchors({
      markdown: md,
      documentId: 'doc_aaaaaaaaaaaaaaa1',
      sessionId: 'sess_1',
      authorizedMessageIds: ['m1', 'm2', 'fake_should_stay'],
    })
    expect(body).toContain('<!-- craft-section:')
    expect(sourceReferences).toHaveLength(1)
    expect(sourceReferences[0]!.documentLevel).toBe(true)
    expect(sourceReferences[0]!.messageIds.every((id) => ['m1', 'm2', 'fake_should_stay'].includes(id))).toBe(true)
  })
})

describe('excerpt fallback', () => {
  it('builds structured body with anchors for each template heading', () => {
    const doc = buildExcerptFallbackDocument({
      documentId: 'doc_bbbbbbbbbbbbbbb1',
      sessionId: 'sess_1',
      sessionTitle: '测试',
      templateId: 'decision',
      messages: [{ id: 'm1', role: 'user', content: '我们决定采用方案 A' }],
    })
    expect(doc.body).toContain('## 决策结论')
    expect(doc.body).toContain('<!-- craft-section:')
    expect(doc.sourceReferences.length).toBeGreaterThan(0)
  })
})

describe('privacy d1 migration', () => {
  it('defaults session.body to ask', () => {
    expect(createDefaultPrivacyPolicy().sources.session.body).toBe('ask')
  })

  it('migrates exact legacy default deny → ask', () => {
    const policy: { sources: ReturnType<typeof createDefaultPrivacyPolicy>['sources']; updatedAt?: number } = {
      sources: {
        ...createDefaultPrivacyPolicy().sources,
        session: { meta: 'allow', body: 'deny', attachments: 'deny', archived: 'ask' },
      },
    }
    expect(isLegacyDefaultSessionBlock(policy.sources.session)).toBe(true)
    expect(migrateLegacySessionBodyDenyToAsk(policy)).toBe(true)
    expect(policy.sources.session.body).toBe('ask')
  })

  it('does not migrate intentional deny that diverges from legacy default', () => {
    const policy = {
      sources: {
        ...createDefaultPrivacyPolicy().sources,
        session: { meta: 'ask' as const, body: 'deny' as const, attachments: 'deny' as const, archived: 'ask' as const },
      },
    }
    expect(isLegacyDefaultSessionBlock(policy.sources.session)).toBe(false)
    expect(migrateLegacySessionBodyDenyToAsk(policy)).toBe(false)
    expect(policy.sources.session.body).toBe('deny')
  })
})
