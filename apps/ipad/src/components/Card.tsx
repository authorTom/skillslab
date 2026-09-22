export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
      {children}
    </div>
  );
}
