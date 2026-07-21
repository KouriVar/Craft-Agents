import type { FileAttachment } from '../../../../shared/types'

export interface PreparedComposerSubmission {
  message: string
  fileAttachments?: FileAttachment[]
}

export function createFolderAttachment(path: string): FileAttachment {
  const normalizedPath = path.replace(/[\\/]+$/, '') || path
  return {
    type: 'unknown',
    kind: 'folder',
    path: normalizedPath,
    name: normalizedPath.split(/[\\/]/).pop() || path,
    mimeType: 'inode/directory',
    size: 0,
  }
}

export function appendUniqueAttachments(
  current: FileAttachment[],
  incoming: FileAttachment[],
): FileAttachment[] {
  const existingPaths = new Set(current.map((attachment) => attachment.path))
  const additions = incoming.filter((attachment) => {
    if (!attachment.path || existingPaths.has(attachment.path)) return false
    existingPaths.add(attachment.path)
    return true
  })
  return additions.length > 0 ? [...current, ...additions] : current
}

export function getDroppedFolderPath(
  entry: { isDirectory: boolean } | null | undefined,
  path: string | null,
): string | null {
  return entry?.isDirectory && path ? path : null
}

/**
 * Folder selections are composer context, not binary uploads. Convert them to
 * the folder mention syntax already understood by the session pipeline, while
 * keeping regular files on the existing attachment transport.
 */
export function prepareComposerSubmission(
  input: string,
  attachments: FileAttachment[],
): PreparedComposerSubmission {
  const folderMentions: string[] = []
  const fileAttachments: FileAttachment[] = []

  for (const attachment of attachments) {
    if (attachment.kind === 'folder') {
      folderMentions.push(`[folder:${attachment.path}]`)
    } else {
      fileAttachments.push(attachment)
    }
  }

  return {
    message: [...folderMentions, input.trim()].filter(Boolean).join(' '),
    ...(fileAttachments.length > 0 ? { fileAttachments } : {}),
  }
}
