import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isArchiveDocPath,
  inferContentTerms,
  buildProjectDocumentEntry,
} from '../dist/utils/document-index.js';
import { renderSpecMarkdownFromDocument } from '../dist/utils/structured-docs.js';

test('isArchiveDocPath correctly classifies analysis and archived backlog files', () => {
  assert.equal(isArchiveDocPath('.docpath/backlog/analysis/R-281-analysis.md'), true);
  assert.equal(isArchiveDocPath('.docpath/backlog/archived/R-281.md'), true);
  assert.equal(isArchiveDocPath('.docpath/tasks/done/T-20260601/spec.md'), true);
  assert.equal(isArchiveDocPath('.docpath/workspace/decisions.md'), true);
  assert.equal(isArchiveDocPath('docs/architecture.md'), false);
  assert.equal(isArchiveDocPath('.docpath/tasks/current/spec.md'), false);
});

test('inferContentTerms is bounded and archive entry does not produce content terms', () => {
  const dummyContent = Array.from({ length: 100 }, (_, i) => `word${i} sample text token`).join('\n');
  const terms = inferContentTerms(dummyContent);
  assert.ok(terms.length <= 24, `terms length ${terms.length} should be <= 24`);

  const archiveEntry = buildProjectDocumentEntry({
    path: 'backlog/analysis/R-100-analysis.md',
    size: 2048,
    mtime: new Date(),
    content: dummyContent,
    title: 'R-100 Analysis',
    summary: 'R-100 analysis summary',
  });
  assert.equal(archiveEntry.archive, true);
  assert.deepEqual(archiveEntry.content_terms, []);

  const activeEntry = buildProjectDocumentEntry({
    path: 'tasks/current/spec.md',
    size: 2048,
    mtime: new Date(),
    content: dummyContent,
    title: 'Current Spec',
    summary: 'Current spec summary',
  });
  assert.equal(activeEntry.archive, false);
  assert.ok((activeEntry.content_terms?.length ?? 0) > 0);
});

test('renderSpecMarkdownFromDocument renders compact major gate when not required', () => {
  const doc = {
    title: 'Test Spec',
    functional_requirements: [{ id: 'FR-1', text: 'req 1', done: false }],
    non_functional_requirements: [],
    scope: { included: ['in'], excluded: ['out'] },
    major_change_gate: {
      required: false,
      types: [],
      user_confirmed: null,
      decision_brief_markdown: '',
    },
    ui_gate: { state: 'exempt' },
    acceptance_criteria: [{ id: 'AC-1', text: 'ac 1', done: false }],
  };

  const md = renderSpecMarkdownFromDocument(doc);
  assert.ok(md.includes('- [ ] 无重大变更'));
  assert.ok(!md.includes('UI 框架 / 设计系统'));
});
