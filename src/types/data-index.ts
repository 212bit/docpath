/**
 * DataIndex - file index metadata exposed to agents.
 *
 * Phase 2: index enrichment.
 * CLI output returns structured indexes so agents can inspect available data
 * without reading full files by default.
 *
 * Design principles:
 * 1. Provide enough metadata: path, schema, size, and summary.
 * 2. Do not return full content by default.
 * 3. Generate entries from file stats and schema references.
 */

/**
 * Index metadata for one file.
 */
export interface FileIndexEntry {
  /** File path relative to the project root. */
  path: string;

  /** Schema reference, such as StateSchema or BreadcrumbLineSchema. */
  schema: string;

  /** File size in KB. */
  size_kb: number;

  /** Short summary that helps agents decide whether deeper reading is needed. */
  summary: string;
}

/**
 * Breadcrumb-specific index metadata.
 */
export interface BreadcrumbIndexEntry extends FileIndexEntry {
  /** Total line count. */
  line_count: number;

  /** Number of recent entries already included in CLI output. */
  recent_count: number;
}

/**
 * Complete data index.
 *
 * Returned as the `data_index` field in `docpath status --agent` output.
 */
export interface DataIndex {
  /** state.json index. */
  state: FileIndexEntry;

  /** breadcrumb.jsonl index. */
  breadcrumb: BreadcrumbIndexEntry;

  /** plan.md index, present only when there is an active task. */
  plan?: FileIndexEntry;

  /** spec.md index, present only when there is an active task. */
  spec?: FileIndexEntry;
}

/**
 * Summary generator function type.
 */
export type SummaryGenerator = (filePath: string) => string;
