# 墨渊 (Moyuan) 日志系统

## 概述

墨渊的日志系统使用 Python 标准库的 `logging` 模块，提供了结构化的日志记录，同时输出到控制台和文件。

## 日志配置

### 环境变量

在 `backend/.env` 文件中配置：

```env
# 日志存储目录
LOG_DIR=../data/logs

# 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
LOG_LEVEL=INFO
```

### 日志文件

日志文件会自动创建在 `LOG_DIR` 指定的目录下：

| 文件 | 说明 |
|------|------|
| `moyuan.log` | 主日志文件，包含所有级别（DEBUG 及以上）的日志 |
| `error.log` | 错误日志文件，只包含 ERROR 及以上级别的日志 |
| `moyuan.log.2024-06-01` | 按天滚动的历史日志 |

### 日志格式

每条日志包含以下信息：

```
时间 - 模块名 - 日志级别 - 消息内容
```

示例：
```
2024-06-01 10:30:45 - app.core.logging - INFO - ============================================================
2024-06-01 10:30:45 - app.core.logging - INFO - 墨渊后端启动 - 2024-06-01 10:30:45
2024-06-01 10:30:45 - app.core.logging - INFO - 日志目录: F:\PycharmProjects\moyuan\data\logs
2024-06-01 10:30:45 - app.core.logging - INFO - 调试模式: False
2024-06-01 10:30:45 - app.core.logging - INFO - ============================================================
```

## 日志级别

| 级别 | 说明 | 输出位置 |
|------|------|---------|
| `DEBUG` | 详细的调试信息 | 文件 |
| `INFO` | 一般信息（程序正常运行） | 控制台 + 文件 |
| `WARNING` | 警告信息 | 控制台 + 文件 |
| `ERROR` | 错误信息 | 控制台 + 文件 + `error.log` |
| `CRITICAL` | 严重错误 | 控制台 + 文件 + `error.log` |

## 使用方式

### 在代码中使用日志

```python
from app.core.logging import get_logger

logger = get_logger(__name__)

logger.debug("调试信息")
logger.info("一般信息")
logger.warning("警告信息")
logger.error("错误信息")
logger.critical("严重错误")
```

### 记录异常

```python
try:
    # 可能出错的代码
    raise ValueError("测试错误")
except Exception as e:
    logger.error(f"发生错误: {e}", exc_info=True)  # exc_info=True 会记录堆栈跟踪
    # 或者简写
    logger.exception(f"发生错误: {e}")
```

## 已添加日志的模块

### 1. 主入口 (`app/main.py`)

- 服务启动/关闭日志
- HTTP 请求日志（中间件）
- 请求耗时统计

### 2. 嵌入服务 (`app/services/embedding.py`)

- API 调用开始/结束
- 批量处理进度
- 成功/失败统计
- 错误详情

### 3. 内容处理管道 (`app/services/process.py`)

- 内容处理开始/结束
- 分块进度
- 嵌入处理统计
- 错误处理

## 日志内容示例

### 服务启动

```
2024-06-01 10:30:45 - app.core.logging - INFO - ============================================================
2024-06-01 10:30:45 - app.core.logging - INFO - 墨渊后端启动 - 2024-06-01 10:30:45
2024-06-01 10:30:45 - app.core.logging - INFO - 日志目录: F:\PycharmProjects\moyuan\data\logs
2024-06-01 10:30:45 - app.core.logging - INFO - 调试模式: False
2024-06-01 10:30:45 - app.core.logging - INFO - ============================================================
2024-06-01 10:30:45 - app.main - INFO - 启动生命周期开始...
2024-06-01 10:30:45 - app.main - INFO - 数据库表初始化完成
2024-06-01 10:30:45 - app.main - INFO - 后台任务队列 Worker 已启动
```

### HTTP 请求

```
2024-06-01 10:31:00 - http - INFO - 请求开始 - GET /api/health
2024-06-01 10:31:00 - http - INFO - 请求完成 - GET /api/health - 状态: 200 - 耗时: 1.23ms
```

### 内容处理

```
2024-06-01 10:32:00 - app.services.process - INFO - 开始处理内容 - content_id=xxx, type=pdf, title=test.pdf
2024-06-01 10:32:01 - app.services.process - INFO - 处理嵌入向量 - content_id=xxx, 待处理 chunks=5
2024-06-01 10:32:01 - app.services.process - DEBUG - 文本 chunks 数量: 5
2024-06-01 10:32:01 - app.services.process - DEBUG - 处理文本批次 1/1 - 数量: 5
2024-06-01 10:32:02 - app.services.embedding - INFO - embed_texts 完成: 总数=5, 成功=5, 失败=0
2024-06-01 10:32:02 - app.services.process - INFO - 嵌入处理完成 - content_id=xxx, success=5, failed=0, total=5, skipped=0
2024-06-01 10:32:02 - app.services.process - INFO - 内容处理完成 - content_id=xxx, 耗时: 1500.50ms
```

### 嵌入 API 调用

```
2024-06-01 10:33:00 - app.services.embedding - DEBUG - 开始调用嵌入 API - 模型: BAAI/bge-m3, 输入数量: 5, base_url: https://api.siliconflow.cn/v1
2024-06-01 10:33:00 - app.services.embedding - DEBUG - 有效输入数量: 5 (已过滤空输入)
2024-06-01 10:33:00 - app.services.embedding - DEBUG - 处理批次 1/1 - 批量大小: 5
2024-06-01 10:33:00 - app.services.embedding - DEBUG - 批次 1 完成 - 获得 5 个嵌入向量
2024-06-01 10:33:01 - app.services.embedding - INFO - 嵌入 API 调用完成 - 模型: BAAI/bge-m3, 总输入: 5, 有效输入: 5, 耗时: 800.25ms
```

### 错误日志

```
2024-06-01 10:34:00 - app.services.embedding - ERROR - Embedding API error (model=xxx, status=400, code=20015): The parameter is invalid
2024-06-01 10:34:00 - app.services.process - ERROR - 内容处理失败 - content_id=xxx: Traceback (most recent call last):
  ...
```

## 分析日志

### 常见问题排查

1. **硅基流动 API 报错**
   - 检查模型名称是否正确
   - 确认 API Key 是否有效
   - 确认 batch size 不超过 64

2. **嵌入失败**
   - 检查 `provider_configs` 表中的配置
   - 确认 API Key 已正确加密存储
   - 检查网络连接

3. **性能问题**
   - 查看 API 调用耗时
   - 检查批量大小配置
   - 监控数据库查询速度

### 日志分析工具

可以使用任何文本编辑器或日志分析工具查看日志文件：

```bash
# PowerShell - 查看最近的错误
Get-Content ..\data\logs\error.log -Tail 50

# PowerShell - 搜索特定内容
Select-String -Path ..\data\logs\moyuan.log -Pattern "ERROR"

# 按日期筛选日志
Get-ChildItem ..\data\logs\ -Filter "moyuan.log.*" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

## 扩展指南

### 添加新模块的日志

在新模块中添加日志很简单：

```python
# 1. 导入
from app.core.logging import get_logger

# 2. 获取 logger
logger = get_logger(__name__)

# 3. 使用
logger.info("模块初始化完成")
```

### 添加性能监控

```python
import time

start_time = time.time()

# 执行操作
result = await some_operation()

elapsed = (time.time() - start_time) * 1000
logger.debug(f"操作完成，耗时: {elapsed:.2f}ms")
```

## 注意事项

1. **敏感信息**：不要在日志中记录 API Key、密码等敏感信息
2. **日志大小**：日志会按天滚动，保留最近 30 天的日志
3. **性能影响**：DEBUG 级别日志会降低性能，生产环境建议使用 INFO 级别
4. **磁盘空间**：定期检查日志目录占用空间，必要时清理旧日志
