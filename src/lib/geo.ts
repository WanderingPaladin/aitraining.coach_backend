function stripIpv4Mapped(ip: string): string {
  return ip.replace(/^::ffff:/i, '');
}

export function isPublicIp(ip: string | undefined): ip is string {
  if (!ip) {
    return false;
  }
  const value = stripIpv4Mapped(ip.trim());
  if (!value || value === '127.0.0.1' || value === '::1' || value === '0.0.0.0' || value === 'localhost') {
    return false;
  }
  if (value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.')) {
    return false;
  }
  const match = /^172\.(\d+)\./.exec(value);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) {
      return false;
    }
  }
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80')) {
    return false;
  }
  return true;
}

type GeoResult = {
  ip: string;
  label: string;
};

function formatGeo(data: {
  ip?: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): GeoResult | null {
  if (!data.ip) {
    return null;
  }
  const place = [data.city, data.region, data.country].filter(Boolean).join(', ');
  return {
    ip: data.ip,
    label: JSON.stringify({
      ip: data.ip,
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      label: place,
    }),
  };
}

export async function lookupIpLocation(ip?: string): Promise<GeoResult | null> {
  const target = isPublicIp(ip) ? stripIpv4Mapped(ip) : null;
  if (!target) {
    return null;
  }

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(target)}`, {
      signal: AbortSignal.timeout(4000),
    });
    const data = (await response.json()) as {
      success?: boolean;
      ip?: string;
      city?: string;
      region?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
    };
    if (!data?.success) {
      return null;
    }
    return formatGeo(data);
  } catch {
    return null;
  }
}
