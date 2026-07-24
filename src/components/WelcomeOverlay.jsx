import { Users, CalendarCheck, Trophy, TrendingUp } from 'lucide-react';

export default function WelcomeOverlay({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[80] flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <span className="text-3xl">🏀</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">Welcome to CoachPad</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">
            We've set up some starter content so the app feels alive straight away.
          </p>
        </div>

        {/* What's been created */}
        <div className="space-y-3 mb-6">
          <DemoItem icon={<Users size={16} className="text-blue-600" />} bg="bg-blue-50"
            title="Demo Team & 2 Players"
            desc="Alex Carter and Mia Johnson are ready to explore player development." />

          <DemoItem icon={<CalendarCheck size={16} className="text-green-600" />} bg="bg-green-50"
            title="2 Training Sessions"
            desc="Private sessions with real goals, results and coach observations." />

          <DemoItem icon={<Trophy size={16} className="text-amber-600" />} bg="bg-amber-50"
            title="3 Game Results"
            desc="Realistic game stats so your analytics dashboard shows real insights." />

          <DemoItem icon={<TrendingUp size={16} className="text-purple-600" />} bg="bg-purple-50"
            title="Player Progress Tracking"
            desc="Tap a player to see their development story — charts, trends, notes." />
        </div>

        <p className="text-xs text-slate-400 text-center mb-4">
          All demo content is labelled <span className="font-semibold">Starter Demo</span>. Edit, duplicate, or delete anything.
        </p>

        <button
          onClick={onClose}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl transition-all text-sm shadow-lg shadow-blue-200"
        >
          Let me explore →
        </button>
      </div>
    </div>
  );
}

function DemoItem({ icon, bg, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}