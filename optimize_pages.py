#!/usr/bin/env python3
"""
批量优化 moyuan 项目前端页面样式
将所有页面中的按钮、输入框、卡片等组件统一为 taste-design 设计系统
"""

import re
import os

def fix_buttons_and_inputs(content):
    """修复按钮和输入框样式"""
    
    # 修复主要按钮：bg-[var(--accent)] text-white → taste-btn-primary
    content = re.sub(
        r'className="([^"]*?)bg-\[var\(--accent\)\]\s*text-white([^"]*?)"',
        r'className="\1taste-btn-primary\2"',
        content
    )
    
    # 修复次要按钮：bg-[var(--bg-secondary)] → taste-btn-secondary
    content = re.sub(
        r'className="([^"]*?)bg-\[var\(--bg-secondary\)\]([^"]*?)"',
        r'className="\1taste-btn-secondary\2"',
        content
    )
    
    # 修复幽灵按钮：hover:bg-[var(--bg-secondary)] → taste-btn-ghost
    content = re.sub(
        r'className="([^"]*?)hover:bg-\[var\(--bg-secondary\)\]([^"]*?)"',
        r'className="\1taste-btn-ghost\2"',
        content
    )
    
    # 修复输入框：border border-zinc-300 → taste-input
    content = re.sub(
        r'className="([^"]*?)border\s+border-zinc-\d+(?:-[a-z]+)?\s+rounded-lg\s+bg-\[var\(--bg-card\)\]([^"]*?)"',
        r'className="\1taste-input\2"',
        content
    )
    
    return content

def fix_cards(content):
    """修复卡片样式"""
    
    # 修复卡片容器：border border-[var(--border-subtle)] rounded-xl → taste-card
    content = re.sub(
        r'className="([^"]*?)border\s+border-\[var\(--border-subtle\)\]\s+rounded-xl([^"]*?)"',
        r'className="\1taste-card\2"',
        content
    )
    
    return content

def fix_empty_states(content):
    """修复空状态"""
    
    # 修复空状态容器
    content = re.sub(
        r'<div className="text-center py-(\d+)">\s*<div',
        r'<div className="taste-card py-\1">\n            <div',
        content
    )
    
    return content

def optimize_page(file_path):
    """优化单个页面"""
    print(f"处理: {os.path.basename(file_path)}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 应用优化
    content = fix_buttons_and_inputs(content)
    content = fix_cards(content)
    content = fix_empty_states(content)
    
    # 添加页面进入动画
    content = re.sub(
        r'return \(\s*<div className="max-w-(\w+) mx-auto',
        r'return (\n    <div className="taste-page-enter max-w-\1 mx-auto',
        content
    )
    
    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✓ 已优化")
    else:
        print(f"  - 无需优化")

def main():
    pages_dir = r"F:\PycharmProjects\moyuan\frontend\src\pages"
    
    # 需要优化的页面
    pages = [
        "brains/index.tsx",
        "categories/index.tsx", 
        "collections/index.tsx",
        "favorites/index.tsx",
        "recycle/index.tsx",
        "search/index.tsx",
        "settings/index.tsx",
        "tags/index.tsx",
        "backup/index.tsx",
        "contents/detail.tsx",
    ]
    
    print("=== 开始批量优化页面 ===")
    for page in pages:
        file_path = os.path.join(pages_dir, page)
        if os.path.exists(file_path):
            optimize_page(file_path)
        else:
            print(f"跳过（文件不存在）: {page}")
    
    print("\n=== 优化完成 ===")

if __name__ == "__main__":
    main()