## ADDED Requirements

### Requirement: 分类树缓存
系统 SHALL 对分类树递归查询结果做 Redis 缓存，键格式 `quiz:scope:category:<category_id>`，值存储其下所有子分类 ID 列表的 JSON 数组，TTL 60 分钟。

#### Scenario: 缓存命中
- **WHEN** 出题请求 scope_type="category" 且对应 key 在 Redis 中存在
- **THEN** 系统 SHALL 直接使用缓存的分 ID 列表，跳过递归查询

#### Scenario: 缓存未命中
- **WHEN** 出题请求 scope_type="category" 但对应 key 不在 Redis 中
- **THEN** 系统 SHALL 执行递归查询，结果写入 Redis 并设置 TTL 60min

### Requirement: 合集绑定缓存
系统 SHALL 对合集绑定的 content_id 列表做 Redis 缓存，键格式 `quiz:scope:collection:<collection_id>`，值存储 content_id 列表的 JSON 数组，TTL 60 分钟。

#### Scenario: 合集缓存命中
- **WHEN** 出题请求 scope_type="collection" 且对应 key 在 Redis 中存在
- **THEN** 系统 SHALL 直接使用缓存的 content_id 列表

#### Scenario: 合集缓存未命中
- **WHEN** 出题请求 scope_type="collection" 但对应 key 不在 Redis 中
- **THEN** 系统 SHALL 查询 collection_items 表，结果写入 Redis 并设置 TTL 60min

### Requirement: Redis 不可用降级
当 Redis 服务不可用时，系统 SHALL 自动降级为直接查询数据库，不报错、不阻塞出题。

#### Scenario: Redis 连接失败
- **WHEN** 尝试读写 Redis 缓存失败（连接超时、服务宕机）
- **THEN** 系统 SHALL 捕获异常，走数据库直查路径，记录 warning 日志

### Requirement: 缓存主动失效
当分类树或合集发生增删改操作时，系统 SHALL 主动删除对应的 Redis 缓存键。

#### Scenario: 分类新增子节点
- **WHEN** 某分类新增子分类
- **THEN** 系统 SHALL 删除 `quiz:scope:category:<parent_id>` 缓存键

#### Scenario: 合集内容变更
- **WHEN** 合集绑定成员发生增删
- **THEN** 系统 SHALL 删除 `quiz:scope:collection:<collection_id>` 缓存键
