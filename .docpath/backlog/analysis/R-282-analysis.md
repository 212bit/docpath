# R-282 Analysis: Backlog Edit Incremental Update & Precise Promote Check

## Problem Description

1. **Backlog Edit Wipes Out Other Sections**: Currently, `docpath backlog edit --acceptance` or `--background` replaces the entire markdown body of the backlog item. The unedited section is reset to the default placeholder `"- 待补充"`. This deletes existing edits and breaks promote maturity checking.
2. **Promote Error is Vague**: When a promotion fails because of placeholder values, the error message only reports `"正文仍为空或包含占位内容"` without indicating which section (`背景` or `验收`) contains the placeholder.

## Proposed Solution

1. **Incremental Update**:
   - Add markdown parser utilities: `getMarkdownSection(body, title)` and `replaceMarkdownSection(body, title, content)`.
   - Update `resolveBacklogBody(options, existingBody)`: if `existingBody` is provided, replace only the edited section (`背景` and/or `验收`) and return the updated body.
2. **Precise Error Messages**:
   - Check `背景` and `验收` sections individually in `missingReadinessEvidence` and `inspectBacklogItem`.
   - Output targeted error messages detailing which specific section is missing or contains placeholder content.
   - Suggest `--body-file` as an alternative way to fully overwrite.
