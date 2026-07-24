import { useState, useEffect } from 'react';
import { Plus, X, Users, ChevronRight } from 'lucide-react';
import { db } from '@/api/db';
import { Field } from './shared';
import OptionsMenu from './OptionsMenu';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const EMPTY = { name: '', description: '', age_group: '', season: '', team_ids: '[]', status: 'Active' };

export default function AdminSquadsSection({ teams, onTeamClick }) {
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedSquad, setSelectedSquad] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const sq = await db.entities.Squad.list('-created_date', 200).catch(() => []);
    setSquads(sq);
    setLoading(false);
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTeam = (id) => setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setSelectedTeamIds([]); setShowForm(true); };

  const openEdit = (sq) => {
    setEditing(sq);
    setForm({ name: sq.name || '', description: sq.description || '', age_group: sq.age_group || '', season: sq.season || '', team_ids: sq.team_ids || '[]', status: sq.status || 'Active' });
    try { setSelectedTeamIds(JSON.parse(sq.team_ids || '[]')); } catch { setSelectedTeamIds([]); }
    setShowForm(true);
    setSelectedSquad(null);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const { description: _desc, ...formRest } = form;
      const payload = { ...formRest, team_ids: JSON.stringify(selectedTeamIds), owner_user_email: me.email, visibility: 'Club' };
      if (editing?.id) {
        await db.entities.Squad.update(editing.id, payload);
      } else {
        await db.entities.Squad.create(payload);
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY);
      setSelectedTeamIds([]);
      load();
    } catch (e) {
      alert('Error saving squad: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async (sq) => { await db.entities.Squad.update(sq.id, { status: 'Archived' }); load(); };

  const getSquadTeams = (sq) => {
    try { return JSON.parse(sq.team_ids || '[]').map(id => teams.find(t => t.id === id)).filter(Boolean); } catch { return []; }
  };

  const activeSquads = squads.filter(s => s.status !== 'Archived');

  // Squad profile view
  if (selectedSquad) {
    const squadTeams = getSquadTeams(selectedSquad);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedSquad(null)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold">
            ← Back to Squads
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-bold text-slate-900 text-lg">{selectedSquad.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {selectedSquad.age_group && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{selectedSquad.age_group}</span>}
                {selectedSquad.season && <span className="text-xs text-slate-400">{selectedSquad.season}</span>}
              </div>
              {selectedSquad.description && <p className="text-sm text-slate-500 mt-2">{selectedSquad.description}</p>}
            </div>
            <button onClick={() => openEdit(selectedSquad)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-xl border border-blue-200 hover:bg-blue-50 transition-colors shrink-0">
              Edit
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Teams in this Squad ({squadTeams.length})
          </p>
          {squadTeams.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-2">No teams assigned yet</p>
          ) : (
            <div className="space-y-2">
              {squadTeams.map(team => (
                <button key={team.id} onClick={() => onTeamClick?.(team)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-3 group">
                  <Users size={14} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-700 group-hover:underline">{team.team_name}</p>
                    {(team.age_group || team.gender) && (
                      <p className="text-xs text-slate-400">{[team.age_group, team.gender].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-700 text-sm">{activeSquads.length} Squad{activeSquads.length !== 1 ? 's' : ''}</p>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
          <Plus size={14} /> New Squad
        </button>
      </div>

      {activeSquads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-500 font-medium text-sm">No squads yet</p>
          <p className="text-slate-400 text-xs mt-1">Group multiple teams together for easier management and challenge assignment</p>
        </div>
      ) : activeSquads.map(sq => {
        const sqTeams = getSquadTeams(sq);
        return (
          <div key={sq.id} onClick={() => setSelectedSquad(sq)}
            className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-slate-900">{sq.name}</h3>
                  {sq.age_group && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{sq.age_group}</span>}
                  {sq.season && <span className="text-xs text-slate-400">{sq.season}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                  <span className="flex items-center gap-1"><Users size={11} /> {sqTeams.length} team{sqTeams.length !== 1 ? 's' : ''}</span>
                </div>
                {sqTeams.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {sqTeams.map(t => (
                      <span key={t.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg font-medium">{t.team_name}</span>
                    ))}
                  </div>
                )}
              </div>
              <OptionsMenu items={[
                { label: 'Edit Squad', action: () => openEdit(sq) },
                { label: 'Archive Squad', action: () => archive(sq) },
              ]} />
            </div>
          </div>
        );
      })}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-2" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900">{editing ? 'Edit Squad' : 'New Squad'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <Field label="Squad Name *">
                <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="e.g. U10 Squad" className={IC} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Age Group">
                  <input value={form.age_group} onChange={e => upd('age_group', e.target.value)} placeholder="U10, U12…" className={IC} />
                </Field>
                <Field label="Season">
                  <input value={form.season} onChange={e => upd('season', e.target.value)} placeholder="2025/26" className={IC} />
                </Field>
              </div>
              <Field label="Description">
                <textarea value={form.description} onChange={e => upd('description', e.target.value)} rows={2}
                  className={IC + ' resize-none'} placeholder="Optional notes about this squad" />
              </Field>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Teams in this Squad</p>
                {teams.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No club teams available yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teams.map(t => (
                      <button key={t.id} onClick={() => toggleTeam(t.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          selectedTeamIds.includes(t.id)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}>
                        {t.team_name}{t.age_group ? ` (${t.age_group})` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {selectedTeamIds.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">{selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
                {saving ? 'Saving…' : editing ? 'Update Squad' : 'Create Squad'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-5 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}