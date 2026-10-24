/**
 * docpath backlog — graph / tree / deps
 */

import { stringify } from 'yaml';
import {
  buildBacklogGraph,
  renderBacklogAsciiGraph,
  renderBacklogMermaidGraph,
} from '../../engine/backlog-graph.js';
import { listBacklogItems } from '../../engine/backlog.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogGraph(options: BacklogCommandOptions): Promise<void> {
  const items = await listBacklogItems(options.cwd);
  const graph = buildBacklogGraph(items);

  if (options.mermaid) {
    console.log(renderBacklogMermaidGraph(graph));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify({
      total_nodes: Object.keys(graph.nodes).length,
      layers: graph.layers,
      ready_items: graph.readyItems,
      blocked_items: graph.blockedItems,
      cycles: graph.cycles,
    }));
    return;
  }

  console.log(renderBacklogAsciiGraph(graph, options.id));
}
