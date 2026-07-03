## 执行计划

### S1: Audit Current Workflow Classification
- [x] S1: Audit Current Workflow Classification
- **描述**: Trace how promoted backlog items are assigned `level`, `workflow_profile`, route hints, and quick/standard gates. Identify why this level 3 workflow task was promoted as quick.
- **验收条件**: Findings identify the responsible code paths and include a failing or documented reproduction for high-level promoted work misclassified as quick.
- **依赖**: 无

### S2: Define Project-Intake State And Artifact Model
- [x] S2: Define Project-Intake State And Artifact Model
- **描述**: Define the MVP state model for project intake, including source capture, analysis, brief, spec/architecture evidence, plan, confirmed decomposition, and blocked states.
- **验收条件**: A concrete schema/file layout decision exists, including where project-intake artifacts live and how source provenance is represented.
- **依赖**: S1

### S3: Define CLI Command Contract
- [x] S3: Define CLI Command Contract
- **描述**: Decide and document the CLI surface for project-intake MVP, preferring a distinct project namespace unless implementation evidence shows a profile extension is safer.
- **验收条件**: Command contracts cover capture, analyze/brief generation guidance, plan, and backlog conversion, including inputs, outputs, errors, and no-network behavior.
- **依赖**: S2

### S4: Implement Project-Intake Capture
- [x] S4: Implement Project-Intake Capture
- **描述**: Add the capture route for text/markdown source materials and source references. Store source inventory and initial metadata in the chosen artifact model.
- **验收条件**: Users can create a project-intake item from content or files; CLI output reports canonical artifact paths and next action.
- **依赖**: S2, S3

### S5: Implement Analysis And Brief Guidance
- [ ] S5: Implement Analysis And Brief Guidance
- **描述**: Add deterministic routing and prompt-payload generation for requirements, product, UI/UX, technical, risks, and open-questions analysis, plus project brief writing.
- **验收条件**: CLI can guide or persist project-intake analysis/brief artifacts without hidden LLM execution and with clear missing-evidence errors.
- **依赖**: S4

### S6: Implement Confirmation And Decomposition Gates
- [ ] S6: Implement Confirmation And Decomposition Gates
- **描述**: Add gates that prevent implementation, milestone planning, or backlog generation until the project-intake output is explicitly confirmed by the user.
- **验收条件**: Unconfirmed intake cannot generate executable backlog items; confirmed intake can generate or guide normal backlog items with provenance links.
- **依赖**: S5

### S7: Integrate Routing With Next, Status, Check, And Closeout
- [ ] S7: Integrate Routing With Next, Status, Check, And Closeout
- **描述**: Update `docpath next --agent`, `status --agent`, `check`, and closeout guidance so project-intake states resume correctly and do not emit quick-task closeout hints.
- **验收条件**: Project-intake states produce coherent next actions; standard backlog and quick tasks keep their existing route behavior.
- **依赖**: S6

### S8: Add Compatibility And Regression Tests
- [ ] S8: Add Compatibility And Regression Tests
- **描述**: Add tests for project-intake capture, readiness gates, artifact generation, confirmation behavior, backlog conversion, and existing backlog/quick compatibility.
- **验收条件**: Tests fail before implementation where appropriate and pass after implementation; existing backlog and quick test coverage remains green.
- **依赖**: S4, S5, S6, S7

### S9: Update Agent Protocol And Documentation
- [ ] S9: Update Agent Protocol And Documentation
- **描述**: Update agent-facing instructions and docs to explain when to use project-intake versus backlog, quick, analyze, spec, and plan flows.
- **验收条件**: Documentation clearly covers new-project inputs such as PPT-derived text, API docs, introductory docs, meeting notes, and single requirements documents.
- **依赖**: S7

### S10: Run Quality Gates And Prepare Closeout
- [ ] S10: Run Quality Gates And Prepare Closeout
- **描述**: Run the relevant test suite and `docpath check`, then summarize changed artifacts, known limitations, and follow-up work.
- **验收条件**: Quality gates pass or any residual failures are explicitly documented with owner and reason.
- **依赖**: S8, S9

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [ ] S4
- [ ] S5
- [ ] S6
- [ ] S7
- [ ] S8
- [ ] S9
- [ ] S10

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10
