import { useState, useEffect } from 'react';
import { Plus, Trophy, Calendar, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/api/db';
import { toast } from 'sonner';

const CHALLENGE_TYPES = [
  'Weekly Drill Focus', 'Skill Challenge', 'Team Concept',
  'Shooting Challenge', 'Defensive Challenge', 'Coach Education', 'Custom',
];
const STATUS_OPTIONS = ['Draft', 'Active', 'Completed', 'Archived'];
const STATUS_COLORS = {
  Active:    'bg-green-100 text-green-700',
  Draft:     'bg-slate-100 text-slate-500',
  Completed: 'bg-blue-100 text-blue-700',
  Archived:  'bg-red-50 text-red-400',
};

const DEFAULT_FORM = {
  title: '', description: '', challenge_type: 'Weekly Drill Focus',
  focus_category: '', start_date: '', end_date: '', status: 'Draft',
};

export default function ClubChallenges() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    db.auth.me().then(u => {
      setUser(u);
      load();
    }).catch(() => setLoading(false));
  }, []);

  const load = async () => {
    const list = await db.entities.ClubChallenge.list('-created_date', 200).catch(() => []);
    setChallenges(list);
    setLoading(false);
  };

  const isAdmin = user?.role === 'admin';
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const createChallenge = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      await db.entities.ClubChallenge.create({ ...form, created_by: user?.id });
      toast.success('Challenge created!');
      setShowCreate(false);
      setForm(DEFAULT_FORM);
      await load();
    } catch (e) {
      toast.error('Error creating challenge: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    await db.entities.ClubChallenge.update(id, { status });
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    toast.success('Status updated');
  };

  const filtered = statusFilter === 'All' ? challenges : challenges.filter(c => c.status === statusFilter);
  const activeCnt = challenges.filter(c => c.status === 'Active').length;

  return (
    <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">
      {/* Back button */}
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold -mb-1">
        <ArrowLeft size={15} /> Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Club Challenges</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeCnt > 0 ? `${activeCnt} active challenge${activeCnt !== 1 ? 's' : ''}` : 'No active challenges'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200 shrink-0">
            <Plus size={16} /> New Challenge
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
          <h2 className="font-bold text-slate-900">Create Challenge</h2>

          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Challenge title *"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Description — what should coaches do? (optional)" rows={2}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Challenge Type</label>
              <select value={form.challenge_type} onChange={e => set('challenge_type', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CHALLENGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM); }}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={createChallenge} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Challenge'}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs — coaches only need All/Active/Completed; Draft is invisible to
          them via RLS anyway, and Archived isn't part of their day-to-day workflow. */}
      {challenges.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(isAdmin ? ['All', ...STATUS_OPTIONS] : ['All', 'Active', 'Completed']).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
              }`}>{s}</button>
          ))}
        </div>
      )}

      {/* Challenge list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Trophy size={28} className="text-blue-400" />
          </div>
          <p className="font-bold text-slate-700">No challenges yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {isAdmin ? 'Tap "New Challenge" to create one for coaches' : 'Check back soon for club challenges'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ch => (
            <div key={ch.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{ch.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{ch.challenge_type}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[ch.status] || 'bg-slate-100 text-slate-500'}`}>
                  {ch.status}
                </span>
              </div>

              {ch.description && <p className="text-sm text-slate-600 mb-3 leading-relaxed">{ch.description}</p>}

              {(ch.start_date || ch.end_date) && (
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                  <Calendar size={12} />
                  {ch.start_date && <span>{ch.start_date}</span>}
                  {ch.start_date && ch.end_date && <span>→</span>}
                  {ch.end_date && <span>{ch.end_date}</span>}
                </div>
              )}

              {isAdmin && (
                <div className="flex gap-1.5 flex-wrap border-t border-slate-100 pt-3 mt-1">
                  {STATUS_OPTIONS.filter(s => s !== ch.status).map(s => (
                    <button key={s} onClick={() => updateStatus(ch.id, s)}
                      className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 font-semibold border border-slate-200 transition-colors">
                      Set {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}