## 1. 项目基础与数据库初始化

- [x] 1.1 初始化项目目录结构（backend/frontend/alembic/scripts/skills）
- [x] 1.2 配置 Python 虚拟环境，安装核心依赖（FastAPI、asyncpg、alembic、pgvector、python-multipart）
- [x] 1.3 配置前端项目（React 18 + TypeScript + Vite + TailwindCSS v4）
- [x] 1.4 编写 Docker Compose 配置（PostgreSQL 16 + pgvector + 可选 Redis）
- [x] 1.5 创建 Alembic 迁移环境，编写初始 migration（contents/tags/categories/collections/provider_configs/brains/search_logs）
- [x] 1.6 配置环境变量管理（.env.example，含数据库连接、文件存储路径、加密密钥）
- [x] 1.7 搭建基础 FastAPI 应用（CORS 配置、健康检查接口 /api/health）

## 2. 第三方服务配置模块（provider-config）

- [x] 2.1 实现提供商配置 CRUD API（POST/GET/PUT/DELETE /api/providers）
- [x] 2.2 实现 API Key 加密存储（AES-256-CBC 加密，密钥从环境变量读取）
- [x] 2.3 实现测试连接端点（POST /api/providers/{id}/test）
- [x] 2.4 实现功能-模型绑定配置（摘要/嵌入/题库分别指定提供商和模型）
- [x] 2.5 前端：提供商配置管理页面（列表、新增/编辑 Modal、连接测试、API Key 掩码显示）
- [x] 2.6 前端：功能默认模型选择下拉组件

## 3. 文件管理基础（file-management + storage-vector）

- [x] 3.1 实现文件存储路径管理服务（读取/验证/切换存储根目录）
- [x] 3.2 实现文件上传 API（POST /api/upload，支持多文件、multipart/form-data）
- [x] 3.3 实现文件 MD5 重复检测逻辑，上传时返回重复文件信息
- [x] 3.4 实现文件软删除与回收站逻辑（DELETE 移入回收站，30 天清理 cron 任务）
- [x] 3.5 前端：文件上传组件（拖拽 + 点击选择，支持多文件和文件夹）
- [x] 3.6 前端：重复文件提示 Modal（跳过/覆盖/保留两者）
- [x] 3.7 前端：存储路径配置 UI（设置页面）

## 4. 内容解析与异步处理（content-ingestion）

- [x] 4.1 实现异步任务队列（asyncio 后台任务 + 状态追踪表）
- [x] 4.2 实现 PDF 文本提取（PyMuPDF/pdfplumber，分页/分章节，保留标题层级）
- [x] 4.3 实现 Word/Excel 文档解析（python-docx/openpyxl，提取全文与表格结构）
- [x] 4.4 实现图片 OCR 处理（腾讯云 OCR API 集成，输出结构化文字块）
- [x] 4.5 实现音频/视频语音转写（OpenAI Whisper API + 本地 faster-whisper 双路，生成带时间戳字幕切片）
- [x] 4.6 实现网页内容抓取（trafilatura 提取正文 + playwright 页面截图）
- [x] 4.7 实现内容处理状态更新 API（GET /api/content/{id}/status）与 WebSocket 进度推送
- [x] 4.8 前端：处理状态指示器组件（排队中/处理中/已完成/失败 + 重试按钮）

## 5. 向量嵌入存储（storage-vector）

- [x] 5.1 实现多模态嵌入服务（文本嵌入 API 调用，支持多提供商）
- [x] 5.2 实现图像嵌入 API 调用（图像多模态嵌入）
- [x] 5.3 实现内容向量化流水线（内容解析完成后自动触发嵌入，失败标记重试状态）
- [x] 5.4 实现批量重新嵌入 API（POST /api/embeddings/reindex，用于切换嵌入模型后重建）
- [x] 5.5 创建 pgvector IVFFlat 索引（在 Alembic 迁移中配置）
- [x] 5.6 前端：嵌入状态展示与批量重试 UI（设置 > 索引管理页）

## 6. 语义检索引擎（semantic-search）

- [x] 6.1 实现向量语义检索 API（POST /api/search，cosine 相似度，Top-K）
- [x] 6.2 实现 PostgreSQL 全文检索（tsvector/tsquery，支持中文分词配置）
- [x] 6.3 实现 RRF 混合检索融合排名逻辑
- [x] 6.4 实现检索结果片段提取与高亮（文本关键词高亮、字幕片段时间戳标注）
- [x] 6.5 实现检索结果多维度过滤（类型/分类/标签/时间范围）
- [x] 6.6 前端：全局搜索组件（Ctrl+K 唤起、实时建议、结果卡片展示）
- [x] 6.7 前端：搜索结果页（高亮片段展示、过滤侧边栏、视频字幕跳转链接）

## 7. 内容组织管理（content-organization）

- [x] 7.1 实现多级分类 CRUD API（支持树形结构，最多 5 级）
- [x] 7.2 实现标签 CRUD API（增删改合并，获取标签内容列表）
- [x] 7.3 实现合集 CRUD API（包含内容关联与排序）
- [x] 7.4 实现内容星标/置顶/批量操作 API
- [x] 7.5 实现版本历史 API（笔记保存时自动记录版本，支持查看历史和恢复）
- [x] 7.6 前端：左侧分类树组件（可折叠、右键菜单、拖拽排序）
- [x] 7.7 前端：标签管理页面与内容标签编辑器
- [x] 7.8 前端：合集详情页（内容列表、顺序拖拽调整）
- [x] 7.9 前端：内容详情侧边栏（元数据编辑、标签/分类/合集修改）

## 8. 内容预览与播放器（content-viewer）

- [x] 8.1 实现文件预览 API（GET /api/content/{id}/preview，返回文件流或预签名 URL）
- [x] 8.2 前端：图片查看器（支持缩放/平移/旋转，全屏模式）
- [x] 8.3 前端：PDF 查看器（集成 react-pdf，支持翻页/缩放/内文搜索）
- [x] 8.4 前端：视频播放器（自定义播放控件，字幕同步展示）
- [x] 8.5 前端：字幕时间轴面板（字幕列表，点击跳转视频时间戳）
- [x] 8.6 前端：深色/浅色主题切换（CSS 变量 + shadcn/ui 主题系统）

## 9. 富文本笔记编辑器（note-editor）

- [x] 9.1 集成富文本编辑器（Tiptap 或 BlockNote，支持标题/列表/代码块/图片/链接）
- [x] 9.2 实现笔记 CRUD API（POST/GET/PUT /api/notes，含自动版本历史）
- [x] 9.3 实现文本批注 API（POST /api/annotations，关联文字位置范围与批注内容）
- [x] 9.4 实现内容摘录引用 API（POST /api/notes/from-excerpt，生成含来源引用的新笔记）
- [x] 9.5 前端：批注交互（选中文字高亮、批注气泡、批注面板列表）
- [x] 9.6 前端：摘录为笔记功能（在任意内容查看器中选中文字/字幕触发摘录）

## 10. AI 辅助功能（ai-assistant）

- [x] 10.1 实现 AI 摘要生成 API（POST /api/ai/summarize，支持文本/PDF/视频字幕输入）
- [x] 10.2 实现关联推荐 API（GET /api/content/{id}/related，基于向量相似度返回 Top-10）
- [x] 10.3 实现题库生成 API（POST /api/ai/quiz，支持单内容和合集输入，返回结构化题目）
- [x] 10.4 前端：摘要展示面板（内容详情页，含「生成摘要」按钮和结果展示）
- [x] 10.5 前端：「相关内容」侧边栏组件（内容详情页右侧）
- [x] 10.6 前端：题库生成与展示页面（Markdown 格式展示，支持导出）

## 11. 数据备份与迁移（data-backup）

- [x] 11.1 实现备份 API（POST /api/backup，触发 pg_dump + 文件目录打包，以时间戳命名）
- [x] 11.2 实现导出 API（POST /api/export/full，生成完整知识库导出包，不含 API Keys）
- [x] 11.3 实现导入/恢复 API（POST /api/import，解析导出包，执行 pg_restore + 文件解压 + 路径重映射）
- [x] 11.4 前端：数据管理页面（备份列表、创建备份、导出/导入操作、进度展示）

## 12. 数据统计面板（analytics-dashboard）

- [x] 12.1 实现统计汇总 API（GET /api/analytics/overview，返回各类型内容数量和存储统计）
- [x] 12.2 实现标签分布统计 API（GET /api/analytics/tags，Top-20 标签频率）
- [x] 12.3 实现检索热度统计 API（GET /api/analytics/search-trends，检索历史聚合）
- [x] 12.4 实现内容增长趋势 API（GET /api/analytics/growth，按周/月分组统计）
- [x] 12.5 前端：统计仪表盘页面（内容分布饼图、标签云、检索热度排行、增长折线图）

## 13. 集成测试与部署

- [x] 13.1 编写核心功能单元测试（检索引擎、内容解析、嵌入服务）
- [x] 13.2 编写 API 集成测试（主要 CRUD 接口，覆盖正常和异常场景）
- [x] 13.3 完善一键启动脚本（含数据库初始化、Alembic 迁移、前端构建）
- [x] 13.4 编写部署文档（环境要求、配置说明、首次启动指南）
- [x] 13.5 前端性能优化（路由懒加载、大文件预览虚拟滚动、检索防抖）
