import { Link, useLocation } from "react-router-dom";
import {
  Search,
  BookOpen,
  FileText,
  Tags,
  FolderTree,
  Bookmark,
  FolderOpen,
  BarChart3,
  Brain,
  HardDrive,
  Trash2,
  Settings,
  Sun,
  Moon,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "../lib/theme";

function TaijiDecor() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="opacity-20 dark:opacity-30"
    >
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1" className="text-jade" />
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="0.5" className="text-gold opacity-50" />
      <path
        d="M20 6C20 6 12 12 12 20C12 28 20 34 20 34C20 34 28 28 28 20C28 12 20 6 20 6Z"
        fill="currentColor"
        className="text-jade opacity-60"
      />
      <path
        d="M20 34C20 34 12 28 12 20C12 12 20 6 20 6C20 6 28 12 28 20C28 28 20 34 20 34Z"
        fill="currentColor"
        className="text-gold opacity-40"
      />
      <circle cx="20" cy="13" r="3" fill="currentColor" className="text-gold" />
      <circle cx="20" cy="27" r="3" fill="currentColor" className="text-jade" />
    </svg>
  );
}

interface SidebarLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
}

function SidebarLink({ to, icon, label, tooltip }: SidebarLinkProps) {
  const location = useLocation();
  const isActive = location.pathname === to || (to === "/contents" && location.pathname === "/");
  
  return (
    <Link
      to={to}
      className={`dao-sidebar-link ${isActive ? "active" : ""}`}
      title={tooltip}
    >
      <span className="dao-sidebar-link-icon">{icon}</span>
      <span className="dao-sidebar-link-text">{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const { resolved, setTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const toggleTheme = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  return (
    <aside className={`dao-sidebar dao-bagua-border ${expanded ? "expanded" : ""}`}>
      <div className="dao-sidebar-content">
        {/* 太极八卦装饰 */}
        <div className="flex justify-center mb-4">
          <TaijiDecor />
        </div>

        {/* Logo */}
        <Link to="/" className="dao-sidebar-logo">
          <div className="dao-sidebar-logo-icon">墨</div>
          <div className="dao-sidebar-logo-text">
            <span className="dao-sidebar-logo-title">墨渊</span>
            <span className="dao-sidebar-logo-subtitle">Moyuan</span>
          </div>
        </Link>

        {/* 道藏模块 - 乾位 */}
        <div className="dao-sidebar-section">
          <span className="dao-sidebar-section-title">道藏</span>
          <SidebarLink 
            to="/search" 
            icon={<Search className="w-4 h-4" />} 
            label="问玄"
            tooltip="搜索"
          />
          <SidebarLink 
            to="/contents" 
            icon={<BookOpen className="w-4 h-4" />} 
            label="道藏"
            tooltip="知识库"
          />
          <SidebarLink 
            to="/notes" 
            icon={<FileText className="w-4 h-4" />} 
            label="墨宝"
            tooltip="笔记"
          />
          <SidebarLink 
            to="/tags" 
            icon={<Tags className="w-4 h-4" />} 
            label="符印"
            tooltip="标签"
          />
          <SidebarLink 
            to="/categories" 
            icon={<FolderTree className="w-4 h-4" />} 
            label="坤舆"
            tooltip="分类"
          />
          <SidebarLink 
            to="/favorites" 
            icon={<Bookmark className="w-4 h-4" />} 
            label="珍藏"
            tooltip="收藏"
          />
          <SidebarLink 
            to="/collections" 
            icon={<FolderOpen className="w-4 h-4" />} 
            label="藏经"
            tooltip="合集"
          />
        </div>

        {/* 丹室模块 - 坤位 */}
        <div className="dao-sidebar-section">
          <span className="dao-sidebar-section-title">丹室</span>
          <SidebarLink 
            to="/brains" 
            icon={<Brain className="w-4 h-4" />} 
            label="丹室"
            tooltip="工作区"
          />
          <SidebarLink 
            to="/analytics" 
            icon={<BarChart3 className="w-4 h-4" />} 
            label="卦象"
            tooltip="统计"
          />
          <SidebarLink 
            to="/backup" 
            icon={<HardDrive className="w-4 h-4" />} 
            label="封魔"
            tooltip="备份"
          />
        </div>

        <div className="dao-sidebar-spacer" />

        {/* 玄台模块 - 中位 */}
        <div className="dao-sidebar-section">
          <span className="dao-sidebar-section-title">玄台</span>
          <SidebarLink 
            to="/settings" 
            icon={<Settings className="w-4 h-4" />} 
            label="玄台"
            tooltip="设置"
          />
          <SidebarLink 
            to="/recycle" 
            icon={<Trash2 className="w-4 h-4" />} 
            label="归墟"
            tooltip="回收站"
          />
        </div>

        {/* 主题切换 */}
        <button
          onClick={toggleTheme}
          className="dao-sidebar-link"
          title={resolved === "dark" ? "切换至阳间" : "切换至道"}
        >
          <span className="dao-sidebar-link-icon">
            {resolved === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </span>
          <span className="dao-sidebar-link-text">
            {resolved === "dark" ? "阳间" : "道"}
          </span>
        </button>

        {/* 侧边栏展开/收起 */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="dao-sidebar-link"
          title={expanded ? "收起导航" : "展开导航"}
        >
          <span className="dao-sidebar-link-icon">
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${expanded ? "rotate-0" : "rotate-180"}`} />
          </span>
          <span className="dao-sidebar-link-text">
            {expanded ? "收起" : "展开"}
          </span>
        </button>
      </div>
    </aside>
  );
}
