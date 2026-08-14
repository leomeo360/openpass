export function normalizeIpRule(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [address, prefix, extra] = trimmed.split("/");
  if (extra !== undefined) return null;
  if (prefix !== undefined) {
    const octets = ipv4Octets(address);
    const bits = Number(prefix);
    if (!octets || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
    return `${octets.join(".")}/${bits}`;
  }
  const ipv4 = ipv4Octets(address);
  if (ipv4) return ipv4.join(".");
  return isIpv6(address) ? address.toLowerCase() : null;
}

export function ipRuleMatches(ip: string, rule: string): boolean {
  const normalizedIp = normalizeIpRule(ip);
  if (!normalizedIp || normalizedIp.includes("/")) return false;
  const normalizedRule = normalizeIpRule(rule);
  if (!normalizedRule) return false;
  if (!normalizedRule.includes("/")) return normalizedIp.toLowerCase() === normalizedRule.toLowerCase();
  const [network, rawPrefix] = normalizedRule.split("/");
  const source = ipv4Number(normalizedIp);
  const target = ipv4Number(network);
  if (source === null || target === null) return false;
  const prefix = Number(rawPrefix);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (source & mask) === (target & mask);
}

function ipv4Octets(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null;
}

function ipv4Number(value: string): number | null {
  const octets = ipv4Octets(value);
  if (!octets) return null;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || !/^[0-9a-fA-F:.]+$/.test(value)) return false;
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.startsWith("[") && hostname.endsWith("]");
  } catch {
    return false;
  }
}
