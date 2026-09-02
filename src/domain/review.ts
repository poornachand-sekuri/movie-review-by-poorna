export type ReviewStatus = 'draft' | 'published' | 'archived';

export interface ReviewRecord {
  id: number;
  legacyId: number | null;
  slug: string;
  title: string;
  language: string | null;
  releaseDate: string | null;
  reviewedDate: string;
  rating: number | null;
  verdict: string | null;
  excerpt: string | null;
  bodyHtml: string;
  posterUrl: string | null;
  status: ReviewStatus;
  extra: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCredit {
  reviewId: number;
  personId: number;
  role: string;
  position: number;
}

export interface ReviewGalleryItem {
  id: number;
  reviewId: number;
  imageUrl: string;
  altText: string | null;
  position: number;
}
