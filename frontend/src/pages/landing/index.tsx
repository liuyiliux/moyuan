import { Link } from "react-router-dom";
import { useTheme } from "../../lib/theme";
import {
  FolderOpen,
  Search,
  Zap,
  Rocket,
  ShieldCheck,
  Code2,
  Star,
  Moon,
  Sun,
  BookOpen,
  MessageCircle,
  Download,
} from "lucide-react";

export default function LandingPage() {
  const { resolved, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 antialiased transition-colors duration-300">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-2xl bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">墨</span>
            </div>
            <span className="font-semibold text-lg">墨渊</span>
            <span className="text-gray-400 dark:text-gray-500 text-sm">Moyuan</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">功能</a>
            <a href="#how-it-works" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">工作原理</a>
            <a href="#open-source" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">开源</a>
            <a href="#about" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">关于</a>
          </div>

          <div className="flex items-center gap-4">
            <a href="https://cnb.cool/yiliu/moyuan" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1">
              <Code2 className="w-4 h-4" />
              CNB
            </a>
            <Link to="/contents" className="text-sm bg-gray-900 dark:bg-white dark:text-gray-900 text-white px-4 py-2 rounded-xl hover:opacity-90 transition-opacity active:translate-y-px">
              开始使用
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-20 px-6 min-h-[100dvh] flex items-center">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left Content */}
            <div className="landing-fade-in-up">
              <div className="text-sm font-mono tracking-[0.18em] uppercase text-gray-500 dark:text-gray-400 mb-6">
                开源多模态知识库
              </div>

              <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-none mb-6">
                您的个人<br />
                <span className="text-emerald-500">知识管理中心</span>
              </h1>

              <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed max-w-[65ch] mb-8">
                墨渊帮助您统一存储、智能检索和高效管理文本、图片、视频等知识内容，完全开源免费。
              </p>

              <div className="flex flex-wrap gap-4">
                <Link to="/contents" className="bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-600 transition-colors active:translate-y-px">
                  免费开始
                </Link>
                <a href="https://cnb.cool/yiliu/moyuan" target="_blank" rel="noopener noreferrer" className="border border-gray-300 dark:border-gray-600 px-6 py-3 rounded-xl font-medium hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  CNB 星标
                </a>
              </div>
            </div>

            {/* Right Visual */}
            <div className="landing-fade-in-up landing-delay-100">
              <div className="rounded-2xl overflow-hidden shadow-2xl dark:shadow-gray-900/50">
                <img
                  src="https://picsum.photos/seed/moyuan-dashboard/800/600"
                  alt="墨渊知识库界面截图"
                  className="w-full h-auto"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section id="features" className="py-20 px-6 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-4">核心功能</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              墨渊提供全方位的个人知识管理解决方案
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
            {/* Large card */}
            <div className="md:col-span-3 feature-card bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-6">
                <FolderOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">多模态支持</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                支持文本、图片、音频、视频等多种格式，统一管理所有个人知识资源。自动识别文件类型，智能分类存储。
              </p>
            </div>

            {/* Medium card */}
            <div className="md:col-span-2 feature-card bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center mb-6">
                <Search className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">智能检索</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                基于AI的语义搜索，快速找到您需要的信息。
              </p>
            </div>

            {/* Accent card */}
            <div className="md:col-span-1 bg-gradient-to-br from-emerald-500 to-teal-600 p-8 rounded-2xl shadow-sm text-white flex flex-col justify-center transition-all duration-300 hover:scale-[1.02]">
              <Zap className="w-10 h-10 mb-4" />
              <h3 className="text-xl font-semibold mb-2">快速</h3>
              <p className="text-sm text-white/90 leading-relaxed">
                毫秒级响应，即时获取知识答案
              </p>
            </div>

            {/* Medium card */}
            <div className="md:col-span-2 feature-card bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center mb-6">
                <Rocket className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">快速部署</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                几分钟即可完成部署，支持本地和云服务器部署。
              </p>
            </div>

            {/* Medium card */}
            <div className="md:col-span-2 feature-card bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">安全可靠</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                数据本地存储，完全掌控您的隐私。开源透明，无任何跟踪。
              </p>
            </div>

            {/* Medium card */}
            <div className="md:col-span-2 feature-card bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mb-6">
                <Code2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">开源免费</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                完全开源，MIT协议。免费使用，无任何隐藏费用。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section - Timeline */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-4">工作原理</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              简单的三步流程，让您快速上手墨渊知识库
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-emerald-200 dark:bg-emerald-800" />

              {/* Step 1 */}
              <div className="relative flex gap-8 mb-12">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500 text-white text-2xl font-bold flex items-center justify-center z-10">
                  1
                </div>
                <div className="pt-4">
                  <h3 className="text-xl font-semibold mb-3">下载部署</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    从 CNB 克隆项目，按照文档快速部署到本地或云服务器。支持 Docker 一键部署。
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative flex gap-8 mb-12">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500 text-white text-2xl font-bold flex items-center justify-center z-10">
                  2
                </div>
                <div className="pt-4">
                  <h3 className="text-xl font-semibold mb-3">导入知识</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    上传您的文本、图片、音频、视频等知识内容。自动识别格式，智能分类存储。
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative flex gap-8">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500 text-white text-2xl font-bold flex items-center justify-center z-10">
                  3
                </div>
                <div className="pt-4">
                  <h3 className="text-xl font-semibold mb-3">智能检索</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    使用自然语言提问，AI 快速找到相关知识。支持多轮对话，深入理解您的需求。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section id="open-source" className="py-20 px-6 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-20 h-20 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-4xl font-bold flex items-center justify-center mx-auto mb-8">
            <Code2 className="w-10 h-10" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight mb-6">开源免费</h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-10 max-w-2xl mx-auto">
            墨渊是完全开源的个人知识库系统，基于 MIT 协议。您可以免费使用、修改和分发。
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="https://cnb.cool/yiliu/moyuan" target="_blank" rel="noopener noreferrer" className="bg-gray-900 dark:bg-white dark:text-gray-900 text-white px-8 py-4 rounded-xl font-medium text-lg hover:opacity-90 transition-opacity active:translate-y-px flex items-center gap-2">
              <Code2 className="w-5 h-5" />
              查看 CNB
            </a>
            <a href="#" className="border border-gray-300 dark:border-gray-600 px-8 py-4 rounded-xl font-medium text-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              阅读文档
            </a>
          </div>

          {/* CNB Stats */}
          <div className="mt-12 flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Star className="w-4 h-4 text-amber-400" />
              <span>1.2k CNB Stars</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Download className="w-4 h-4 text-emerald-500" />
              <span>500+ 下载</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Code2 className="w-4 h-4 text-purple-500" />
              <span>MIT 协议</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gray-900 dark:bg-gray-950 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-6">加入开发</h2>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            墨渊是完全开源的项目，欢迎贡献代码、提出建议或报告问题。
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="https://cnb.cool/yiliu/moyuan" target="_blank" rel="noopener noreferrer" className="bg-emerald-500 text-white px-8 py-4 rounded-xl font-medium text-lg hover:bg-emerald-600 transition-colors active:translate-y-px flex items-center gap-2">
              <Code2 className="w-5 h-5" />
              CNB 仓库
            </a>
            <a href="#" className="border border-gray-600 px-8 py-4 rounded-xl font-medium text-lg hover:border-gray-400 transition-colors flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              讨论区
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-2xl bg-emerald-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">墨</span>
              </div>
              <span className="font-semibold">墨渊</span>
              <span className="text-gray-400 dark:text-gray-500 text-sm">Moyuan</span>
            </div>

            <div className="flex gap-6">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">文档</a>
              <a href="https://cnb.cool/yiliu/moyuan" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">CNB</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">讨论</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">问题</a>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">&copy; 2026 墨渊 Moyuan. MIT 协议。</p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">MIT 协议</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">隐私</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Dark mode toggle */}
      <button
        onClick={toggleTheme}
        className="fixed bottom-4 right-4 w-12 h-12 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-50"
        aria-label="切换深色模式"
      >
        {resolved === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </div>
  );
}
