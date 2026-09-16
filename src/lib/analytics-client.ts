type PageIdentity = {
  pageType: 'home' | 'review' | 'cine-cafe' | 'other';
  pageKey: string;
  reviewSlug: string | null;
};

type TrafficAttribution = {
  trafficSource: string;
  sourceDetail: string | null;
  campaign: string | null;
  landingPage: string;
};

const ATTRIBUTION_KEY = 'mrp:traffic-attribution:v1';

function pageIdentity(): PageIdentity {
  const path = window.location.pathname;
  if (path === '/') return { pageType: 'home', pageKey: '/', reviewSlug: null };
  if (path === '/search' || path === '/search/') return { pageType: 'cine-cafe', pageKey: '/search', reviewSlug: null };

  const reviewMatch = path.match(/^\/review\/([^/]+)\/?$/);
  if (reviewMatch?.[1]) {
    const slug = decodeURIComponent(reviewMatch[1]);
    return { pageType: 'review', pageKey: `/review/${slug}`, reviewSlug: slug };
  }

  return { pageType: 'other', pageKey: path.slice(0, 220) || '/', reviewSlug: null };
}

function normalizeSource(value: string): string {
  const source = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 40);
  if (source === 'twitter' || source === 't.co') return 'x';
  if (source === 'fb' || source === 'meta' || source.includes('facebook')) return 'facebook';
  if (source.includes('instagram')) return 'instagram';
  if (source.includes('whatsapp') || source === 'wa') return 'whatsapp';
  if (source.includes('google')) return 'google';
  if (source.includes('bing')) return 'bing';
  return source || 'direct';
}

function sourceFromReferrer(): { trafficSource: string; sourceDetail: string | null } {
  if (!document.referrer) return { trafficSource: 'direct', sourceDetail: null };
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) return { trafficSource: 'direct', sourceDetail: null };
    const host = referrer.hostname.toLowerCase().replace(/^www\./, '').slice(0, 120);
    if (host.includes('instagram.com')) return { trafficSource: 'instagram', sourceDetail: host };
    if (host.includes('facebook.com') || host.includes('fb.com')) return { trafficSource: 'facebook', sourceDetail: host };
    if (host === 't.co' || host.includes('x.com') || host.includes('twitter.com')) return { trafficSource: 'x', sourceDetail: host };
    if (host.includes('whatsapp.com')) return { trafficSource: 'whatsapp', sourceDetail: host };
    if (host.includes('google.')) return { trafficSource: 'google', sourceDetail: host };
    if (host.includes('bing.com')) return { trafficSource: 'bing', sourceDetail: host };
    return { trafficSource: 'referral', sourceDetail: host || null };
  } catch {
    return { trafficSource: 'direct', sourceDetail: null };
  }
}

function currentAttribution(): TrafficAttribution {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source')?.trim() || '';
  const campaign = params.get('utm_campaign')?.trim().slice(0, 120) || null;
  const landingPage = `${window.location.pathname}${window.location.search}`.slice(0, 220) || '/';

  if (utmSource) {
    const attribution: TrafficAttribution = {
      trafficSource: normalizeSource(utmSource),
      sourceDetail: utmSource.slice(0, 120),
      campaign,
      landingPage,
    };
    try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch {}
    return attribution;
  }

  try {
    const stored = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TrafficAttribution>;
      if (parsed.trafficSource && parsed.landingPage) {
        return {
          trafficSource: normalizeSource(parsed.trafficSource),
          sourceDetail: typeof parsed.sourceDetail === 'string' ? parsed.sourceDetail.slice(0, 120) : null,
          campaign: typeof parsed.campaign === 'string' ? parsed.campaign.slice(0, 120) : null,
          landingPage: parsed.landingPage.slice(0, 220),
        };
      }
    }
  } catch {}

  const referrer = sourceFromReferrer();
  const attribution: TrafficAttribution = { ...referrer, campaign: null, landingPage };
  try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch {}
  return attribution;
}

function sendAnalytics(payload: Record<string, unknown>): void {
  void fetch('/api/analytics', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function recordCinemaPageView(): void {
  sendAnalytics({ ...pageIdentity(), ...currentAttribution() });
}

export function recordCinemaEvent(eventType: 'social_follow_click' | 'review_share_click', platform: string): void {
  sendAnalytics({ eventType, platform: normalizeSource(platform), ...pageIdentity(), ...currentAttribution() });
}
