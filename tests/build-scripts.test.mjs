import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

describe('build scripts', () => {
  it('keeps publish build clean but test build non-clean to avoid dist races', () => {
    assert.match(pkg.scripts.build, /build:clean/);
    assert.match(pkg.scripts['build:clean'], /--clean/);
    assert.match(pkg.scripts['build:clean'], /build:dashboard/);
    assert.match(pkg.scripts['build:dashboard'], /vite build --config vite\.dashboard\.config\.ts/);
    assert.doesNotMatch(pkg.scripts['build:test'], /--clean/);
    assert.match(pkg.scripts['build:test'], /build:dashboard/);
    assert.match(pkg.scripts.test, /build:test/);
    assert.doesNotMatch(pkg.scripts.test, /pnpm build(?:\s|$)/);
  });
});
