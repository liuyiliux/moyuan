import { useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

interface ToastProps {
  type: "success" | "error" | "info";
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ type, message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgMap = {
    success: "bg-[var(--bg-card)] border-[var(--jade)]/30 dark:border-[var(--jade)]/50",
    error: "bg-[var(--bg-card)] border-red-500/30 dark:border-red-500/50",
    info: "bg-[var(--bg-card)] border-[var(--gold)]/30 dark:border-[var(--gold)]/50",
  };

  const textMap = {
    success: "text-[var(--jade)]",
    error: "text-red-500",
    info: "text-[var(--gold)]",
  };

  const IconMap = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  };

  const Icon = IconMap[type];

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md dao-toast-enter ${bgMap[type]}`}
      role="alert"
    >
      <Icon className={`w-4 h-4 ${textMap[type]} flex-shrink-0`} />
      <span className={`text-sm font-medium ${textMap[type]}`}>{message}</span>
      <button
        onClick={onClose}
        className={`ml-2 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${textMap[type]}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
