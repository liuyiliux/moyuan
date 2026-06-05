## MODIFIED Requirements

### Requirement: 默认 Prompt 模板格式
系统默认的 `DEFAULT_PROMPT_TEMPLATES["quiz"]["system_prompt"]` SHALL 改为三段固定格式：

**第一段 - 出题质量规范**: 优先依据原文生成概念、定义、原理、方法类考题，规避细碎边角无效考题；严格匹配用户指定难度等级

**第二段 - 素材强制约束**:
1. 题干与正确答案 100% 取自原文知识点区块内容，禁止 AI 凭空编造知识点
2. 单选/多选错误选项仅能从干扰项素材提取内容
3. 每题标注来源 chunk_id、页码，可溯源至原 PDF 文档
4. 严格遵循指定题型：单选/填空/判断/简答

**第三段 - 输出格式约束**: 只返回标准 JSON，严格遵循约定 Schema，禁止多余说明、markdown、注释文本

#### Scenario: 新建工作区使用新格式
- **WHEN** 新工作区无 quiz 模板记录
- **THEN** 系统 SHALL 创建默认模板时使用三段格式的 system_prompt

#### Scenario: 旧模板自动升级
- **WHEN** 已有工作区的默认 quiz 模板名称仍为"默认quiz模板"且内容为旧格式
- **THEN** 系统 SHALL 在 `_get_or_create_quiz_template` 中自动将内容更新为新三段格式（仅对 is_default=true 且 name="默认quiz模板" 的模板执行）

#### Scenario: 用户自定义模板不自动升级
- **WHEN** 用户自行修改了 quiz 模板内容或名称
- **THEN** 系统 SHALL NOT 覆盖用户自定义模板，仅更新系统默认模板

### Requirement: user_prompt 溯源标注
`user_prompt_template` SHALL 增加统一的源块标注格式：`[chunk_id:xxx｜page:xx｜diff:3｜content_id:xxx]`，使 LLM 能精确识别每段素材的来源和上下文。

#### Scenario: 素材来源标注
- **WHEN** 拼接 user_prompt 中的原文知识点和干扰项素材
- **THEN** 系统 SHALL 为每段素材标注 chunk_id、page_number、difficulty、content_id

## ADDED Requirements

### Requirement: 出题范围感知
user_prompt SHALL 根据出题范围类型（category/collection/content）增加范围说明，帮助 LLM 理解出题上下文。

#### Scenario: 按分类出题的范围提示
- **WHEN** scope_type="category"
- **THEN** user_prompt SHALL 包含 "出题范围：分类「{分类名}」" 的说明
