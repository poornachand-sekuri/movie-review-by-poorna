import type { APIRoute } from 'astro';
import {
  CommentRateLimitError,
  CommentTargetNotFoundError,
  listApprovedComments,
  submitPendingComment,
  type CommentTargetType,
} from '../../lib/data/comments';
import { apiError, jsonResponse, parseBoundedInteger } from '../../lib/http/json';

export const prerender = false;

const COMMENT_COOKIE = 'mrp_comment_submitter';
const COMMENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function parseTargetType(value: unknown): CommentTargetType | null {
  return value === 'lounge' || value === 'review' ? value : null;
}

function cleanSingleLine(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function cleanComment(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\r\n?/g, '\n').slice(0, 1500)
    : '';
}

export const GET: APIRoute = async ({ url }) => {
  const targetType = parseTargetType(url.searchParams.get('target'));
  const rawTargetId = url.searchParams.get('target_id')?.trim() ?? '';
  const targetId = targetType === 'lounge' ? 'lounge' : rawTargetId.slice(0, 180);
  const limit = parseBoundedInteger(url.searchParams.get('limit'), 2, 1, 20);

  if (!targetType) return apiError(400, 'INVALID_COMMENT_TARGET', 'Comments target must be lounge or review.');
  if (targetType === 'review' && !targetId) {
    return apiError(400, 'INVALID_COMMENT_TARGET_ID', 'A review slug is required.');
  }

  try {
    const comments = await listApprovedComments(targetType, targetId, limit);
    return jsonResponse({ target: targetType, targetId, comments });
  } catch (error) {
    console.error('Failed to load approved comments', error);
    return apiError(500, 'COMMENTS_LOAD_FAILED', 'Unable to load comments right now.');
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'INVALID_COMMENT_BODY', 'A valid JSON comment body is required.');
  }

  if (!body || typeof body !== 'object') {
    return apiError(400, 'INVALID_COMMENT_BODY', 'A valid comment body is required.');
  }

  const payload = body as Record<string, unknown>;
  const targetType = parseTargetType(payload.target);
  const rawTargetId = cleanSingleLine(payload.target_id, 180);
  const targetId = targetType === 'lounge' ? 'lounge' : rawTargetId;
  const name = cleanSingleLine(payload.name, 80);
  const comment = cleanComment(payload.comment);
  const website = cleanSingleLine(payload.website, 160);

  if (!targetType) return apiError(400, 'INVALID_COMMENT_TARGET', 'Comments target must be lounge or review.');
  if (targetType === 'review' && !targetId) {
    return apiError(400, 'INVALID_COMMENT_TARGET_ID', 'A review slug is required.');
  }
  if (name.length < 2) return apiError(400, 'INVALID_COMMENT_NAME', 'Please enter your name.');
  if (comment.length < 2) return apiError(400, 'INVALID_COMMENT_TEXT', 'Please enter a comment.');

  // Quietly accept bot-filled honeypot submissions without writing them to D1.
  if (website) {
    return jsonResponse(
      {
        ok: true,
        status: 'pending',
        message: 'Thank you. Your comment is awaiting approval.',
      },
      { status: 202 },
    );
  }

  try {
    let submitterKey = cookies.get(COMMENT_COOKIE)?.value?.trim() ?? '';
    if (!submitterKey) {
      submitterKey = crypto.randomUUID();
      cookies.set(COMMENT_COOKIE, submitterKey, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: COMMENT_COOKIE_MAX_AGE,
      });
    }

    await submitPendingComment({
      targetType,
      targetId,
      name,
      comment,
      submitterKey,
    });

    return jsonResponse(
      {
        ok: true,
        status: 'pending',
        message: 'Thank you. Your comment is awaiting approval.',
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof CommentRateLimitError) {
      return apiError(429, 'COMMENT_RATE_LIMITED', error.message);
    }
    if (error instanceof CommentTargetNotFoundError) {
      return apiError(404, 'COMMENT_TARGET_NOT_FOUND', error.message);
    }

    console.error('Failed to submit comment', error);
    return apiError(500, 'COMMENT_SUBMIT_FAILED', 'Unable to submit your comment right now.');
  }
};
