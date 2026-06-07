type NeonButtonProps = {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit" | "reset";
};

const sizeClasses: Record<NonNullable<NeonButtonProps["size"]>, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3 text-sm",
  lg: "px-6 py-3 text-base",
};

export function NeonButton({
  children,
  size = "md",
  className = "",
  type = "button",
}: NeonButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-neon-purple bg-neon-purple text-white shadow-[0_0_30px_rgba(168,85,247,0.35)] transition hover:bg-neon-purple/90 ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}
