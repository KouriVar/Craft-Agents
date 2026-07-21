import { describe, expect, it } from 'bun:test'
import type { FileAttachment } from '../../../../../shared/types'
import {
  appendUniqueAttachments,
  createFolderAttachment,
  getDroppedFolderPath,
  prepareComposerSubmission,
} from '../folder-attachments'

const folder: FileAttachment = {
  type: 'unknown',
  kind: 'folder',
  path: '/Users/me/My Project',
  name: 'My Project',
  mimeType: 'inode/directory',
  size: 0,
}

const file: FileAttachment = {
  type: 'text',
  path: '/Users/me/notes.txt',
  name: 'notes.txt',
  mimeType: 'text/plain',
  size: 5,
  text: 'hello',
}

describe('prepareComposerSubmission', () => {
  it('turns selected folders into folder mentions', () => {
    expect(prepareComposerSubmission('review this', [folder])).toEqual({
      message: '[folder:/Users/me/My Project] review this',
    })
  })

  it('keeps files on the attachment transport', () => {
    expect(prepareComposerSubmission('compare', [folder, file])).toEqual({
      message: '[folder:/Users/me/My Project] compare',
      fileAttachments: [file],
    })
  })

  it('supports a folder-only send', () => {
    expect(prepareComposerSubmission('', [folder]).message).toBe('[folder:/Users/me/My Project]')
  })
})

describe('folder attachment staging', () => {
  it('creates the same visible attachment shape for selected and dropped folders', () => {
    expect(createFolderAttachment('/Users/me/My Project/')).toEqual(folder)
  })

  it('deduplicates a folder when it is selected and then dropped', () => {
    expect(appendUniqueAttachments([folder], [createFolderAttachment(folder.path)])).toEqual([folder])
  })

  it('keeps files and folders together in the preview order', () => {
    expect(appendUniqueAttachments([file], [folder])).toEqual([file, folder])
  })

  it('classifies Finder directory entries before they reach FileReader', () => {
    expect(getDroppedFolderPath({ isDirectory: true }, folder.path)).toBe(folder.path)
    expect(getDroppedFolderPath({ isDirectory: false }, file.path)).toBeNull()
    expect(getDroppedFolderPath({ isDirectory: true }, null)).toBeNull()
  })
})
