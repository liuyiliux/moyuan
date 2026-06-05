## quiz-page Specification

独立的测验页面 (`/quiz`)，提供统一的出题、答题、错题体验。

### ADDED Requirements

#### Requirement: 测验页面结构
测验页面 SHALL 包含顶部范围筛选器和三个功能 Tab。

##### Scenario: 页面加载
- **WHEN** 用户访问 `/quiz`
- **THEN** 显示测验页面，默认选中"出题"Tab
- **AND** 顶部范围筛选器默认选中"全部"（不限范围）

##### Scenario: 范围筛选
- **WHEN** 用户在顶部筛选器中选择一个分类/合集
- **THEN** 出题、答题、错题 Tab 的查询范围限定为该分类/合集
- **AND** 筛选条件在 Tab 切换时保持

##### Scenario: 无筛选范围时的出题
- **WHEN** 用户未选择任何范围筛选器
- **THEN** 出题时不传 scope_type/scope_id，后端从所有 content 中出题

#### Requirement: 历史题目查询
测验页面的答题 Tab SHALL 从已持久化的题目库中加载。

##### Scenario: 加载历史题目
- **WHEN** 用户切换到"答题"Tab 且选择了一个范围
- **THEN** 调用 `GET /api/ai/quiz/history?scope_type=X&scope_id=Y&page=1&page_size=10`
- **AND** 展示题目列表，按生成时间倒序

##### Scenario: 无历史题目
- **WHEN** 答题 Tab 没有找到历史题目
- **THEN** 显示提示"该范围内暂无题目，请先生成题目"
- **AND** 提供快捷跳转到"出题"Tab 的按钮

#### Requirement: 答题交互
答题 Tab SHALL 支持逐题作答和即时反馈。

##### Scenario: 单选题作答
- **WHEN** 用户点击单选题的某个选项
- **THEN** 该选项高亮，显示对/错状态
- **AND** 正确选项高亮为绿色，错误选项高亮为红色
- **AND** 调用 `POST /api/ai/quiz/record` 记录作答结果
- **AND** 如答错，该题自动加入错题库

##### Scenario: 判断题作答
- **WHEN** 用户点击"正确"或"错误"按钮
- **THEN** 显示判断结果（绿色对勾/红色叉号）
- **AND** 记录作答结果

##### Scenario: 完成全部答题
- **WHEN** 用户答完当前加载的所有题目
- **THEN** 显示答题统计：正确数/总数，正确率
- **AND** 提供"查看错题"按钮跳转到错题 Tab

#### Requirement: 错题回顾
错题 Tab SHALL 展示用户所有答错的题目。

##### Scenario: 加载错题
- **WHEN** 用户切换到"错题"Tab
- **THEN** 调用 `GET /api/ai/quiz/wrong` 加载错题列表
- **AND** 如设置了范围筛选，过滤出该范围内的错题

##### Scenario: 错题重新学习
- **WHEN** 用户查看某道错题
- **THEN** 显示题面、用户错误答案、正确答案、解析
- **AND** 提供"移出错题本"按钮（调用 `DELETE /api/ai/quiz/wrong/{id}`）

##### Scenario: 无错题
- **WHEN** 错题列表为空
- **THEN** 显示"暂无错题，继续保持！"
