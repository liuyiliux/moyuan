## ADDED Requirements

### Requirement: 出题范围选择
系统 SHALL 支持用户选择出题范围，支持"当前书""分类""合集""手动多选"四种范围类型。

#### Scenario: 默认范围为当前书
- **WHEN** 用户在内容详情页打开 AI 面板出题区域
- **THEN** 出题范围默认为当前内容（单本书），行为等同于 rag-quiz-generation change

#### Scenario: 按分类出题
- **WHEN** 用户选择"按分类"范围并选择一个分类节点
- **THEN** 系统 SHALL 将该分类下所有有 text chunk 的内容纳入出题范围，从范围内所有 chunk 中检索出题

#### Scenario: 按合集出题
- **WHEN** 用户选择"按合集"范围并选择一个合集
- **THEN** 系统 SHALL 将该合集内所有有 text chunk 的内容纳入出题范围，从范围内所有 chunk 中检索出题

#### Scenario: 手动多选内容出题
- **WHEN** 用户选择"手动选择"范围并勾选多本书
- **THEN** 系统 SHALL 将勾选的所有内容纳入出题范围

#### Scenario: 范围内无 text chunk
- **WHEN** 选择的范围内所有内容都没有 text chunk（如全是图片 PDF）
- **THEN** 系统 SHALL 返回空题目列表和提示"所选范围内暂无文本分块可供出题"

### Requirement: 跨内容 RAG 检索
系统 SHALL 在跨内容出题时，从范围内所有内容的 text chunk 中统一检索出题素材和干扰项素材。

#### Scenario: 随机出题模式跨内容检索
- **WHEN** 用户在跨内容范围选择"随机出题"模式
- **THEN** 系统 SHALL 从范围内所有 text chunk 中随机抽取 source_count 个 chunk 作为出题素材

#### Scenario: 按主题出题模式跨内容检索
- **WHEN** 用户在跨内容范围选择"按主题出题"模式并输入关键词
- **THEN** 系统 SHALL 将关键词向量化，在范围内所有 chunk 中向量检索 Top-K chunk

#### Scenario: 干扰项跨内容检索
- **WHEN** 为出题 chunk 检索干扰项素材
- **THEN** 系统 SHALL 在范围内所有其他 chunk 中检索相似 chunk（排除出题 chunk 自身）

### Requirement: 前端范围选择 UI
前端 AI 面板 SHALL 提供出题范围选择 UI，支持切换范围类型和选择具体范围。

#### Scenario: 展示范围选择器
- **WHEN** 用户打开 AI 面板出题区域
- **THEN** 界面 MUST 显示出题范围选择器，包含"当前书""按分类""按合集"选项

#### Scenario: 切换到按分类出题
- **WHEN** 用户选择"按分类"范围类型
- **THEN** 界面 MUST 显示分类树选择器，用户可选择一个分类节点

#### Scenario: 切换到按合集出题
- **WHEN** 用户选择"按合集"范围类型
- **THEN** 界面 MUST 显示合集列表选择器，用户可选择一个合集

#### Scenario: 范围切换时清空旧题目
- **WHEN** 用户切换出题范围
- **THEN** 系统 SHALL 清空当前显示的题目，要求用户重新生成
