export interface LegacyVoteRow {
  voter_key: string;
  vote: 'like' | 'dislike';
  updated_at: string;
}

// Never create, change or delete anything in the preserved namespace.
export function readLegacyVotePage(sql: SqlStorage, after = ''): LegacyVoteRow[] {
  const exists = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'votes'").toArray();
  if (!exists.length) return [];
  return sql.exec('SELECT voter_key, vote, updated_at FROM votes WHERE voter_key > ? ORDER BY voter_key LIMIT 500', after).toArray() as unknown as LegacyVoteRow[];
}
