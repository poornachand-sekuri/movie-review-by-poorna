interface JsonResponseOptions {
  status?: number;
  cacheControl?: string;
}

export function jsonResponse(data: unknown, options: JsonResponseOptions = {}): Response {
  return Response.json(data, {
    status: options.status ?? 200,
    headers: {
      'cache-control': options.cacheControl ?? 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function apiError(status: number, code: string, message: string): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function parseBoundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null || value.trim() === '') return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(maximum, Math.max(minimum, parsed));
}
