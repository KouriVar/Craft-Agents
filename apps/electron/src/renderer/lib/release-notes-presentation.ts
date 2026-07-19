export interface ReleaseNotesPresentation {
  unseen: boolean
  autoOpen: boolean
}

/** New installs get a badge; existing users see the notes once after upgrade. */
export function getReleaseNotesPresentation(
  latestVersion: string | undefined,
  lastSeenVersion: string,
): ReleaseNotesPresentation {
  const unseen = Boolean(latestVersion && latestVersion !== lastSeenVersion)
  return {
    unseen,
    autoOpen: unseen && lastSeenVersion.length > 0,
  }
}
