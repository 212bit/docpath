import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStepDependencies,
  buildPlanTopology,
  renderAsciiTopology,
  renderMermaidTopology,
  renderPlanDependencyGraph,
} from '../dist/utils/plan-topology.js';

describe('plan topology engine', () => {
  it('parses dependency strings correctly in various formats', () => {
    assert.deepEqual(parseStepDependencies('无'), []);
    assert.deepEqual(parseStepDependencies('None'), []);
    assert.deepEqual(parseStepDependencies('none'), []);
    assert.deepEqual(parseStepDependencies(''), []);
    assert.deepEqual(parseStepDependencies(null), []);
    assert.deepEqual(parseStepDependencies('S1'), ['S1']);
    assert.deepEqual(parseStepDependencies('S1, S2'), ['S1', 'S2']);
    assert.deepEqual(parseStepDependencies('S1、S2'), ['S1', 'S2']);
    assert.deepEqual(parseStepDependencies('S1 和 S2'), ['S1', 'S2']);
    assert.deepEqual(parseStepDependencies('S1.1, S2.2'), ['S1.1', 'S2.2']);
  });

  it('builds linear topology correctly', () => {
    const steps = [
      { id: 'S1', name: 'Step 1', dependencies: '无', status: 'done' },
      { id: 'S2', name: 'Step 2', dependencies: 'S1', status: 'in_progress' },
      { id: 'S3', name: 'Step 3', dependencies: 'S2', status: 'pending' },
    ];
    const topology = buildPlanTopology(steps);

    assert.equal(topology.hasErrors, false);
    assert.equal(topology.layers.length, 3);
    assert.deepEqual(topology.roots, ['S1']);
    assert.deepEqual(topology.leaves, ['S3']);
    assert.deepEqual(topology.readySteps, ['S2']);
    assert.deepEqual(topology.blockedSteps, ['S3']);

    const s2Node = topology.nodes.get('S2');
    assert.equal(s2Node?.isReady, true);
    assert.deepEqual(s2Node?.unmetDependencies, []);

    const s3Node = topology.nodes.get('S3');
    assert.equal(s3Node?.isReady, false);
    assert.deepEqual(s3Node?.unmetDependencies, ['S2']);

    const graph = renderPlanDependencyGraph(topology);
    assert.equal(graph, 'S1 → S2 → S3');
  });

  it('builds and calculates multi-branch parallel topology (DAG)', () => {
    const steps = [
      { id: 'S1', name: 'Root setup', dependencies: '无', status: 'done' },
      { id: 'S2', name: 'Branch A', dependencies: 'S1', status: 'pending' },
      { id: 'S3', name: 'Branch B', dependencies: 'S1', status: 'pending' },
      { id: 'S4', name: 'Join test', dependencies: 'S2, S3', status: 'pending' },
    ];
    const topology = buildPlanTopology(steps);

    assert.equal(topology.hasErrors, false);
    assert.equal(topology.layers.length, 3);
    assert.deepEqual(topology.layers[0].map((n) => n.id), ['S1']);
    assert.deepEqual(topology.layers[1].map((n) => n.id), ['S2', 'S3']);
    assert.deepEqual(topology.layers[2].map((n) => n.id), ['S4']);

    // S2 and S3 are parallel tracks on Layer 1
    assert.deepEqual(topology.parallelTracks, [['S2', 'S3']]);
    assert.deepEqual(topology.readySteps, ['S2', 'S3']);
    assert.deepEqual(topology.blockedSteps, ['S4']);

    const ascii = renderAsciiTopology(topology);
    assert.match(ascii, /\[Layer 1\]/);
    assert.match(ascii, /\[Layer 2\] \(可并发\)/);
    assert.match(ascii, /S2: Branch A/);
    assert.match(ascii, /S3: Branch B/);
    assert.match(ascii, /⚡\[就绪\]/);

    const mermaid = renderMermaidTopology(topology);
    assert.match(mermaid, /S1 --> S2/);
    assert.match(mermaid, /S1 --> S3/);
    assert.match(mermaid, /S2 --> S4/);
    assert.match(mermaid, /S3 --> S4/);
  });

  it('detects cycles and missing dependencies', () => {
    const cyclicSteps = [
      { id: 'S1', name: 'Step 1', dependencies: 'S2', status: 'pending' },
      { id: 'S2', name: 'Step 2', dependencies: 'S1', status: 'pending' },
      { id: 'S3', name: 'Step 3', dependencies: 'S99', status: 'pending' },
    ];
    const topology = buildPlanTopology(cyclicSteps);

    assert.equal(topology.hasErrors, true);
    assert.equal(topology.cycles.length, 1);
    assert.deepEqual(topology.missingDeps, [{ stepId: 'S3', missingDep: 'S99' }]);

    const ascii = renderAsciiTopology(topology);
    assert.match(ascii, /环状依赖警告/);
    assert.match(ascii, /缺失依赖警告/);
  });
});
