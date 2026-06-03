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
  ScrollText,
} from "lucide-react";
import { useTheme } from "../lib/theme";
import { useStyleTheme, type StyleTheme } from "../lib/style-theme";
import { sidebarCopy, useCopy } from "../lib/copywriting";

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

const STYLE_LABELS: Record<StyleTheme, string> = {
  daoist: "道",
  normal: "常",
  anime: "萌",
};

const STYLE_CYCLE: StyleTheme[] = ["daoist", "normal", "anime"];

export default function Sidebar() {
  const { resolved, setTheme } = useTheme();
  const { styleTheme, setStyleTheme } = useStyleTheme();
  const s = useCopy(sidebarCopy);

  const toggleTheme = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  const cycleStyle = () => {
    const idx = STYLE_CYCLE.indexOf(styleTheme);
    const next = STYLE_CYCLE[(idx + 1) % STYLE_CYCLE.length];
    setStyleTheme(next);
  };

  return (
    <aside className="dao-sidebar dao-bagua-border">
      <div className="dao-sidebar-content">
        {/* 太极八卦装饰 */}
        <div className="flex justify-center mb-4">
          <TaijiDecor />
        </div>

        {/* Logo */}
        <Link to="/" className="dao-sidebar-logo">
          <div className="dao-sidebar-logo-icon">墨</div>
          <div className="dao-sidebar-logo-text">
            <span className="dao-sidebar-logo-title">{s.logoTitle}</span>
            <span className="dao-sidebar-logo-subtitle">{s.logoSubtitle}</span>
          </div>
        </Link>

        {/* 道藏模块 - 乾位 */}
        <div className="dao-sidebar-section">
          <span className="dao-sidebar-section-title">{s.sectionDaoCang}</span>
          <SidebarLink to="/search" icon={<Search className="w-4 h-4" />} label={s.search} tooltip={s.searchTip} />
          <SidebarLink to="/contents" icon={<BookOpen className="w-4 h-4" />} label={s.contents} tooltip={s.contentsTip} />
          <SidebarLink to="/notes" icon={<FileText className="w-4 h-4" />} label={s.notes} tooltip={s.notesTip} />
          <SidebarLink to="/tags" icon={<Tags className="w-4 h-4" />} label={s.tags} tooltip={s.tagsTip} />
          <SidebarLink to="/categories" icon={<FolderTree className="w-4 h-4" />} label={s.categories} tooltip={s.categoriesTip} />
          <SidebarLink to="/favorites" icon={<Bookmark className="w-4 h-4" />} label={s.favorites} tooltip={s.favoritesTip} />
          <SidebarLink to="/collections" icon={<FolderOpen className="w-4 h-4" />} label={s.collections} tooltip={s.collectionsTip} />
        </div>

        {/* 丹室模块 - 坤位 */}
        <div className="dao-sidebar-section">
          <span className="dao-sidebar-section-title">{s.sectionDanShi}</span>
          <SidebarLink to="/brains" icon={<Brain className="w-4 h-4" />} label={s.brains} tooltip={s.brainsTip} />
          <SidebarLink to="/analytics" icon={<BarChart3 className="w-4 h-4" />} label={s.analytics} tooltip={s.analyticsTip} />
          <SidebarLink to="/logs" icon={<ScrollText className="w-4 h-4" />} label={s.logs} tooltip={s.logsTip} />
          <SidebarLink to="/backup" icon={<HardDrive className="w-4 h-4" />} label={s.backup} tooltip={s.backupTip} />
        </div>

        <div className="dao-sidebar-spacer" />

        {/* 玄台模块 - 中位 */}
        <div className="dao-sidebar-section">
          <span className="dao-sidebar-section-title">{s.sectionXuanTai}</span>
          <SidebarLink to="/settings" icon={<Settings className="w-4 h-4" />} label={s.settings} tooltip={s.settingsTip} />
          <SidebarLink to="/recycle" icon={<Trash2 className="w-4 h-4" />} label={s.recycle} tooltip={s.recycleTip} />
        </div>

        {/* 风格切换 */}
        <button onClick={cycleStyle} className="dao-sidebar-link" title={`当前：${STYLE_LABELS[styleTheme]}风格 · 点击切换`}>
          <span className="dao-sidebar-link-icon text-xs font-bold">{STYLE_LABELS[styleTheme]}</span>
          <span className="dao-sidebar-link-text">{STYLE_LABELS[styleTheme]}风格</span>
        </button>

        {/* 明暗切换 */}
        <button onClick={toggleTheme} className="dao-sidebar-link" title={resolved === "dark" ? "切换至阳间" : "切换至道"}>
          <span className="dao-sidebar-link-icon">
            {resolved === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </span>
          <span className="dao-sidebar-link-text">{resolved === "dark" ? "阳间" : "道"}</span>
        </button>
      </div>
    </aside>
  );
}
