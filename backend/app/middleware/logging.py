"""请求日志中间件

记录每个 API 请求的详情，包括请求方法、路径、状态码和耗时。
"""

import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logging import get_logger


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件：记录每个 API 请求的详情"""
    
    async def dispatch(self, request: Request, call_next):
        logger = get_logger("http")
        start_time = time.time()
        
        # 获取请求ID（由 RequestIdMiddleware 设置到 scope）
        request_id = request.scope.get("request_id", "-")
        
        try:
            # 记录请求开始（直接在消息中包含request_id）
            method = request.method
            path = request.url.path
            logger.info(f"[{request_id}] 请求开始 - {method} {path}")
            
            response = await call_next(request)
            process_time = (time.time() - start_time) * 1000
            status_code = response.status_code
            
            # 记录请求完成（直接在消息中包含request_id）
            logger.info(f"[{request_id}] 请求完成 - {method} {path} - 状态: {status_code} - 耗时: {process_time:.2f}ms")
            return response
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(f"[{request_id}] 请求异常 - {method} {path} - 耗时: {process_time:.2f}ms - 错误: {str(e)}", exc_info=True)
            raise
