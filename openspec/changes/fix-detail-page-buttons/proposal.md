## Why

详情页（/contents/:id）的多个按钮功能无法正常工作，包括 AI 助手按钮（摘要、相关内容、生成题目）、批注面板、关联图谱面板等。从日志来看，部分按钮点击后有 API 调用但界面无反馈，部分按钮甚至没有任何反应。需要全面梳理并修复详情页的交互问题。

## What Changes

- 修复详情页顶部所有按钮的点击事件绑定
- 确保 AI 面板（摘要、相关内容、生成题目）能正常显示和切换
- 确保批注面板能正常打开和关闭
- 确保关联图谱面板能正常打开和关闭
- 优化按钮的 loading 状态和反馈
- 确保浮动滚动按钮正常工作
- 添加完善的错误处理和用户提示

## Capabilities

### New Capabilities
- `detail-page-interaction-fix`: 修复详情页所有交互问题，确保按钮和面板功能正常

### Modified Capabilities
- `content-viewer`: 完善详情页的视图功能，确保所有按钮和面板正常工作

## Impact

- **Affected Code**:
  - `frontend/src/pages/contents/detail.tsx`: 详情页主组件
  - `frontend/src/api/content.ts`: 内容 API 接口
  - `frontend/src/components/`: 相关子组件（PDFViewer、VideoPlayer 等）
  
- **Affected APIs**:
  - `/api/ai/summarize`
  - `/api/ai/related/:id`
  - `/api/ai/quiz`
  - `/api/annotations`
  
- **No breaking changes expected - this is a bug fix**
