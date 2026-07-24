import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Numbered pagination with Previous / Next.
 * Props:
 *   page        number  — 0-indexed current page
 *   totalPages  number
 *   onPage      fn(page)
 */
export default function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  // Show at most 7 page buttons; collapse with ellipsis when there are more
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    // Always show first, last, current ±1, and fill with ellipsis
    const set = new Set([0, totalPages - 1, page, page - 1, page + 1].filter(p => p >= 0 && p < totalPages));
    const sorted = [...set].sort((a, b) => a - b);
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) pages.push('…');
      pages.push(p);
    });
  }

  const btn = 'w-8 h-8 rounded-lg text-sm font-semibold flex items-center justify-center transition-colors';

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className={`${btn} text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed`}>
        <ChevronLeft size={15} />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-sm">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`${btn} ${p === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {p + 1}
          </button>
        )
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className={`${btn} text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed`}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
