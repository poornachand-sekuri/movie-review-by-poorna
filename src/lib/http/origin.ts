export function isSameOriginWrite(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  return !origin || origin === requestUrl.origin;
}

