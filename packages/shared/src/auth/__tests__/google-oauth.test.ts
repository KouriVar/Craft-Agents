import { afterEach, describe, expect, it } from 'bun:test';
import { exchangeGoogleOAuth, getGoogleScopes } from '../google-oauth';

const originalFetch = globalThis.fetch;

function createUnsignedIdToken(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `header.${encodedPayload}.signature`;
}

describe('Google OAuth', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('includes OIDC identity scopes for email fallback', () => {
    const scopes = getGoogleScopes({ service: 'gmail' });

    expect(scopes).toContain('openid');
    expect(scopes).toContain('email');
    expect(scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
  });

  it('uses id_token email when Google profile fetch fails', async () => {
    const idToken = createUnsignedIdToken({ email: 'person@example.com' });

    const fetchStub: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          id_token: idToken,
        }), { status: 200 });
      }

      if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response('profile disabled', { status: 403 });
      }

      return new Response('unexpected request', { status: 500 });
    }, { preconnect: originalFetch.preconnect });

    globalThis.fetch = fetchStub;

    const result = await exchangeGoogleOAuth({
      code: 'code',
      codeVerifier: 'verifier',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:6477/callback',
    });

    expect(result.success).toBe(true);
    expect(result.email).toBe('person@example.com');
  });
});
