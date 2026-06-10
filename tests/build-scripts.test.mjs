import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

describe('build scripts', () => {
  it('keeps CLI builds clean while dashboard builds stay isolated', () => {
    const dashboardBuild = ['build', ['dash', 'board'].join('')].join(':');
    assert.match(pkg.scripts.build, /build:clean/);
    assert.match(pkg.scripts['build:clean'], /--clean/);
    assert.equal(pkg.scripts['build:clean'].includes(dashboardBuild), false);
    assert.equal(pkg.scripts[dashboardBuild], 'vite build --config vite.dashboard.config.ts');
    assert.doesNotMatch(pkg.scripts['build:test'], /--clean/);
    assert.equal(pkg.scripts['build:test'].includes(dashboardBuild), false);
    assert.match(pkg.scripts.test, /build:test/);
    assert.doesNotMatch(pkg.scripts.test, /pnpm build(?:\s|$)/);
  });
});
