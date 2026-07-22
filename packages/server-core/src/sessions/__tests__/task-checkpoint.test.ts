import { describe, expect, it } from 'bun:test'
import { buildTaskCheckpointContent } from '../task-checkpoint'

describe('task checkpoint extraction', () => {
  it('prefers result sections and extracts actionable resume context', () => {
    const checkpoint = buildTaskCheckpointContent(`
这里是很长的过程说明，不应该盖过最终结果。

## 完成结果
- 已实现任务状态持久化。
- 正式构建已经通过。

## 下一步
- 打包 macOS 应用
- 上传 GitHub Release

## 阻塞项
- 等待签名证书

相关实现位于 \`apps/electron/src/renderer/App.tsx\`。
`)

    expect(checkpoint.summary).toContain('已实现任务状态持久化')
    expect(checkpoint.summary).not.toContain('很长的过程说明')
    expect(checkpoint.nextSteps).toEqual(['打包 macOS 应用', '上传 GitHub Release'])
    expect(checkpoint.blockers).toEqual(['等待签名证书'])
    expect(checkpoint.relatedFiles).toEqual(['apps/electron/src/renderer/App.tsx'])
  })

  it('removes code blocks, deduplicates bullets, and caps verbose summaries', () => {
    const checkpoint = buildTaskCheckpointContent(`
## Summary
${'The implementation is complete and verified. '.repeat(30)}

## Next steps
- Run packaging
- Run packaging

\`package.json\`

\`\`\`ts
const secretImplementation = true
\`\`\`
`)

    expect(checkpoint.summary.length).toBeLessThanOrEqual(481)
    expect(checkpoint.summary).not.toContain('secretImplementation')
    expect(checkpoint.nextSteps).toEqual(['Run packaging'])
    expect(checkpoint.relatedFiles).toEqual(['package.json'])
  })
})
