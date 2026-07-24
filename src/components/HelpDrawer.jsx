import { useState } from 'react';
import { X, HelpCircle, Lightbulb, RotateCcw, BookOpen, MessageCircle } from 'lucide-react';

export default function HelpDrawer() {
  const [open, setOpen] = useState(false);

  const resetTips = () => {
    Object.keys(localStorage).filter(k => k.startsWith('cp_help_')).forEach(k => localStorage.removeItem(k));
    setOpen(false);
    window.location.reload();
  };

  const restartOnboarding = () => {
    localStorage.setItem('cp_show_onboarding', '1');
    setOpen(false);
    window.location.href = '/';
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[100] w-12 h-12 bg-slate-900 hover:bg-slate-700 active:scale-95 text-white rounded-full shadow-2xl flex items-center justify-center transition-all"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Help"
      >
        <HelpCircle size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)}>
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-slate-700" />
                <h3 className="font-bold text-slate-900">Help and Support</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-1">
              <MenuItem icon={<Lightbulb size={18} className="text-amber-500" />} label="Show tips again" sub="Restore all page tip bubbles" onClick={resetTips} />
              <MenuItem icon={<RotateCcw size={18} className="text-blue-500" />} label="Restart onboarding" sub="Redo the setup walkthrough" onClick={restartOnboarding} />
              <MenuItem icon={<BookOpen size={18} className="text-purple-500" />} label="What is CoachPad?" sub="Platform overview and features" onClick={() => setOpen(false)} />
              <MenuItem icon={<MessageCircle size={18} className="text-green-500" />} label="Contact support" sub="Get help from our team" onClick={() => setOpen(false)} />
            </div>

            <div className="mx-4 mb-2 px-4 py-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-2xl flex items-center gap-2">
              <span className="text-base">✨</span>
              <div>
                <p className="text-xs font-bold text-purple-800">AI Coach Assistant — Coming Soon</p>
                <p className="text-xs text-purple-500 mt-0.5">Get personalized coaching insights powered by AI.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
    >
      <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}