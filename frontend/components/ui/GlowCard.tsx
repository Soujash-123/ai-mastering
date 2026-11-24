type GlowCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function GlowCard({ children, className = "" }: GlowCardProps) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/5 p-6 ${className}`}>
      {children}
    </div>
  );
}
