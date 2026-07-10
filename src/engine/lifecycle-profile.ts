export type LifecycleProfileId = 'lightweight' | 'standard' | 'regulated' | 'custom';

export interface LifecycleStage {
  id: string;
  title: string;
  artifact: string;     // relative path from workspace root, e.g., 'docs/deliverables/01-user-stories.md'
  required: boolean;
  sources?: string[];   // relative source paths / directories
  description?: string;
  required_sections?: string[];
  intent?: string;
}

export interface LifecycleConfig {
  profile: LifecycleProfileId;
  created_at: string;
  updated_at: string;
  stages: LifecycleStage[];
}

export const BUILTIN_LIFECYCLE_PROFILES: Record<Exclude<LifecycleProfileId, 'custom'>, LifecycleStage[]> = {
  lightweight: [
    {
      id: 'brief',
      title: '项目简介',
      artifact: 'docs/deliverables/01-brief.md',
      required: true,
      description: '简要描述项目背景、目标和范围。',
      required_sections: ['TL;DR', '背景与目标', '核心范围'],
      intent: '明确轻量级项目的根本目的与核心目标。'
    },
    {
      id: 'backlog',
      title: '需求 Backlog',
      artifact: 'docs/deliverables/02-backlog.md',
      required: true,
      description: '记录待办需求项清单与优先级。',
      required_sections: ['待办事项清单', '优先级定义'],
      intent: '列举所有需要开发的功能与改动点。'
    },
    {
      id: 'spec',
      title: '任务规约',
      artifact: 'docs/deliverables/03-spec.md',
      required: true,
      description: '开发规格说明书。',
      required_sections: ['功能规格', '技术实现方案'],
      intent: '提供执行开发前必要的规约和接口定义。'
    },
    {
      id: 'plan',
      title: '执行计划',
      artifact: 'docs/deliverables/04-plan.md',
      required: true,
      description: '包含具体步骤的开发和测试计划。',
      required_sections: ['开发阶段划分', '测试与发布计划'],
      intent: '理清实现路径和验证手段。'
    },
    {
      id: 'implementation',
      title: '开发成果',
      artifact: 'docs/deliverables/05-implementation.md',
      required: true,
      description: '代码库及重要成果摘要。',
      required_sections: ['实现代码摘要', '构建验证结果'],
      intent: '汇总实际产出的代码与模块变更。'
    },
    {
      id: 'review',
      title: '评审归档',
      artifact: 'docs/deliverables/06-review.md',
      required: true,
      description: '归档记录评审要点与最终状态。',
      required_sections: ['评审意见', '合规结论'],
      intent: '记录最终交付评审结论。'
    }
  ],
  standard: [
    {
      id: 'intake',
      title: '项目立项/摄入材料',
      artifact: 'docs/deliverables/01-intake.md',
      required: true,
      description: '原始项目立项说明及干系人诉求。',
      required_sections: ['立项背景', '干系人清单', '原始需求材料'],
      intent: '录入原始输入的项目背景信息。'
    },
    {
      id: 'requirements',
      title: '产品需求文档 (PRD)',
      artifact: 'docs/deliverables/02-requirements.md',
      required: true,
      description: '标准产品需求文档，定义核心业务场景与用例。',
      required_sections: ['目标用户与痛点', '功能性需求', '非功能性需求', '验收准则'],
      intent: '固化产品层面的功能范畴、非功能要求及验收门禁。'
    },
    {
      id: 'phase_plan',
      title: '阶段开发规划',
      artifact: 'docs/deliverables/03-phase-plan.md',
      required: true,
      description: '项目里程碑及各阶段发布计划。',
      required_sections: ['里程碑定义', '版本排期', '依赖与风险控制'],
      intent: '规划中长期阶段和版本迭代排期。'
    },
    {
      id: 'backlog',
      title: '需求 Backlog 种子',
      artifact: 'docs/deliverables/04-backlog.md',
      required: true,
      description: '由 PRD 分解出的具体 Backlog 清单。',
      required_sections: ['Backlog 项汇总', '阶段划分关联', 'Gap 与阻碍跟踪'],
      intent: '连接 PRD 与具体执行任务的骨架。'
    },
    {
      id: 'spec',
      title: '技术架构与规约',
      artifact: 'docs/deliverables/05-spec.md',
      required: true,
      description: '模块设计、数据字典及 API 规约。',
      required_sections: ['系统模块架构', 'API 契约/数据结构', '架构决策记录 (ADR)'],
      intent: '规范代码边界、数据流向和核心实现标准。'
    },
    {
      id: 'implementation',
      title: '开发成果汇总',
      artifact: 'docs/deliverables/06-implementation.md',
      required: true,
      description: '代码实现、构建产物及流水线验证记录。',
      required_sections: ['代码提交记录', '持续集成流水线状态', '部署说明'],
      intent: '输出构建与发布审计证据。'
    },
    {
      id: 'test',
      title: '测试计划与报告',
      artifact: 'docs/deliverables/07-test.md',
      required: true,
      description: '单元测试、集成测试及缺陷跟踪状态。',
      required_sections: ['测试覆盖率', '集成测试执行情况', '未解决缺陷清单'],
      intent: '证明系统经过充分验证，质量达标。'
    },
    {
      id: 'review',
      title: '发布评审记录',
      artifact: 'docs/deliverables/08-review.md',
      required: true,
      description: '发布前评审、审计与干系人签署记录。',
      required_sections: ['质量门禁评估', '干系人会签记录', '交付结论'],
      intent: '获取发布授权的闭环证据。'
    }
  ],
  regulated: [
    {
      id: 'user_stories',
      title: '用户故事',
      artifact: 'docs/deliverables/01-user-stories.md',
      required: true,
      description: '从用户视角描述的需求场景清单。',
      required_sections: ['执行摘要', '用户角色 (Actors)', '用户故事清单 (US-XXX)', '优先级与分组'],
      intent: '从用户视角梳理业务场景与角色定位。'
    },
    {
      id: 'user_requirements',
      title: '用户需求书',
      artifact: 'docs/deliverables/02-user-requirements-spec.md',
      required: true,
      description: '正式的用户需求说明书 (URS)，用于甲乙方或跨部门签字画押。',
      required_sections: ['业务需求概述', '具体功能性要求', '性能及安全性指标', '验收准则'],
      intent: '作为合同或交付边界的法律/行政级需求基线。'
    },
    {
      id: 'requirements_analysis',
      title: '需求分析说明书',
      artifact: 'docs/deliverables/03-requirements-analysis-spec.md',
      required: true,
      description: '将用户需求转换为系统视角的分析说明书。',
      required_sections: ['系统边界与上下文', '系统功能分解', '数据实体与流向', '接口与契约说明'],
      intent: '完成业务需求向工程需求的转化。'
    },
    {
      id: 'project_plan',
      title: '项目规划与里程碑',
      artifact: 'docs/deliverables/04-project-plan.md',
      required: true,
      description: '项目规划书，包含工期、里程碑、人员分工及交付物控制矩阵。',
      required_sections: ['项目里程碑安排', 'WBS 工作分解结构', '交付控制矩阵', '风险管理预案'],
      intent: '确定交付阶段、关键里程碑和交付管控策略。'
    },
    {
      id: 'outline_design',
      title: '概要设计说明书',
      artifact: 'docs/deliverables/05-outline-design.md',
      required: true,
      description: '概要设计 (Outline Design)，定义系统架构、部署架构及核心技术选型。',
      required_sections: ['系统物理与逻辑架构', '组件/模块划分', '数据库概要设计', '技术选型与理由'],
      intent: '明确大块的系统分工、技术选型与关键技术决策。'
    },
    {
      id: 'detailed_design',
      title: '详细设计说明书',
      artifact: 'docs/deliverables/06-detailed-design.md',
      required: true,
      description: '详细设计 (Detailed Design)，定义具体类、API 接口实现逻辑及字段映射。',
      required_sections: ['接口详细定义', '类与算法流程图', '数据库物理表结构', '异常处理设计'],
      intent: '提供直接指导编码与测试的保真级设计规约。'
    }
  ]
};
