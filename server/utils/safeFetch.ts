import dns from 'node:dns/promises';

const PRIVATE_IPV4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./,
  /^0\./,
  /^240\./,
  /^255\./,
];

function isPrivateIpv4(addr: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some(re => re.test(addr));
}

function unwrapMappedIpv4(addr: string): string | null {
  const lower = addr.toLowerCase();
  // ::ffff:w.x.y.z (dotted-decimal)
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1]!;
  // ::ffff:AABB:CCDD (hex pair representation)
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  // ::ffff:0:w.x.y.z
  const mapped0 = lower.match(/^::ffff:0:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped0) return mapped0[1]!;
  return null;
}

export function isPrivateIp(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // Check for IPv6-mapped IPv4 (::ffff:x.x.x.x)
  const embedded = unwrapMappedIpv4(addr);
  if (embedded !== null) return isPrivateIpv4(embedded);

  // Plain IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(addr)) return isPrivateIpv4(addr);

  // IPv6 special addresses
  if (addr === '::1') return true;
  if (/^fe80:/i.test(addr)) return true;
  if (/^f[cd]/i.test(addr)) return true;

  return false;
}

export function isSafeStaticUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    if (hostname === 'localhost') return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) return false;
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isIpv6 = hostname.includes(':');
    if (isIpv4 || isIpv6) return !isPrivateIp(hostname);
    return true;
  } catch {
    return false;
  }
}

export async function validateDestination(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SSRF blocked: malformed URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`SSRF blocked: non-http scheme ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const isIpv4Literal = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6Literal = hostname.includes(':');

  if (isIpv4Literal || isIpv6Literal) {
    if (isPrivateIp(hostname)) {
      throw new Error(`SSRF blocked: private IP literal ${hostname}`);
    }
    return;
  }

  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    throw new Error(`SSRF blocked: reserved hostname ${hostname}`);
  }

  const results = await dns.lookup(hostname, { all: true });
  for (const { address } of results) {
    if (isPrivateIp(address)) {
      throw new Error(`SSRF blocked: ${hostname} resolved to private IP ${address}`);
    }
  }
}

export async function safeFetch(
  url: string,
  options: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  await validateDestination(url);

  const resp = await fetch(url, { ...options, redirect: 'manual' });

  if (resp.status >= 300 && resp.status < 400) {
    if (maxRedirects === 0) throw new Error('SSRF blocked: too many redirects');
    const location = resp.headers.get('location');
    if (!location) throw new Error('Redirect missing Location header');
    const next = new URL(location, url).toString();
    return safeFetch(next, options, maxRedirects - 1);
  }

  return resp;
}
