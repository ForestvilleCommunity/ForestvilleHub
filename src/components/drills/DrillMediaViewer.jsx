import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useWhiteboardState } from '@/components/whiteboard/useWhiteboardState';
import WhiteboardCanvas from '@/components/whiteboard/WhiteboardCanvas';

function parseExtra(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      // Single URL stored as plain string
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
}

export default function DrillMediaViewer({ drill }) {
  const images = [drill.image_url, ...parseExtra(drill.extra_images)].filter(Boolean);
  const wb = useWhiteboardState(drill.drawing_data || null);
  const hasWhiteboard = Boolean(drill.drawing_data);
  const wbPhaseCount = hasWhiteboard ? wb.state.phases.length : 0;
  const totalSlides = images.length + wbPhaseCount;

  const [slideIdx, setSlideIdx] = useState(0);
  const touchStart = useRef(null);

  useEffect(() => {
    // Reset to first slide when drill changes
    setSlideIdx(0);
  }, [drill.id]);

  useEffect(() => {
    // Sync whiteboard phase when on a whiteboard slide
    if (hasWhiteboard && slideIdx >= images.length) {
      wb.goToPhase(slideIdx - images.length);
    }
  }, [slideIdx, images.length, hasWhiteboard]);

  if (totalSlides === 0) return null;

  const idx = Math.min(slideIdx, totalSlides - 1);
  const isImage = idx < images.length;
  const phaseObj = !isImage ? wb.state.phases[idx - images.length] : null;
  const phaseLabel = isImage
    ? (totalSlides > 1 ? `Diagram ${idx + 1}` : 'Diagram')
    : (phaseObj?.title || `Phase ${idx - images.length + 1}`);
  const phaseDesc = phaseObj?.description || '';

  const prev = () => setSlideIdx(i => Math.max(0, i - 1));
  const next = () => setSlideIdx(i => Math.min(totalSlides - 1, i + 1));

  const onTouchStart = e => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = e => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();
    else prev();
  };

  return (
    <div className="px-5 py-4 border-b border-slate-100">
      {/* Label + counter */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{phaseLabel}</p>
        {totalSlides > 1 && (
          <span className="text-xs text-slate-400">{idx + 1} / {totalSlides}</span>
        )}
      </div>

      {/* Slide */}
      <div
        className="relative rounded-xl overflow-hidden select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {isImage ? (
          <div className="bg-white flex items-center justify-center" style={{ minHeight: 180 }}>
            <img
              key={images[idx]}
              src={images[idx]}
              alt={phaseLabel}
              className="w-full h-auto block"
              style={{ maxHeight: 320, objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div className="bg-slate-800" style={{ height: 280 }}>
            <div className="pointer-events-none w-full h-full">
              <WhiteboardCanvas wb={wb} selectedTool={null} onToolDone={() => {}} />
            </div>
          </div>
        )}

        {/* Arrow navigation */}
        {totalSlides > 1 && (
          <>
            <button
              onClick={prev}
              disabled={idx === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-md disabled:opacity-20 hover:bg-white transition-all z-10"
              aria-label="Previous"
            >
              <ChevronLeft size={18} className="text-slate-700" />
            </button>
            <button
              onClick={next}
              disabled={idx >= totalSlides - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-md disabled:opacity-20 hover:bg-white transition-all z-10"
              aria-label="Next"
            >
              <ChevronRight size={18} className="text-slate-700" />
            </button>
          </>
        )}
      </div>

      {/* Phase description */}
      {!isImage && phaseDesc && (
        <p className="text-xs text-slate-500 mt-2 px-1 leading-relaxed">{phaseDesc}</p>
      )}

      {/* Dot navigation */}
      {totalSlides > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5 flex-wrap">
          {Array.from({ length: totalSlides }, (_, i) => (
            <button
              key={i}
              onClick={() => setSlideIdx(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`rounded-full transition-all ${
                i === idx
                  ? 'w-4 h-2 bg-blue-600'
                  : i < images.length
                  ? 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
                  : 'w-2 h-2 bg-blue-200 hover:bg-blue-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}