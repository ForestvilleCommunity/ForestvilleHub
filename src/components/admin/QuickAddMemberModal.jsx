import { useState } from 'react';
import { X } from 'lucide-react';
import { db } from '@/api/db';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function QuickAddMemberModal({ team, squad, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', date_of_birth: '', gender: '' });
  const [saving, setSaving] = useState(false);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const member = await db.entities.Member.create({
        name: form.name,
        date_of_birth: form.date_of_birth || undefined,
        gender: form.gender || undefined,
        team_id: team?.id || undefined,
        status: 'Active',
        visibility: 'Club',
        owner_user_email: me.email,
        owner_id: me.id,
      });
      if (team?.id) {
        await db.entities.Player.create({
          name: form.name,
          team_id: team.id,
          member_id: member.id,
          owner_id: me.id,
          visibility: 'Club',
          status: 'Active',
          date_of_birth: form.date_of_birth || undefined,
          injury_status: 'Healthy',
        }).catch(() => {});
      }
      onSaved?.();
      onClose();
    } catch (e) {
      alert('Error adding member: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Add Member</h3>
            {team && <p className="text-xs text-slate-400 mt-0.5">{team.team_name}{squad ? ` · ${squad.name}` : ''}</p>}
            {!team && <p className="text-xs text-slate-400 mt-0.5">No team — can assign later</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name *</label>
            <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="First Last" className={IC} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date of Birth</label>
              <input type="date" value={form.date_of_birth} onChange={e => upd('date_of_birth', e.target.value)} className={IC} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Gender</label>
              <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={IC}>
                <option value="">—</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
          </div>
          {team && (
            <div className="bg-slate-50 rounded-xl px-3 py-2 text-xs text-slate-500 space-y-0.5">
              <p><span className="font-semibold">Team:</span> {team.team_name}</p>
              {squad && <p><span className="font-semibold">Squad:</span> {squad.name}</p>}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
            {saving ? 'Saving…' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  );
}