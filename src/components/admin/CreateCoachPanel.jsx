import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { db } from '@/api/db';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function generateTempPassword() {
  return 'CoachPad-' + Math.random().toString(36).slice(2, 10) + '!';
}

export default function CreateCoachPanel({ onCreated, teams, access }) {
  const [tab, setTab] = useState('invite');
  const [form, setForm] = useState({ full_name: '', email: '', team_ids: [] });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const appUrl = window.location.origin;

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTeam = (id) => setForm(f => ({
    ...f,
    team_ids: f.team_ids.includes(id) ? f.team_ids.filter(x => x !== id) : [...f.team_ids, id],
  }));

  const copyLink = async () => {
    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Create the coach account via Supabase signup (email confirm disabled on this project)
  const handleCreate = async () => {
    if (!form.full_name.trim() || !form.email.trim()) return;
    setSaving(true);
    setError('');
    try {
      const tempPassword = generateTempPassword();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: tempPassword,
        options: { data: { full_name: form.full_name.trim() } },
      });
      if (signUpError) throw signUpError;

      const userId = data?.user?.id;

      // Assign teams by email only — user_id omitted to avoid RLS violation
      for (const teamId of form.team_ids) {
        if (!access.some(a => a.user_email === form.email.trim() && a.team_id === teamId)) {
          await db.entities.UserTeamAccess.create({
            user_email: form.email.trim(),
            team_id: teamId,
            role: 'coach',
            can_edit: true,
            assigned_by_admin: true,
          });
        }
      }

      setDone(true);
      setTimeout(() => onCreated?.(), 1500);
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <div className="text-4xl">✅</div>
        <h3 className="font-bold text-slate-900">Coach Account Created!</h3>
        <p className="text-sm text-slate-500">
          An account has been created for <strong>{form.email}</strong>.
          Share the app link so they can log in and reset their password.
        </p>
        <div className="bg-slate-50 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-600 flex items-center gap-2">
          <span className="flex-1 truncate">{appUrl}</span>
          <button onClick={copyLink} className="text-blue-600 hover:text-blue-700 shrink-0">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <button onClick={() => { setDone(false); setForm({ full_name: '', email: '', team_ids: [] }); setError(''); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">Add Another</button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Toggle */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
        <button onClick={() => setTab('invite')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'invite' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
          Share Link
        </button>
        <button onClick={() => setTab('create')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'create' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
          Create Account
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        {tab === 'invite' && (
          <>
            <p className="text-sm text-slate-500">Share the CoachPad link with your coach. They sign up themselves and appear in the Coaches list once registered.</p>
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 flex items-center gap-2">
              <span className="flex-1 truncate">{appUrl}</span>
              <button onClick={copyLink}
                className="shrink-0 flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-700 px-2 py-1 bg-blue-50 rounded-lg">
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <p className="text-xs text-slate-400">Once they sign up, assign them to teams from the Coaches list.</p>
          </>
        )}

        {tab === 'create' && (
          <>
            <p className="text-sm text-slate-500">Create a coach account directly. They'll need to use "Forgot Password" to set their own password.</p>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name *</label>
              <input value={form.full_name} onChange={e => upd('full_name', e.target.value)}
                placeholder="First Last" className={IC} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => upd('email', e.target.value)}
                placeholder="coach@example.com" className={IC} />
            </div>
            {teams.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-2">Assign to Teams (optional)</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {teams.map(t => (
                    <button key={t.id} onClick={() => toggleTeam(t.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors ${form.team_ids.includes(t.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:border-blue-200'}`}>
                      {t.team_name}{t.age_group ? ` (${t.age_group})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <button onClick={handleCreate} disabled={saving || !form.full_name.trim() || !form.email.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
              {saving ? 'Creating…' : 'Create Coach'}
            </button>
          </>
        )}
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">How it works</p>
        {['Coach signs up or you create their account', 'They appear in the Coaches list', 'Assign them to teams', 'They can log in and start coaching'].map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold shrink-0">{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
