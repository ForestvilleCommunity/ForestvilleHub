import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function parseExtra(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

export default function DrillImageGallery({ drill }) {
  const images = [drill.image_url, ...parseExtra(drill.extra_images)].filter(Boolean);
  const [idx, setIdx] = useState(0);
  const touchStart = useRef(null);

  if (images.length === 0) return null;

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(images.length - 1, i + 1));

  return (
    <div className="px-5 py-4 border-b border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Diagrams</p>
        {images.length > 1 && (
          <span className="text-xs text-slate-400 font-medium">{idx + 1} / {images.length}</span>
        )}
      </div>

      <div
        className="relative rounded-xl overflow-hidden bg-slate-100 select-none"
        onTouchStart={e => { touchStart.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchStart.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) < 40) return;
          if (dx < 0) next();
          else prev();
        }}
      >
        <img
          src={images[idx]}
          alt={`Diagram ${idx + 1}`}
          className="w-full object-contain bg-white"
          style={{ maxHeight: 280 }}
        />
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              disabled={idx === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow disabled:opacity-20 hover:bg-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={next}
              disabled={idx >= images.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow disabled:opacity-20 hover:bg-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-blue-600' : 'bg-slate-300 hover:bg-slate-400'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}