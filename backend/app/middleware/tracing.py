"""请求追踪中间件

为每个请求生成唯一的 Request ID，并将其添加到日志中，
方便追踪和排查问题。
"""

import time
import uuid
from app.core.logging import get_logger


class RequestIdMiddleware:
    """为每个请求添加唯一的 Request ID 并记录日志"""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        start_time = time.time()
        
        # 从请求头获取或生成请求ID
        headers = dict(scope.get("headers", []))
        request_id = headers.get(b"x-request-id", str(uuid.uuid4()).encode()).decode()
        
        # 将请求ID存入scope
        scope["request_id"] = request_id
        
        # 提取请求信息
        method = scope.get("method", "UNKNOWN")
        path = scope.get("path", "/")
        query_string = scope.get("query_string", b"").decode()
        full_path = f"{path}?{query_string}" if query_string else path
        
        logger = get_logger("http")
        logger.info(f"[{request_id}] 请求开始 - {method} {full_path}")
        
        original_send = send
        
        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = message.get("headers", []) or []
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await original_send(message)
        
        try:
            await self.app(scope, receive, send_with_headers)
            process_time = (time.time() - start_time) * 1000
            logger.info(f"[{request_id}] 请求完成 - {method} {full_path} - 耗时: {process_time:.2f}ms")
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(f"[{request_id}] 请求异常 - {method} {full_path} - 耗时: {process_time:.2f}ms - 错误: {str(e)}", exc_info=True)
            raise