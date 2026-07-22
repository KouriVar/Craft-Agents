import type { Session } from '../../../shared/types'

const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|py|rb|php|java|kt|kts|swift|go|rs|cs|cpp|cc|cxx|h|hpp|css|scss|sass|less|html?|vue|svelte|sql|sh|zsh|fish|ps1|ya?ml|toml|json|lock)(?:$|[?#])/i
const CODE_TOOL_PATTERN = /(?:^|[_-])(?:bash|shell|terminal|read|write|edit|glob|grep|apply.?patch|patch|git)(?:$|[_-])/i
const CODE_INTENT_PATTERN = /(?:\b(?:code|codebase|repository|repo|git|branch|commit|pull request|bug|debug|refactor|implement)\b|代码|代码库|仓库|分支|提交|拉取请求|修复|重构|开发|实现)/i

export function isCodeRelatedSession(session: Session): boolean {
  for (const message of session.messages) {
    if (message.toolName && CODE_TOOL_PATTERN.test(message.toolName)) return true

    for (const badge of message.badges ?? []) {
      if (badge.type === 'folder') return true
      if (badge.type === 'file' && CODE_FILE_PATTERN.test(badge.filePath ?? badge.label)) return true
    }

    if (message.role === 'user' && CODE_INTENT_PATTERN.test(message.content)) return true
  }

  return CODE_INTENT_PATTERN.test([session.name, session.preview].filter(Boolean).join(' '))
}
