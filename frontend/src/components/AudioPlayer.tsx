import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";

interface AudioPlayerProps {
  src: string;
  title?: string;
  onTimeUpdate?: (current: number) => void;
  initialTime?: number;
}

export default function AudioPlayer({ src, title, onTimeUpdate, initialTime }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(initialTime || 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const progressPct = duration > 0 ? (current / duration) * 100 : 0;

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(t, a.duration || 0));
    setCurrent(a.currentTime);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  
  // 设置初始时间
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || initialTime == null) return;
    
    const handleLoadedMetadata = () => {
      if (initialTime >= 0 && initialTime <= audio.duration) {
        audio.currentTime = initialTime;
        setCurrent(initialTime);
      }
    };
    
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [initialTime]);

  return (
    <div className="w-full bg-[var(--bg-card)] rounded-xl p-4 shadow-[var(--shadow-lg)]">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setCurrent(a.currentTime);
          onTimeUpdate?.(a.currentTime);
        }}
        onLoadedMetadata={(e) => setDuration((e.currentTarget as HTMLAudioElement).duration)}
        onEnded={() => setPlaying(false)}
      />

      {/* Waveform placeholder */}
      <div className="flex items-center justify-center h-20 mb-3 bg-[var(--bg-elevated)]/60 rounded-lg overflow-hidden">
        <div className="flex items-center gap-[2px] h-12 px-4">
          {Array.from({ length: 40 }, (_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-[var(--accent)]/60"
              style={{ height: `${Math.random() * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button onClick={() => seek(current - 5)} className="text-[var(--text-muted)] hover:text-[var(--text-inverse)]">
          <SkipBack className="w-4 h-4" />
        </button>

        <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 rounded-full text-white">
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        <button onClick={() => seek(current + 5)} className="text-[var(--text-muted)] hover:text-[var(--text-inverse)]">
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Progress */}
        <div
          className="flex-1 relative h-5 flex items-center cursor-pointer"
          onClick={(e) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * duration);
          }}
        >
          <div className="w-full h-1 bg-[var(--border-subtle)] rounded-full">
            <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
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
          className="w-14 accent-[var(--accent)]"
        />
      </div>

      {title && (
        <p className="mt-2 text-xs text-[var(--text-muted)] truncate">{title}</p>
      )}
    </div>
  );
}
