import type { APIRoute } from 'astro';
import {
  getReviewReactionSnapshotBySlug,
  setReviewReaction,
  type ReviewReaction,
} from '../../../../lib/data/reactions';
import { apiError, jsonResponse } from '../../../../lib/http/json';

export const prerender = false;

const VOTER_COOKIE = 'mrp_reaction_voter';
const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function parseReaction(value: unknown): ReviewReaction | null {
  return value === 'like' || value === 'dislike' ? value : null;
}

export const GET: APIRoute = async ({ params, cookies }) => {
  const slug = params.slug?.trim();
  if (!slug) return apiError(400, 'INVALID_REVIEW_SLUG', 'A review slug is required.');

  try {
    const voterKey = cookies.get(VOTER_COOKIE)?.value ?? null;
    const snapshot = await getReviewReactionSnapshotBySlug(slug, voterKey);
    if (!snapshot) return apiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');

    return jsonResponse({ slug, ...snapshot });
  } catch (error) {
    console.error(`Failed to load reactions for review: ${slug}`, error);
    return apiError(500, 'REACTION_LOAD_FAILED', 'Unable to load reactions for this review.');
  }
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const slug = params.slug?.trim();
  if (!slug) return apiError(400, 'INVALID_REVIEW_SLUG', 'A review slug is required.');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'INVALID_REACTION_BODY', 'A valid JSON reaction body is required.');
  }

  const reaction = parseReaction(
    body && typeof body === 'object' && 'reaction' in body
      ? (body as { reaction?: unknown }).reaction
      : null,
  );

  if (!reaction) {
    return apiError(400, 'INVALID_REACTION', 'Reaction must be like or dislike.');
  }

  try {
    let voterKey = cookies.get(VOTER_COOKIE)?.value?.trim() ?? '';
    if (!voterKey) {
      voterKey = crypto.randomUUID();
      cookies.set(VOTER_COOKIE, voterKey, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: VOTER_COOKIE_MAX_AGE,
      });
    }

    const snapshot = await setReviewReaction(slug, voterKey, reaction);
    if (!snapshot) return apiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');

    return jsonResponse({ slug, ...snapshot });
  } catch (error) {
    console.error(`Failed to update reactions for review: ${slug}`, error);
    return apiError(500, 'REACTION_UPDATE_FAILED', 'Unable to update this reaction right now.');
  }
};
