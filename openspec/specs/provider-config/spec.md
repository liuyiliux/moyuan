## ADDED Requirements

### Requirement: AI 模型 API 配置管理
系统 SHALL 支持用户在设置界面配置多个 AI 服务提供商（兼容 OpenAI API 格式），每个提供商包含名称、API Base URL、API Key、默认请求参数，并可指定不同功能（摘要/嵌入/题库）使用的默认模型。

#### Scenario: 新增 AI 服务提供商
- **WHEN** 用户填写提供商名称、API URL 和 Key 后保存
- **THEN** 提供商被添加到提供商列表，可在各功能模块中选用

#### Scenario: 为不同功能指定模型
- **WHEN** 用户在设置中为「摘要生成」功能指定某提供商的某个模型
- **THEN** 后续所有摘要生成请求使用该模型，嵌入功能使用其独立配置的模型

#### Scenario: 测试 API 连接
- **WHEN** 用户点击提供商配置旁的「测试连接」
- **THEN** 系统发送探测请求，3 秒内返回连接成功/失败结果，失败时展示错误信息

### Requirement: OCR 服务配置
系统 SHALL 支持配置用户自有的 OCR 服务提供商（兼容 OpenAI Vision Chat API 或自定义 OpenAI-compatible API），OCR 调用仅使用用户在设置中配置并绑定的 Provider，不内置特定云厂商专用逻辑。

#### Scenario: 配置 OCR Provider
- **WHEN** 用户填写 OCR Provider 的 Base URL、API Key 并为「OCR」功能绑定模型后保存
- **THEN** 后续图片上传的 OCR 处理通过该已配置 Provider 执行；未配置或未绑定时不调用外部 OCR API

### Requirement: 语音转写服务配置
系统 SHALL 支持配置 Whisper API（OpenAI 或自托管）与本地 faster-whisper 作为语音转写服务，可选择语言和模型规格。

#### Scenario: 切换转写服务
- **WHEN** 用户从「OpenAI Whisper API」切换到「本地 faster-whisper」并指定模型路径
- **THEN** 后续所有音视频转写任务使用本地模型，不调用外部 API

### Requirement: API Keys 安全存储
系统 SHALL 将 API Keys 以加密方式存储（非明文），在配置界面以掩码显示，仅在运行时解密使用。

#### Scenario: API Key 掩码显示
- **WHEN** 用户打开提供商配置页面
- **THEN** API Key 字段显示为 `sk-***...***` 格式掩码，需点击「显示」才能查看完整值
