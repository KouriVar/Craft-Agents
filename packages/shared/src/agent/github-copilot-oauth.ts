import type { AuthEvent, AuthPrompt, OAuthCredential } from '@earendil-works/pi-ai';
import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot';

export interface GitHubCopilotLoginOptions {
  onDeviceCode: (info: { userCode: string; verificationUri: string }) => void;
  onPrompt?: (prompt: AuthPrompt) => Promise<string>;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

function getGitHubCopilotOAuth() {
  const oauth = githubCopilotProvider().auth.oauth;
  if (!oauth) throw new Error('GitHub Copilot OAuth is unavailable');
  return oauth;
}

/**
 * Compatibility facade over Pi 0.80.10's provider-owned OAuth flow.
 * Keeps the rest of Craft independent from Pi's OAuth module layout.
 */
export async function loginGitHubCopilot(options: GitHubCopilotLoginOptions): Promise<OAuthCredential> {
  return getGitHubCopilotOAuth().login({
    signal: options.signal,
    prompt: async (prompt) => options.onPrompt?.(prompt) ?? '',
    notify: (event: AuthEvent) => {
      if (event.type === 'device_code') {
        options.onDeviceCode({
          userCode: event.userCode,
          verificationUri: event.verificationUri,
        });
      } else if (event.type === 'progress' || event.type === 'info') {
        options.onProgress?.(event.message);
      } else if (event.type === 'auth_url') {
        options.onProgress?.(event.instructions ?? event.url);
      }
    },
  });
}

/** Exchange the long-lived GitHub token for a short-lived Copilot credential. */
export async function refreshGitHubCopilotToken(refreshToken: string): Promise<OAuthCredential> {
  return getGitHubCopilotOAuth().refresh({
    type: 'oauth',
    access: '',
    refresh: refreshToken,
    expires: 0,
  });
}
