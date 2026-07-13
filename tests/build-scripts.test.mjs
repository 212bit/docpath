import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

describe('build scripts', () => {
  it('keeps CLI build scripts focused on the CLI bundle', () => {
    assert.match(pkg.scripts.build, /build:clean/);
    assert.match(pkg.scripts['build:clean'], /--clean/);
    assert.equal(pkg.scripts['build:dashboard'], undefined);
    assert.doesNotMatch(pkg.scripts['build:test'], /--clean/);
    assert.match(pkg.scripts.test, /build:test/);
    assert.doesNotMatch(pkg.scripts.test, /pnpm build(?:\s|$)/);
  });
});
