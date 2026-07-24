import { useState, useRef } from 'react';

/**
 * OptionsMenu (⋯) — uses fixed positioning so it escapes
 * overflow:hidden scroll containers inside profile panels.
 */
export default function OptionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  };

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 text-lg font-bold leading-none select-none"
        title="Options"
      >
        ···
      </button>

      {open && (
        <>
          {/* click-outside backdrop — above everything */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setOpen(false)}
          />
          {/* dropdown — above backdrop */}
          <div
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 min-w-[200px]"
          >
            {items.map((item, i) => {
              if (item.divider) return <div key={i} className="h-px bg-slate-100 my-1.5 mx-3" />;
              return (
                <button
                  key={i}
                  disabled={item.disabled}
                  onClick={() => { if (!item.disabled && item.action) { item.action(); } setOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors ${
                    item.disabled
                      ? 'text-slate-300 cursor-default'
                      : item.danger
                        ? 'text-red-500 hover:bg-red-50'
                        : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.disabled && (
                    <span className="text-xs text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded-full ml-2 font-medium">Soon</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}