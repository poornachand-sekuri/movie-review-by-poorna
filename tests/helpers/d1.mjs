import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Execute the actual application SQL against SQLite, with the D1 binding contract.
export function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`migrations/${name}`, 'utf8'));
  }
  const metrics = { calls: 0, statements: 0 };
  const execute = (sql, values) => {
    metrics.statements += 1;
    const statement = sqlite.prepare(sql);
    const bindings = Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
    // D1 ?1 parameters correspond to named numeric parameters in node:sqlite.
    const results = statement.all(bindings);
    const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { results, meta, success: true };
  };
  const db = {
    sqlite, metrics,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        execute() { return execute(sql, values); },
        async run() { metrics.calls += 1; return this.execute(); },
        async first() { return (await this.run()).results[0] ?? null; },
      };
    },
    async batch(statements) {
      metrics.calls += 1;
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

export function installBindings(bindings) {
  globalThis.__cinemaTestBindings = bindings;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'cloudflare:workers') {
        return { url: 'data:text/javascript,export const env = globalThis.__cinemaTestBindings;', shortCircuit: true };
      }
      if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        const url = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      return next(specifier, context);
    },
  });
}
