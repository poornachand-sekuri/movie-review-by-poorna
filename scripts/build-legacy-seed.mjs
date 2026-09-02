import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [reviewsPath, creditsPath, outputPath] = process.argv.slice(2);

if (!reviewsPath || !creditsPath || !outputPath) {
  console.error(
    'Usage: node scripts/build-legacy-seed.mjs <reviews.json> <cast-crew.json> <output.sql>',
  );
  process.exit(1);
}

const reviews = JSON.parse(readFileSync(reviewsPath, 'utf8'));
const creditsDocument = JSON.parse(readFileSync(creditsPath, 'utf8'));

if (!Array.isArray(reviews)) {
  throw new TypeError('Review source must be a JSON array.');
}

const creditRecords = creditsDocument?.records ?? {};
const sourceFieldOrder = creditsDocument?.field_order ?? [
  'actors',
  'actresses',
  'directors',
  'music_directors',
];

const roleBySourceField = new Map([
  ['actors', 'actor'],
  ['actresses', 'actress'],
  ['directors', 'director'],
  ['music_directors', 'music_director'],
]);

const sqlString = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const sqlNumber = (value) => {
  if (value === null || value === undefined || value === '') return 'NULL';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'NULL';
  return String(number);
};

const stripHtml = (html = '') =>
  String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const statements = [
  '-- Generated migration seed. Do not edit by hand.',
  'PRAGMA foreign_keys = ON;',
  '',
];

const seenSlugs = new Set();
let creditCount = 0;
let galleryCount = 0;

for (const review of reviews) {
  const slug = String(review?.s ?? '').trim();
  const title = String(review?.t ?? '').trim();

  if (!slug || !title) {
    throw new Error('Every review must contain a non-empty slug and title.');
  }

  if (seenSlugs.has(slug.toLowerCase())) {
    throw new Error(`Duplicate review slug: ${slug}`);
  }
  seenSlugs.add(slug.toLowerCase());

  const creditGroups = Array.isArray(creditRecords[slug]) ? creditRecords[slug] : [];
  const creditNames = creditGroups.flatMap((group) => (Array.isArray(group) ? group : []));

  const searchText = stripHtml(
    [
      title,
      review?.l,
      review?.e,
      review?.v,
      review?.body,
      ...creditNames,
    ]
      .filter(Boolean)
      .join(' '),
  );

  const extra = {
    legacyC: review?.c ?? null,
  };

  statements.push(
    `INSERT INTO reviews (` +
      `legacy_id, slug, title, language, release_date, reviewed_date, rating, verdict, excerpt, body_html, poster_url, search_text, status, extra_json` +
      `) VALUES (` +
      [
        sqlNumber(review?.i),
        sqlString(slug),
        sqlString(title),
        sqlString(review?.l ?? null),
        sqlString(review?.rd ?? null),
        sqlString(review?.d ?? ''),
        sqlNumber(review?.r),
        sqlString(review?.v ?? null),
        sqlString(review?.e ?? null),
        sqlString(review?.body ?? ''),
        sqlString(review?.m ?? null),
        sqlString(searchText),
        sqlString('published'),
        sqlString(JSON.stringify(extra)),
      ].join(', ') +
      `);`,
  );

  sourceFieldOrder.forEach((sourceField, groupIndex) => {
    const role = roleBySourceField.get(sourceField) ?? String(sourceField);
    const names = Array.isArray(creditGroups[groupIndex]) ? creditGroups[groupIndex] : [];

    names.forEach((rawName, position) => {
      const name = String(rawName ?? '').trim();
      if (!name) return;

      statements.push(
        `INSERT OR IGNORE INTO people (name) VALUES (${sqlString(name)});`,
        `INSERT OR IGNORE INTO review_credits (review_id, person_id, role, position) VALUES (` +
          `(SELECT id FROM reviews WHERE slug = ${sqlString(slug)}), ` +
          `(SELECT id FROM people WHERE name = ${sqlString(name)} COLLATE NOCASE), ` +
          `${sqlString(role)}, ${position});`,
      );
      creditCount += 1;
    });
  });

  const gallery = Array.isArray(review?.gallery) ? review.gallery : [];
  gallery.forEach((entry, position) => {
    const imageUrl =
      typeof entry === 'string'
        ? entry
        : String(entry?.url ?? entry?.src ?? entry?.image ?? '').trim();
    const altText = typeof entry === 'object' && entry ? entry.alt ?? null : null;

    if (!imageUrl) return;

    statements.push(
      `INSERT OR IGNORE INTO review_gallery (review_id, image_url, alt_text, position) VALUES (` +
        `(SELECT id FROM reviews WHERE slug = ${sqlString(slug)}), ` +
        `${sqlString(imageUrl)}, ${sqlString(altText)}, ${position});`,
    );
    galleryCount += 1;
  });

  const sourceJson = JSON.stringify(review);
  const sourceHash = createHash('sha256').update(sourceJson).digest('hex');

  statements.push(
    `INSERT INTO legacy_import_audit (review_id, source_sha256, source_json) VALUES (` +
      `(SELECT id FROM reviews WHERE slug = ${sqlString(slug)}), ` +
      `${sqlString(sourceHash)}, ${sqlString(sourceJson)});`,
    '',
  );
}

writeFileSync(outputPath, `${statements.join('\n')}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      reviews: reviews.length,
      credits: creditCount,
      galleryItems: galleryCount,
      output: outputPath,
    },
    null,
    2,
  ),
);
