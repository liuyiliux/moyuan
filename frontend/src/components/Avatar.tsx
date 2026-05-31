export interface AvatarProps {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ name, src, size = "md", className = "" }: AvatarProps) {
  const sizeStyles = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const initial = name 
    ? name.charAt(0).toUpperCase() 
    : "?";

  return (
    <div 
      className={`flex items-center justify-center rounded-full bg-jade text-text-inverse font-medium ${sizeStyles[size]} ${className}`}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

export default Avatar;
