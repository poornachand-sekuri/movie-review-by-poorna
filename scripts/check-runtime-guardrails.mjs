import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const runtimeRoots = ['src', 'public'];
const textExtensions = new Set(['.astro', '.css', '.html', '.js', '.json', '.ts', '.tsx']);
const violations = [];

const walk = (path) => {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
};

for (const file of runtimeRoots.flatMap(walk)) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const content = readFileSync(file, 'utf8');

  if (/responsive/i.test(content)) {
    violations.push(`${file}: reserved project shorthand must not appear in runtime code or UI text`);
  }
}

if (violations.length > 0) {
  throw new Error(`Runtime guardrail violation(s):\n${violations.join('\n')}`);
}

console.log('Runtime naming guardrails passed.');
