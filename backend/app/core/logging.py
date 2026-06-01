"""
墨渊日志配置模块

配置支持：
- 控制台输出（INFO 级别以上）
- 文件输出（DEBUG 级别以上，按天滚动）
- 日志格式包含时间、级别、模块、消息

使用方式：
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("消息")
"""

import logging
import sys
from pathlib import Path
from logging.handlers import TimedRotatingFileHandler
from datetime import datetime


def setup_logging(log_dir: str = "../data/logs", debug: bool = False):
    """
    配置日志系统

    Args:
        log_dir: 日志文件存储目录
        debug: 是否开启调试模式（DEBUG 级别）
    """
    # 创建日志目录
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    # 日志格式
    log_format = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 根 logger 配置
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if debug else logging.INFO)

    # 清除已有的 handlers（避免重复添加）
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # ========================================
    # 1. 控制台输出 handler
    # ========================================
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(log_format)
    root_logger.addHandler(console_handler)

    # ========================================
    # 2. 文件输出 handler - 主日志（按天滚动）
    # ========================================
    main_log_file = log_path / "moyuan.log"
    file_handler = TimedRotatingFileHandler(
        main_log_file,
        when="midnight",  # 每天午夜滚动
        interval=1,
        backupCount=30,  # 保留 30 天日志
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(log_format)
    root_logger.addHandler(file_handler)

    # ========================================
    # 3. 文件输出 handler - 错误日志（单独记录）
    # ========================================
    error_log_file = log_path / "error.log"
    error_handler = TimedRotatingFileHandler(
        error_log_file,
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(log_format)
    root_logger.addHandler(error_handler)

    # 记录启动信息
    logger = get_logger(__name__)
    logger.info("=" * 60)
    logger.info(f"墨渊后端启动 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"日志目录: {log_path.resolve()}")
    logger.info(f"调试模式: {debug}")
    logger.info("=" * 60)


def get_logger(name: str) -> logging.Logger:
    """
    获取 logger 实例

    Args:
        name: 模块名称（通常用 __name__）

    Returns:
        logging.Logger: logger 实例
    """
    return logging.getLogger(name)
