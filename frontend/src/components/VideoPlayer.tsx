import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward,
} from "lucide-react";

interface SubtitleCue {
  start: number;   // seconds
  end: number;
  text: string;
}

interface VideoPlayerProps {
  src: string;
  subtitles?: unknown;
  onTimeUpdate?: (current: number) => void;
}

export default function VideoPlayer({ src, subtitles, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null);

  // 同步当前字幕
  useEffect(() => {
    const subs = subtitles as SubtitleCue[] | undefined;
    if (!subs || subs.length === 0) return;
    const cue = subs.find(c => current >= c.start && current < c.end) ?? null;
    setActiveCue(cue);
  }, [current, subtitles]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const onTimeUpdateNative = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    onTimeUpdate?.(v.currentTime);
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || 0));
    setCurrent(v.currentTime);
  };

  const skip = (dt: number) => seek(current + dt);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;

  // 键盘快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
    if (e.key === "ArrowLeft")  skip(-5);
    if (e.key === "ArrowRight") skip(5);
  }, [togglePlay, current]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // 根据文件扩展名推断 MIME 类型
  const getMimeType = (url: string): string => {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
    };
    return mimeMap[ext] || 'video/mp4';
  };

  const [videoError, setVideoError] = useState<string | null>(null);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.target as HTMLVideoElement;
    const err = video.error;
    let msg = '未知播放错误';
    if (err) {
      switch (err.code) {
        case err.MEDIA_ERR_ABORTED: msg = '播放已中止'; break;
        case err.MEDIA_ERR_NETWORK: msg = '网络错误，无法加载视频'; break;
        case err.MEDIA_ERR_DECODE: msg = '视频解码失败，格式可能不支持'; break;
        case err.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = '不支持的视频格式或无法加载视频文件'; break;
      }
    }
    console.error('Video error:', err);
    setVideoError(msg);
  };

  return (
    <div className="w-full bg-black rounded-xl overflow-hidden shadow-[var(--shadow-lg)]">
      {/* Video area */}
      <div className="relative aspect-video bg-black flex items-center justify-center group">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          onTimeUpdate={onTimeUpdateNative}
          onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={handleVideoError}
        >
          <source src={src} type={getMimeType(src)} />
          您的浏览器不支持播放此视频。
        </video>

        {/* 视频加载错误提示 */}
        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-[var(--text-inverse)] text-sm px-4 text-center">
            <div>
              <p className="text-red-400 mb-2">⚠️ 无法播放视频</p>
              <p>{videoError}</p>
              <p className="text-xs text-[var(--text-muted)] mt-2">文件路径: {src}</p>
            </div>
          </div>
        )}

        {/* 字幕 overlay */}
        {showSubtitles && activeCue && (
          <div className="absolute bottom-16 left-0 right-0 text-center pointer-events-none px-4">
            <span className="inline-block bg-black/70 text-[var(--text-inverse)] text-sm px-3 py-1 rounded-lg">
              {activeCue.text}
            </span>
          </div>
        )}

        {/* 中央播放/暂停按钮 */}
        {!playing && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-16 h-16 bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Play className="w-8 h-8" />
          </button>
        )}
      </div>

      {/* 字幕时间轴面板 */}
      {(subtitles as SubtitleCue[]) && (subtitles as SubtitleCue[]).length > 0 && (
        <div className="bg-[var(--bg-card)] border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-[var(--text-muted)]">字幕</span>
            <button
              onClick={() => setShowSubtitles(v => !v)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-inverse)]"
            >
              {showSubtitles ? "隐藏" : "显示"}
            </button>
          </div>
          <div className="max-h-36 overflow-y-auto px-3 pb-2 space-y-0.5">
            {(subtitles as SubtitleCue[]).map((cue, i) => {
              const isActive = activeCue === cue;
              return (
                <button
                  key={i}
                  onClick={() => seek(cue.start)}
                  className={`w-full text-left text-xs px-2 py-1 rounded flex gap-2 ${
                    isActive
                      ? "bg-[var(--accent)]/40 text-[var(--text-inverse)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <span className="shrink-0 text-[var(--text-muted)] w-12">{fmt(cue.start)}</span>
                  <span className="truncate">{cue.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-[var(--bg-card)] px-3 py-2 flex items-center gap-3">
        {/* Play/Pause */}
        <button onClick={togglePlay} className="text-[var(--text-inverse)] hover:text-[var(--accent-text)]">
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        {/* Skip */}
        <button onClick={() => skip(-5)} className="text-[var(--text-muted)] hover:text-[var(--text-inverse)]">
          <SkipBack className="w-4 h-4" />
        </button>
        <button onClick={() => skip(5)} className="text-[var(--text-muted)] hover:text-[var(--text-inverse)]">
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        <div className="flex-1 relative h-5 flex items-center group/progress cursor-pointer"
          onClick={(e) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * duration);
          }}
        >
          <div className="w-full h-1 bg-[var(--border-subtle)] rounded-full">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Time */}
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {fmt(current)} / {fmt(duration)}
        </span>

        {/* Volume */}
        <button onClick={() => setMuted(m => !m)} className="text-[var(--text-muted)] hover:text-[var(--text-inverse)]">
          {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range" min={0} max={1} step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
          className="w-16 accent-[var(--accent)]"
        />

        {/* Fullscreen */}
        <button
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (document.fullscreenElement) document.exitFullscreen();
            else el.requestFullscreen();
          }}
          className="text-[var(--text-muted)] hover:text-[var(--text-inverse)]"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
