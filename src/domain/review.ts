export type ReviewStatus = 'draft' | 'published' | 'archived';

export interface ReviewSummary {
  id: number;
  slug: string;
  title: string;
  language: string | null;
  releaseDate: string | null;
  reviewedDate: string;
  rating: number | null;
  verdict: string | null;
  excerpt: string | null;
  posterUrl: string | null;
}

export interface ReviewCredit {
  personId: number;
  name: string;
  role: string;
  position: number;
}

export interface ReviewGalleryItem {
  id: number;
  imageUrl: string;
  altText: string | null;
  position: number;
}

export interface ReviewDetail extends ReviewSummary {
  legacyId: number | null;
  bodyHtml: string;
  status: ReviewStatus;
  extra: Readonly<Record<string, unknown>>;
  credits: readonly ReviewCredit[];
  gallery: readonly ReviewGalleryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSearchResult extends ReviewSummary {
  relevance: number;
}

export interface ReviewListOptions {
  limit?: number;
  offset?: number;
  language?: string;
}

export interface ReviewSearchOptions {
  limit?: number;
}
