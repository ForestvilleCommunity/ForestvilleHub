import { useState, useEffect } from 'react';
import { Plus, Pencil, ArrowRight, Search } from 'lucide-react';
import { db } from '@/api/db';
import { INPUT, Modal, Label, Spinner, Empty, SaveRow } from './AdminHelpers';

const POSITIONS = ['Point Guard','Shooting Guard','Small Forward','Power Forward','Center','Guard','Forward','Utility'];

export default function AdminPlayersTab() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');

  const load = async () => {
    setLoading(true);
    const [ps, ts] = await Promise.all([
      db.entities.Player.filter({ visibility: 'Club' }, '-created_date', 500),
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000),
    ]);
    setPlayers(ps); setTeams(ts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const me = await db.auth.me();
      if (selected?.id) {
        await db.entities.Player.update(selected.id, form);
      } else {
        await db.entities.Player.create({ status: 'Active', visibility: 'Club', owner_id: me.id, ...form });
      }
      setModal(null);
      load();
    } catch (e) {
      alert('Error saving player: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = players.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase());
    const matchTeam = !filterTeam || p.team_id === filterTeam;
    return matchSearch && matchTeam;
  });

  if (loading) return <Spinner />;

  return (
    <div className="p-4 space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setForm({ status: 'Active', visibility: 'Club' }); setSelected(null); setModal('form'); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap">
          <Plus size={15} /> New
        </button>
      </div>

      {/* Team filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setFilterTeam('')}
          className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${!filterTeam ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          All Teams
        </button>
        {teams.map(t => (
          <button key={t.id} onClick={() => setFilterTeam(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${filterTeam === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.team_name}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400">{filtered.length} player{filtered.length !== 1 ? 's' : ''}</p>

      <div className="space-y-2">
        {filtered.map(p => {
          const team = teams.find(t => t.id === p.team_id);
          return (
            <div key={p.id} className={`bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 ${p.status === 'Inactive' ? 'opacity-60' : ''}`}>
              <div className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                {p.jersey_number || p.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{p.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {team?.team_name || 'No team'}{p.position ? ` · ${p.position}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!p.team_id && p.status !== 'Inactive' && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">⚠ No team</span>
                )}
                {p.status === 'Inactive' && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Archived</span>
                )}
                <button onClick={() => { setForm({ ...p }); setSelected(p); setModal('form'); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                  <Pencil size={13} />
                </button>
                <button onClick={() => { setSelected(p); setModal('move'); }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <Empty text="No players found." />}
      </div>

      {/* Player Form Modal */}
      {modal === 'form' && (
        <Modal title={selected?.id ? 'Edit Player' : 'New Player'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Label text="Player Name">
              <input className={INPUT} value={form.name || ''} onChange={e => upd('name', e.target.value)} placeholder="Full name" />
            </Label>
            <Label text="Team">
              <select className={INPUT} value={form.team_id || ''} onChange={e => upd('team_id', e.target.value)}>
                <option value="">Select team…</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
              </select>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Label text="Jersey #">
                <input className={INPUT} type="number" value={form.jersey_number || ''} onChange={e => upd('jersey_number', Number(e.target.value))} placeholder="10" />
              </Label>
              <Label text="Position">
                <select className={INPUT} value={form.position || ''} onChange={e => upd('position', e.target.value)}>
                  <option value="">—</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Label>
            </div>
            <Label text="Date of Birth">
              <input className={INPUT} type="date" value={form.date_of_birth || ''} onChange={e => upd('date_of_birth', e.target.value)} />
            </Label>
            <Label text="Status">
              <select className={INPUT} value={form.status || 'Active'} onChange={e => upd('status', e.target.value)}>
                <option>Active</option><option>Inactive</option>
              </select>
            </Label>
            <Label text="Notes">
              <textarea className={INPUT} rows={2} value={form.notes || ''} onChange={e => upd('notes', e.target.value)} placeholder="Optional notes…" />
            </Label>
          </div>
          <SaveRow
            onSave={save} onCancel={() => setModal(null)} saving={saving} disabled={!form.name}
            extraBtn={selected?.id && selected.status !== 'Inactive' ? (
              <button onClick={async () => { await db.entities.Player.update(selected.id, { status: 'Inactive' }); setModal(null); load(); }}
                className="px-3 py-2.5 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50">
                Archive
              </button>
            ) : null}
          />
        </Modal>
      )}

      {/* Move Team Modal */}
      {modal === 'move' && selected && (
        <Modal title={`Move ${selected.name} to…`} onClose={() => setModal(null)}>
          <p className="text-xs text-slate-400 mb-3">
            Currently: <span className="font-semibold text-slate-700">{teams.find(t => t.id === selected.team_id)?.team_name || 'No team'}</span>
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {teams.map(t => (
              <button key={t.id}
                onClick={async () => { await db.entities.Player.update(selected.id, { team_id: t.id }); setModal(null); load(); }}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${t.id === selected.team_id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50 text-slate-900'}`}>
                {t.team_name}{t.age_group ? ` (${t.age_group})` : ''}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
