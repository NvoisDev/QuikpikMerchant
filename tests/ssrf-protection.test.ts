import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPrivateIp, isSafeStaticUrl, validateDestination, safeFetch } from '../server/utils/safeFetch';

describe('isPrivateIp', () => {
  it('blocks loopback IPv4', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('127.255.255.255')).toBe(true);
  });

  it('blocks AWS/GCP metadata endpoint', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('169.254.0.1')).toBe(true);
  });

  it('blocks RFC1918 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('10.255.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
  });

  it('blocks CGNAT range', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('100.127.255.255')).toBe(true);
  });

  it('blocks IPv6 loopback', () => {
    expect(isPrivateIp('::1')).toBe(true);
  });

  it('blocks IPv6 link-local', () => {
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('blocks IPv6 ULA', () => {
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd12:3456::1')).toBe(true);
  });

  it('allows public IPv4', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });

  it('allows 172.15 and 172.32 (outside RFC1918 block)', () => {
    expect(isPrivateIp('172.15.0.1')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
  });

  it('blocks IPv6-mapped loopback ::ffff:127.0.0.1', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
  });

  it('blocks IPv6-mapped metadata endpoint ::ffff:169.254.169.254', () => {
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
  });

  it('blocks IPv6-mapped RFC1918 ::ffff:192.168.1.1', () => {
    expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('blocks IPv6-mapped loopback in hex pair form ::ffff:7f00:0001', () => {
    expect(isPrivateIp('::ffff:7f00:0001')).toBe(true);
  });

  it('blocks IPv6-mapped metadata in hex pair form ::ffff:a9fe:a9fe', () => {
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true);
  });

  it('allows IPv6-mapped public IP ::ffff:8.8.8.8', () => {
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('isSafeStaticUrl', () => {
  it('blocks IPv6-mapped loopback literal in URL', () => {
    expect(isSafeStaticUrl('http://[::ffff:127.0.0.1]/logo')).toBe(false);
  });

  it('blocks IPv6-mapped metadata in URL', () => {
    expect(isSafeStaticUrl('http://[::ffff:169.254.169.254]/meta-data')).toBe(false);
  });

  it('allows public URLs', () => {
    expect(isSafeStaticUrl('https://cdn.example.com/logo.png')).toBe(true);
    expect(isSafeStaticUrl('https://images.unsplash.com/photo.jpg')).toBe(true);
  });
});

describe('validateDestination', () => {
  it('rejects non-http schemes', async () => {
    await expect(validateDestination('ftp://example.com/logo.png')).rejects.toThrow('non-http scheme');
    await expect(validateDestination('file:///etc/passwd')).rejects.toThrow('non-http scheme');
    await expect(validateDestination('data:text/html,<h1>x</h1>')).rejects.toThrow('non-http scheme');
  });

  it('rejects malformed URLs', async () => {
    await expect(validateDestination('not-a-url')).rejects.toThrow('malformed URL');
  });

  it('rejects localhost hostname', async () => {
    await expect(validateDestination('http://localhost/logo')).rejects.toThrow('reserved hostname');
  });

  it('rejects .local TLD', async () => {
    await expect(validateDestination('http://internal.local/logo')).rejects.toThrow('reserved hostname');
  });

  it('rejects direct private IP literals in URL', async () => {
    await expect(validateDestination('http://127.0.0.1:8080/logo')).rejects.toThrow('private IP literal');
    await expect(validateDestination('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('private IP literal');
    await expect(validateDestination('http://10.0.0.1/logo')).rejects.toThrow('private IP literal');
    await expect(validateDestination('http://192.168.1.1/logo')).rejects.toThrow('private IP literal');
  });
});

describe('safeFetch — redirect chain SSRF', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('blocks redirect to private IP', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      callCount++;
      if (callCount === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      return new Response('secret', { status: 200 });
    }) as typeof fetch;

    await expect(
      safeFetch('http://8.8.8.8/logo.png')
    ).rejects.toThrow(/SSRF blocked/);
  });

  it('blocks redirect to localhost', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(null, {
        status: 301,
        headers: { location: 'http://localhost/internal' },
      })
    ) as typeof fetch;

    await expect(
      safeFetch('http://8.8.8.8/logo.png')
    ).rejects.toThrow(/SSRF blocked/);
  });

  it('blocks redirect chains that exceed the limit', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      return new Response(null, {
        status: 302,
        headers: { location: `http://8.8.8.${n + 1}/logo` },
      });
    }) as typeof fetch;

    await expect(
      safeFetch('http://8.8.8.8/logo.png', {}, 3)
    ).rejects.toThrow(/too many redirects/);
  });

  it('rejects non-http redirect schemes', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'ftp://example.com/file' },
      })
    ) as typeof fetch;

    await expect(
      safeFetch('http://8.8.8.8/logo.png')
    ).rejects.toThrow(/SSRF blocked/);
  });
});
