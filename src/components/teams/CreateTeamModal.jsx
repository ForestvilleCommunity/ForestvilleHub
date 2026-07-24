import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { db } from '@/api/db';

export default function CreateTeamModal({ onCreated, onClose }) {
  const [form, setForm] = useState({ team_name: '', age_group: '', program_type: 'Independent' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.team_name.trim()) return;
    setSaving(true);
    try {
      const user = await db.auth.me();
      const team = await db.entities.Team.create({
        team_name: form.team_name.trim(),
        age_group: form.age_group.trim() || undefined,
        program_type: form.program_type,
        visibility: 'Private',
        owner_user_email: user.email,
        owner_id: user.id,
        status: 'Active',
      });
      onCreated(team);
    } catch (e) {
      alert('Error creating team: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl text-slate-900">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-lg text-slate-900">Create Team</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Team Name *</label>
            <input
              autoFocus
              value={form.team_name}
              onChange={e => setForm(f => ({ ...f, team_name: e.target.value }))}
              placeholder="e.g. U16 Eagles"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Age Group</label>
            <input
              value={form.age_group}
              onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))}
              placeholder="e.g. U14, U18, Senior"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !form.team_name.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Save size={16} />
            {saving ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}