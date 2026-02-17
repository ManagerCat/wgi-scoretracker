// Card component - standard card layout with title, meta, and body text
export function Card({ title, meta, bodyText, className = "", children }) {
  return (
    <div
      className={`card relative bg-white p-3 rounded-lg border shadow-sm flex flex-col gap-0 ${className}`}
    >
      <div className="font-semibold">{title || "—"}</div>
      {meta && <div className="meta text-gray-600 text-sm">{meta}</div>}
      {bodyText && <div className="text-sm">{bodyText}</div>}
      {children}
    </div>
  );
}
