export const INPUT = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export const SUB_TABS_ALL = ['Overview', 'Add', 'Email', 'Reports', 'Utilities', 'Settings'];

export function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="border-b border-slate-200 bg-white px-2 flex overflow-x-auto shrink-0">
      {tabs.map(tab => (
        <button key={tab} onClick={() => onChange(tab)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}>
          {tab}
        </button>
      ))}
    </div>
  );
}

export function PlaceholderTab({ title, features = [] }) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-2xl">🚧</div>
        <div>
          <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
          <p className="text-sm text-slate-500 mt-1">Coming in a future update</p>
        </div>
        {features.length > 0 && (
          <div className="text-left border-t border-slate-100 pt-5 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Planned Features</p>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                {f}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">{label}</label>
      {children}
    </div>
  );
}