export const INPUT = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-slate-900 text-base mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Label({ text, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{text}</p>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

export function Empty({ text }) {
  return <p className="text-center text-slate-400 py-12 text-sm">{text}</p>;
}

export function SaveRow({ onSave, onCancel, saving, disabled, extraBtn }) {
  return (
    <div className="flex gap-2 mt-5">
      <button onClick={onSave} disabled={saving || disabled}
        className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 hover:bg-blue-700 transition-colors">
        {saving ? 'Saving…' : 'Save'}
      </button>
      {extraBtn}
      <button onClick={onCancel} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
    </div>
  );
}