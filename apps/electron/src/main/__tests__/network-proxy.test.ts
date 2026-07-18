/**
 * Tests for network proxy bypass rules (NO_PROXY parsing and matching).
 */
import { describe, it, expect } from 'bun:test';
import { buildElectronProxyConfig, parseNoProxyRules, shouldBypassProxy } from '../network-proxy-utils';

describe('buildElectronProxyConfig', () => {
  it('inherits the operating system proxy when no custom proxy is enabled', () => {
    expect(buildElectronProxyConfig(undefined)).toEqual({ mode: 'system' });
    expect(buildElectronProxyConfig({ enabled: false })).toEqual({ mode: 'system' });
  });

  it('falls back to the system proxy when the custom form is enabled but empty', () => {
    expect(buildElectronProxyConfig({ enabled: true })).toEqual({ mode: 'system' });
  });

  it('builds fixed HTTP and HTTPS proxy rules with normalized bypass entries', () => {
    expect(buildElectronProxyConfig({
      enabled: true,
      httpProxy: 'http://127.0.0.1:7890',
      httpsProxy: 'http://127.0.0.1:7890',
      noProxy: ' localhost, 127.0.0.1, .example.com ',
    })).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'https=http://127.0.0.1:7890;http=http://127.0.0.1:7890',
      proxyBypassRules: 'localhost,127.0.0.1,.example.com',
    });
  });
});

describe('parseNoProxyRules', () => {
  it('returns empty array for undefined/empty input', () => {
    expect(parseNoProxyRules(undefined)).toEqual([]);
    expect(parseNoProxyRules('')).toEqual([]);
  });

  it('parses simple hostnames', () => {
    const rules = parseNoProxyRules('localhost, example.com');
    expect(rules).toEqual([
      { host: 'localhost', wildcard: false },
      { host: 'example.com', wildcard: false },
    ]);
  });

  it('parses wildcard', () => {
    const rules = parseNoProxyRules('*');
    expect(rules).toEqual([{ host: '*', wildcard: true }]);
  });

  it('strips leading dot', () => {
    const rules = parseNoProxyRules('.example.com');
    expect(rules).toEqual([{ host: 'example.com', wildcard: false }]);
  });

  it('parses host:port', () => {
    const rules = parseNoProxyRules('example.com:8080');
    expect(rules).toEqual([{ host: 'example.com', port: 8080, wildcard: false }]);
  });
});

describe('shouldBypassProxy', () => {
  it('returns false when no rules', () => {
    expect(shouldBypassProxy('https://example.com', [])).toBe(false);
  });

  it('matches exact host', () => {
    const rules = parseNoProxyRules('localhost');
    expect(shouldBypassProxy('http://localhost:3000/path', rules)).toBe(true);
    expect(shouldBypassProxy('http://example.com', rules)).toBe(false);
  });

  it('matches subdomain (suffix)', () => {
    const rules = parseNoProxyRules('example.com');
    expect(shouldBypassProxy('https://api.example.com/v1', rules)).toBe(true);
    expect(shouldBypassProxy('https://example.com', rules)).toBe(true);
    expect(shouldBypassProxy('https://notexample.com', rules)).toBe(false);
  });

  it('respects port-scoped rules', () => {
    const rules = parseNoProxyRules('example.com:8080');
    expect(shouldBypassProxy('http://example.com:8080/path', rules)).toBe(true);
    expect(shouldBypassProxy('http://example.com:9090/path', rules)).toBe(false);
  });

  it('matches implicit default ports', () => {
    const rules443 = parseNoProxyRules('example.com:443');
    // https default port is 443 — should match even without explicit port
    expect(shouldBypassProxy('https://example.com/path', rules443)).toBe(true);
    // http default port is 80 — should NOT match a :443 rule
    expect(shouldBypassProxy('http://example.com/path', rules443)).toBe(false);

    const rules80 = parseNoProxyRules('example.com:80');
    expect(shouldBypassProxy('http://example.com/path', rules80)).toBe(true);
    expect(shouldBypassProxy('https://example.com/path', rules80)).toBe(false);

    // Explicit port that differs from rule should not match
    const rules8080 = parseNoProxyRules('example.com:8080');
    expect(shouldBypassProxy('https://example.com/path', rules8080)).toBe(false);
  });

  it('wildcard bypasses everything', () => {
    const rules = parseNoProxyRules('*');
    expect(shouldBypassProxy('https://anything.example.com', rules)).toBe(true);
  });

  it('handles IPv6 literal', () => {
    const rules = parseNoProxyRules('[::1]');
    expect(shouldBypassProxy('http://[::1]:3000/path', rules)).toBe(true);
  });

  it('matches exact IP literal', () => {
    const rules = parseNoProxyRules('192.168.1.1');
    expect(shouldBypassProxy('http://192.168.1.1/', rules)).toBe(true);
    expect(shouldBypassProxy('http://10.0.0.1/', rules)).toBe(false);
  });
});
