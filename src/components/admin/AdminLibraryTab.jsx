import { useState } from 'react';
import { Layers, Trophy } from 'lucide-react';
import AdminDrillsTab from './AdminDrillsTab';
import AdminChallengesTab from './AdminChallengesTab';

const SUB_TABS = [
  { id: 'drills',      label: 'Drill Library', icon: Layers },
  { id: 'challenges',  label: 'Challenges',    icon: Trophy },
];

export default function AdminLibraryTab({ onProfileClick, resetTrigger }) {
  const [sub, setSub] = useState('drills');

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="bg-white border-b border-slate-200 flex shrink-0">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSub(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              sub === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content — both stay mounted */}
      <div className={sub === 'drills'     ? 'contents' : 'hidden'}><AdminDrillsTab     resetTrigger={resetTrigger} /></div>
      <div className={sub === 'challenges' ? 'contents' : 'hidden'}><AdminChallengesTab onProfileClick={onProfileClick} resetTrigger={resetTrigger} /></div>
    </div>
  );
}
