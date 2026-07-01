/**
 * Unit tests for topic-synonyms module
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  normalizeTopic,
  areTopicsRelated,
  getCanonicalTopics,
  addSynonyms,
  TOPIC_SYNONYMS,
} from '../dist/utils/topic-synonyms.js';

describe('topic-synonyms', () => {
  describe('normalizeTopic', () => {
    it('expands English canonical key to all synonyms', () => {
      const result = normalizeTopic('memory');
      assert.ok(result.includes('memory'));
      assert.ok(result.includes('记忆'));
      assert.ok(result.includes('知识沉淀'));
      assert.ok(result.includes('knowledge'));
      assert.ok(result.includes('context'));
    });

    it('expands Chinese synonym to full synonym set', () => {
      const result = normalizeTopic('记忆');
      assert.ok(result.includes('memory'));
      assert.ok(result.includes('记忆'));
      assert.ok(result.includes('知识沉淀'));
    });

    it('handles architecture synonyms', () => {
      const result = normalizeTopic('架构');
      assert.ok(result.includes('architecture'));
      assert.ok(result.includes('架构'));
      assert.ok(result.includes('设计'));
    });

    it('returns lowercase for unknown topics', () => {
      const result = normalizeTopic('UnknownTopic');
      assert.deepStrictEqual(result, ['unknowntopic']);
    });

    it('trims whitespace', () => {
      const result = normalizeTopic('  memory  ');
      assert.ok(result.includes('memory'));
    });

    it('returns empty array for empty input', () => {
      const result = normalizeTopic('');
      assert.deepStrictEqual(result, []);
    });

    it('deduplicates synonyms', () => {
      const result = normalizeTopic('memory');
      const uniqueCount = new Set(result).size;
      assert.equal(result.length, uniqueCount, 'Should not have duplicates');
    });
  });

  describe('areTopicsRelated', () => {
    it('detects related topics via synonyms', () => {
      assert.ok(areTopicsRelated('memory', '记忆'));
      assert.ok(areTopicsRelated('记忆', 'memory'));
    });

    it('detects related topics via shared canonical key', () => {
      assert.ok(areTopicsRelated('knowledge', '记忆'));
      assert.ok(areTopicsRelated('context', '上下文'));
    });

    it('returns false for unrelated topics', () => {
      assert.ok(!areTopicsRelated('memory', 'code'));
      assert.ok(!areTopicsRelated('architecture', 'test'));
    });

    it('is case-insensitive', () => {
      assert.ok(areTopicsRelated('Memory', '记忆'));
      assert.ok(areTopicsRelated('MEMORY', '记忆'));
    });
  });

  describe('getCanonicalTopics', () => {
    it('returns all registered canonical keys', () => {
      const topics = getCanonicalTopics();
      assert.ok(topics.includes('memory'));
      assert.ok(topics.includes('architecture'));
      assert.ok(topics.includes('context'));
      assert.ok(Array.isArray(topics));
    });

    it('has reasonable number of topics (20-40)', () => {
      const topics = getCanonicalTopics();
      assert.ok(topics.length >= 20, `Should have at least 20 topics, got ${topics.length}`);
      assert.ok(topics.length <= 40, `Should have at most 40 topics, got ${topics.length}`);
    });
  });

  describe('addSynonyms', () => {
    it('adds new synonyms to existing topic', () => {
      const before = normalizeTopic('memory').length;
      addSynonyms('memory', ['brain', 'cognition']);
      const after = normalizeTopic('memory').length;
      
      assert.ok(after > before, 'Should have more synonyms after adding');
      assert.ok(normalizeTopic('memory').includes('brain'));
      assert.ok(normalizeTopic('brain').includes('memory'));
    });

    it('creates new topic if not exists', () => {
      const newTopic = 'newfeature';
      addSynonyms(newTopic, ['特性', 'feature']);
      
      assert.ok(getCanonicalTopics().includes(newTopic));
      assert.ok(normalizeTopic(newTopic).includes('特性'));
    });

    it('does not add duplicates', () => {
      const before = normalizeTopic('memory').length;
      addSynonyms('memory', ['memory', '记忆']); // Already exists
      const after = normalizeTopic('memory').length;
      
      assert.equal(before, after, 'Should not add duplicates');
    });
  });

  describe('TOPIC_SYNONYMS coverage', () => {
    it('has memory-related synonyms', () => {
      assert.ok(TOPIC_SYNONYMS.memory);
      assert.ok(TOPIC_SYNONYMS.memory.includes('记忆'));
      assert.ok(TOPIC_SYNONYMS.memory.includes('knowledge'));
    });

    it('has architecture-related synonyms', () => {
      assert.ok(TOPIC_SYNONYMS.architecture);
      assert.ok(TOPIC_SYNONYMS.architecture.includes('架构'));
      assert.ok(TOPIC_SYNONYMS.architecture.includes('design'));
    });

    it('has task/workflow synonyms', () => {
      assert.ok(TOPIC_SYNONYMS.task);
      assert.ok(TOPIC_SYNONYMS.workflow);
      assert.ok(TOPIC_SYNONYMS.task.includes('任务'));
      assert.ok(TOPIC_SYNONYMS.workflow.includes('工作流'));
    });
  });
});

console.log('✓ Topic synonyms unit tests loaded\n');
