import { useState, useEffect, useRef } from 'react';
import { Plus, Search, X, Check, Layers, Trash2, Users, Upload, SlidersHorizontal, FileDown, Settings2 } from 'lucide-react';
import { db } from '@/api/db';
import { toast } from 'sonner';
import Papa from 'papaparse';
import OptionsMenu from './OptionsMenu';
import Pagination from './Pagination';
import CustomExportModal from './CustomExportModal';
import { downloadCSV } from '@/lib/csvExport';

const THEMES = ['Shooting', 'Ballhandling', 'Passing', 'Defense', 'Offense', 'Transition', 'Rebounding', 'Conditioning', 'Other'];
const PLAY_CATS = ['ATO', 'BLOB', 'SLOB', 'Half Court', 'Press Break', 'End of Game', 'Other'];

const DIFFICULTY_MAP = { basic: 1, medium: 2, advanced: 3 };
const CATEGORY_TO_THEME = {
  'ball handling': 'Ballhandling', 'ballhandling': 'Ballhandling',
  'shooting': 'Shooting', 'passing': 'Passing', 'defense': 'Defense',
  'offense': 'Offense', 'transition': 'Transition', 'rebounding': 'Rebounding',
  'conditioning': 'Conditioning', 'finishing': 'Offense', 'fun': 'Other',
  'warmup': 'Other', 'screens': 'Offense', 'screening': 'Offense',
};

function mapCsvRowToDrill(row) {
  const name = (row['Drill'] || row['Name'] || '').trim();
  if (!name || name.toLowerCase() === 'drill') return null;
  const cats = (row['Category'] || '').split(',').map(s => s.trim().toLowerCase());
  const theme = cats.map(c => CATEGORY_TO_THEME[c]).find(Boolean) || 'Other';
  const diff = (row['Difficulty'] || '').trim().toLowerCase();
  return {
    name,
    item_type: 'Drill',
    theme,
    description: (row['Description'] || '').trim() || undefined,
    coaching_points: (row['Coaching points'] || row['Coaching Points'] || '').trim() || undefined,
    skill_focus: (row['Skill'] || '').trim() || undefined,
    age_group: (row['Age groups'] || row['Age Groups'] || '').trim() || undefined,
    duration_minutes: row['Duration (min)'] ? Number(row['Duration (min)']) || undefined : undefined,
    video_url: (row['Video link'] || row['Video Link'] || '').trim() || undefined,
    level: DIFFICULTY_MAP[diff] || undefined,
    visibility: 'Club',
    status: 'Active',
  };
}

// ── CSV Import Modal ─────────────────────────────────────────────────────────
function ImportCsvModal({ onClose, onSaved, teams, squads }) {
  const fileRef = useRef();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  const toggleTeam = id => setSelectedTeamIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleRow = idx => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const toggleAll = () => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));

  const selectSquad = (sq) => {
    const ids = parseIds(sq.team_ids);
    const squadTeamIds = ids.filter(id => teams.some(t => t.id === id));
    const allOn = squadTeamIds.length > 0 && squadTeamIds.every(id => selectedTeamIds.includes(id));
    if (allOn) setSelectedTeamIds(p => p.filter(id => !squadTeamIds.includes(id)));
    else setSelectedTeamIds(p => [...new Set([...p, ...squadTeamIds])]);
  };
  const activeSquads = (squads || []).filter(s => s.status !== 'Archived');
  const filteredImportTeams = teams.filter(t => !teamSearch || (t.team_name || '').toLowerCase().includes(teamSearch.toLowerCase()));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const mapped = data.map(mapCsvRowToDrill).filter(Boolean);
        setRows(mapped);
        setSelected(new Set(mapped.map((_, i) => i)));
        setParsed(true);
      },
      error: () => toast.error('Could not parse CSV file'),
    });
  };

  const importSelected = async () => {
    const toImport = rows.filter((_, i) => selected.has(i));
    if (!toImport.length) { toast.error('Select at least one drill'); return; }
    setSaving(true);
    try {
      const me = await db.auth.me();
      for (const drill of toImport) {
        await db.entities.Drill.create({
          ...drill,
          owner_user_email: me.email,
          owner_id: me.id,
          team_ids: JSON.stringify(selectedTeamIds),
        });
      }
      toast.success(`${toImport.length} drill${toImport.length > 1 ? 's' : ''} imported`);
      onSaved();
    } catch (e) {
      toast.error('Error importing: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Import from CSV</h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload a drill library CSV — columns: Drill, Category, Description, Difficulty, Duration (min), Skill, Age groups</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!parsed ? (
            <div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload size={32} className="text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700 text-sm">Click to upload CSV</p>
                <p className="text-xs text-slate-400 mt-1">Exported from Notion, Google Sheets, or any spreadsheet</p>
                <input type="file" accept=".csv" className="hidden" ref={fileRef} onChange={handleFile} />
              </label>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{rows.length} drills found</p>
                <button onClick={toggleAll} className="text-xs text-blue-600 font-semibold hover:underline">
                  {selected.size === rows.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2">
                {rows.map((drill, i) => (
                  <button key={i} onClick={() => toggleRow(i)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      selected.has(i) ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200 opacity-50'
                    }`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      selected.has(i) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                    }`}>
                      {selected.has(i) && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{drill.name}</p>
                      <p className="text-xs text-slate-400">
                        {drill.theme}{drill.duration_minutes ? ` · ${drill.duration_minutes}min` : ''}{drill.age_group ? ` · ${drill.age_group}` : ''}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      drill.level === 1 ? 'bg-green-100 text-green-700' :
                      drill.level === 2 ? 'bg-yellow-100 text-yellow-700' :
                      drill.level === 3 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {drill.level === 1 ? 'Basic' : drill.level === 2 ? 'Medium' : drill.level === 3 ? 'Advanced' : '—'}
                    </span>
                  </button>
                ))}
              </div>

              {teams.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Assign to teams <span className="font-normal text-slate-400">(leave empty = all teams)</span>
                  </label>
                  {selectedTeamIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedTeamIds.map(id => {
                        const t = teams.find(x => x.id === id);
                        return t ? (
                          <span key={id} className="flex items-center gap-1 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
                            {t.team_name}
                            <button type="button" onClick={() => toggleTeam(id)} className="text-blue-200 hover:text-white font-bold leading-none">×</button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder={`Search ${teams.length} teams…`}
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                  </div>
                  {activeSquads.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quick-select by squad</p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeSquads.map(sq => {
                          const ids = parseIds(sq.team_ids);
                          const squadTeamIds = ids.filter(id => teams.some(t => t.id === id));
                          const allOn = squadTeamIds.length > 0 && squadTeamIds.every(id => selectedTeamIds.includes(id));
                          return (
                            <button key={sq.id} onClick={() => selectSquad(sq)}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                                allOn ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                              }`}>
                              {sq.name} <span className="opacity-60">({squadTeamIds.length})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {filteredImportTeams.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3 text-center">No teams match "{teamSearch}".</p>
                    ) : filteredImportTeams.map(t => {
                      const on = selectedTeamIds.includes(t.id);
                      return (
                        <button key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                            {on && <Check size={11} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 truncate text-sm text-slate-700">{t.team_name}</span>
                          {t.age_group && <span className="text-xs text-slate-400 shrink-0">{t.age_group}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-3">
          <button onClick={parsed ? () => { setParsed(false); setRows([]); setSelected(new Set()); } : onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">
            {parsed ? 'Back' : 'Cancel'}
          </button>
          {parsed && (
            <button onClick={importSelected} disabled={saving || selected.size === 0}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-60">
              {saving ? 'Importing...' : `Import ${selected.size} drill${selected.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: '', item_type: 'Drill', theme: 'Shooting', play_category: 'Half Court', skill_focus: '', description: '', duration_minutes: '', players_needed: '', age_group: '' };

function parseIds(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || '[]'); } catch { return []; }
}

// ── Quick Add Modal ──────────────────────────────────────────────────────────
function AddDrillModal({ onClose, onSaved, teams, editDrill, onImport }) {
  const isEdit = !!editDrill;
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const [form, setForm] = useState(isEdit ? {
    name: editDrill.name || '', item_type: editDrill.item_type || 'Drill',
    theme: editDrill.theme || 'Shooting', play_category: editDrill.play_category || 'Half Court',
    skill_focus: editDrill.skill_focus || '', description: editDrill.description || '',
    duration_minutes: editDrill.duration_minutes ?? '', players_needed: editDrill.players_needed || '', age_group: editDrill.age_group || '',
  } : EMPTY_FORM);
  const [bulkText, setBulkText] = useState('');
  const [bulkType, setBulkType] = useState('Drill');
  const [bulkTheme, setBulkTheme] = useState('Shooting');
  const [selectedTeamIds, setSelectedTeamIds] = useState(isEdit ? parseIds(editDrill.team_ids) : []);
  const [teamSearch, setTeamSearch] = useState('');
  const [images, setImages] = useState(isEdit ? [editDrill.image_url, ...parseIds(editDrill.extra_images)].filter(Boolean) : []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTeam = id => setSelectedTeamIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= 6) { toast.error('Maximum 6 images'); e.target.value = ''; return; }
    setUploadingImage(true);
    try {
      const { file_url } = await db.integrations.Core.UploadFile({ file });
      setImages(imgs => [...imgs, file_url]);
    } catch (err) {
      toast.error('Image upload failed: ' + err.message);
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };
  const removeImage = (i) => setImages(imgs => imgs.filter((_, idx) => idx !== i));

  const filteredTeams = teams
    .filter(t => !teamSearch || (t.team_name || '').toLowerCase().includes(teamSearch.toLowerCase()))
    .sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''));

  const saveSingle = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const { name, item_type, theme, play_category, skill_focus, description, duration_minutes, players_needed, age_group } = form;
      const payload = {
        name: name.trim(),
        item_type,
        theme: item_type === 'Drill' ? theme : null,
        play_category: item_type === 'Play' ? play_category : null,
        skill_focus: skill_focus || null,
        description: description || null,
        duration_minutes: duration_minutes ? Number(duration_minutes) : null,
        players_needed: players_needed || null,
        age_group: age_group || null,
        team_ids: JSON.stringify(selectedTeamIds),
        image_url: images[0] || null,
        extra_images: images.length > 1 ? JSON.stringify(images.slice(1)) : null,
      };
      if (isEdit) {
        await db.entities.Drill.update(editDrill.id, payload);
        toast.success('Drill updated');
      } else {
        const me = await db.auth.me();
        await db.entities.Drill.create({ ...payload, visibility: 'Club', status: 'Active', owner_user_email: me.email, owner_id: me.id });
        toast.success('Drill added to club library');
      }
      onSaved();
    } catch (e) {
      toast.error('Error saving drill: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveBulk = async () => {
    const names = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!names.length) { toast.error('Enter at least one drill name'); return; }
    setSaving(true);
    try {
      const me = await db.auth.me();
      for (const name of names) {
        await db.entities.Drill.create({
          name,
          item_type: bulkType,
          theme: bulkType === 'Drill' ? bulkTheme : undefined,
          visibility: 'Club',
          status: 'Active',
          owner_user_email: me.email,
          owner_id: me.id,
          team_ids: JSON.stringify(selectedTeamIds),
        });
      }
      toast.success(`${names.length} drill${names.length > 1 ? 's' : ''} added to club library`);
      onSaved();
    } catch (e) {
      toast.error('Error saving drills: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">{isEdit ? 'Edit Drill' : 'Add Club Drills'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{isEdit ? 'Update this drill in the club library' : "These will appear in the coaches' drill library"}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {/* Mode toggle — single only when editing */}
        {!isEdit && (
          <div className="px-5 pt-3 shrink-0">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setMode('single')}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                Single drill
              </button>
              <button onClick={onImport}
                className="flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors text-slate-500 hover:text-slate-700">
                Import
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {mode === 'single' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Drill Name *</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 3-Man Weave" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
                  <select value={form.item_type} onChange={e => upd('item_type', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="Drill">Drill</option>
                    <option value="Play">Play</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{form.item_type === 'Drill' ? 'Theme' : 'Category'}</label>
                  {form.item_type === 'Drill' ? (
                    <select value={form.theme} onChange={e => upd('theme', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {THEMES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  ) : (
                    <select value={form.play_category} onChange={e => upd('play_category', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {PLAY_CATS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Duration (min)</label>
                  <input type="number" value={form.duration_minutes} onChange={e => upd('duration_minutes', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Players needed</label>
                  <input value={form.players_needed} onChange={e => upd('players_needed', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 4-8" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Age Group <span className="font-normal text-slate-400">(optional)</span></label>
                <select value={form.age_group} onChange={e => upd('age_group', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All ages</option>
                  {['U8','U10','U12','U14','U16','U18','U21B','U23W','Seniors','Adults'].map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea value={form.description} onChange={e => upd('description', e.target.value)} rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the drill..." />
              </div>
              {/* Images */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Images <span className="font-normal text-slate-400">(diagrams or photos · up to 6)</span></label>
                <div className="flex flex-wrap gap-2">
                  {images.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 group shrink-0">
                      <img src={url} alt={`Drill image ${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-500">×</button>
                    </div>
                  ))}
                  {images.length < 6 && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 text-slate-400 shrink-0">
                      <Plus size={18} />
                      <span className="text-[10px] mt-0.5">{uploadingImage ? 'Uploading…' : 'Add'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                    </label>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Drill Names <span className="font-normal text-slate-400">(one per line)</span></label>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={8}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder={"3-Man Weave\nShell Drill\nPick and Roll\nCorner Shooting"} />
                {bulkText.trim() && (
                  <p className="text-xs text-slate-400 mt-1">{bulkText.split('\n').filter(l => l.trim()).length} drills to create</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Type (all)</label>
                  <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="Drill">Drill</option>
                    <option value="Play">Play</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Theme (all)</label>
                  <select value={bulkTheme} onChange={e => setBulkTheme(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {THEMES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Team assignment */}
          {teams.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Assign to teams <span className="font-normal text-slate-400">(leave empty to keep unassigned)</span>
                </label>
                {selectedTeamIds.length > 0 && (
                  <button type="button" onClick={() => setSelectedTeamIds([])} className="text-xs text-blue-600 font-semibold hover:underline">Clear ({selectedTeamIds.length})</button>
                )}
              </div>
              {/* Selected teams summary — always visible regardless of search/scroll */}
              {selectedTeamIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedTeamIds.map(id => {
                    const t = teams.find(x => x.id === id);
                    return t ? (
                      <span key={id} className="flex items-center gap-1 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
                        {t.team_name}
                        <button type="button" onClick={() => toggleTeam(id)} className="text-blue-200 hover:text-white font-bold leading-none">×</button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              {/* Search */}
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder={`Search ${teams.length} teams…`}
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {/* Sorted, scrollable checkable list */}
              <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredTeams.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 text-center">No teams match “{teamSearch}”.</p>
                ) : filteredTeams.map(t => {
                  const on = selectedTeamIds.includes(t.id);
                  return (
                    <button key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                        {on && <Check size={11} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 truncate text-sm text-slate-700">{t.team_name}</span>
                      {t.age_group && <span className="text-xs text-slate-400 shrink-0">{t.age_group}</span>}
                    </button>
                  );
                })}
              </div>
              {selectedTeamIds.length === 0 && (
                <p className="text-xs text-slate-400 mt-1.5">Unassigned — stays in the library but not shown to any team</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={mode === 'single' ? saveSingle : saveBulk} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-60">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : mode === 'single' ? 'Add Drill' : 'Add All'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Team Assignment Modal ────────────────────────────────────────────────────
function AssignTeamsModal({ drill, drills, teams, squads, onClose, onSaved }) {
  // supports single drill or multiple drills (bulk)
  const isBulk = !!drills;
  const [selectedTeamIds, setSelectedTeamIds] = useState(isBulk ? [] : parseIds(drill.team_ids));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleTeam = id => setSelectedTeamIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const visible = teams.filter(t =>
    !search || (t.team_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const save = async () => {
    setSaving(true);
    try {
      const payload = { team_ids: JSON.stringify(selectedTeamIds) };
      if (isBulk) {
        await Promise.all(drills.map(d => db.entities.Drill.update(d.id, payload)));
        toast.success(`${drills.length} drills assigned`);
      } else {
        await db.entities.Drill.update(drill.id, payload);
        toast.success('Team assignment updated');
      }
      onSaved();
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-sm max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Assign Teams</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">
              {isBulk ? `${drills.length} drills selected` : drill.name}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-slate-100 space-y-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
          </div>
        </div>

        {/* Team list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <p className="text-xs text-slate-400">Leave all unchecked to keep the drill unassigned (not shown to any team).</p>
          {visible.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No teams match "{search}"</p>
          ) : visible.map(t => {
            const on = selectedTeamIds.includes(t.id);
            return (
              <button key={t.id} onClick={() => toggleTeam(t.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  on ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                <div className="text-left">
                  <p className="text-sm font-semibold">{t.team_name}</p>
                  {(t.age_group || t.gender) && (
                    <p className="text-xs font-normal text-slate-400 mt-0.5">{[t.age_group, t.gender].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                {on && <Check size={15} className="text-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>

        {selectedTeamIds.length > 0 && (
          <p className="text-xs text-blue-600 font-semibold text-center py-1 shrink-0">
            {selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? 's' : ''} selected
          </p>
        )}

        <div className="px-5 pb-5 pt-2 flex gap-3 shrink-0 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ─────────────────────────────────────────────────────────────────
const DRILLS_SETTINGS_KEY = 'coachpad_drills_settings';
const DRILLS_SETTINGS_DEFAULT = { perPage: 25 };
function loadDrillsSettings() {
  try { return { ...DRILLS_SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(DRILLS_SETTINGS_KEY) || '{}') }; }
  catch { return DRILLS_SETTINGS_DEFAULT; }
}

export default function AdminDrillsTab({ resetTrigger, triggerAdd, triggerExport, triggerImport, triggerSettings }) {
  const [drills, setDrills] = useState([]);
  const [teams, setTeams] = useState([]);
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [themeFilter, setThemeFilter] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [editDrill, setEditDrill] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCustomExport, setShowCustomExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drillsSettings, setDrillsSettings] = useState(loadDrillsSettings);
  const [draftDrillsSettings, setDraftDrillsSettings] = useState(drillsSettings);
  const [assignDrill, setAssignDrill] = useState(null);
  const [bulkAssign, setBulkAssign] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const PAGE_SIZE = drillsSettings.perPage;
  const [page, setPage] = useState(0);

  const load = async () => {
    try {
      const [d, t, sq] = await Promise.all([
        db.entities.Drill.filter({ visibility: 'Club' }, '-created_date', 500).catch(() => []),
        db.entities.Team.filter({ status: 'Active', visibility: 'Club' }, 'team_name', 1000).catch(() => []),
        db.entities.Squad.list('name', 200).catch(() => []),
      ]);
      setDrills(d);
      setTeams(t);
      setSquads(sq);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (resetTrigger) { setSearch(''); setTypeFilter('All'); setThemeFilter('All'); setSelectedIds(new Set()); setBulkAssign(false); }
  }, [resetTrigger]);
  useEffect(() => { if (!triggerAdd) return; setShowAdd(true); }, [triggerAdd]);
  useEffect(() => { if (!triggerImport) return; setShowImport(true); }, [triggerImport]);
  useEffect(() => { if (!triggerExport) return; setShowExport(true); }, [triggerExport]);
  useEffect(() => { if (!triggerSettings) return; setDraftDrillsSettings(loadDrillsSettings()); setShowSettings(true); }, [triggerSettings]);

  useEffect(() => { setPage(0); }, [search, typeFilter, themeFilter]);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(d => d.id)));
  const clearSelect = () => { setSelectedIds(new Set()); setBulkAssign(false); setSelectMode(false); };

  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} drill${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    const ids = [...selectedIds];
    for (const id of ids) {
      try { await db.entities.Drill.delete(id); } catch {}
    }
    setDrills(prev => prev.filter(d => !ids.includes(d.id)));
    clearSelect();
    toast.success(`${count} drill${count !== 1 ? 's' : ''} deleted`);
  };

  const deleteDrill = async (drill) => {
    if (!window.confirm(`Delete "${drill.name}"?`)) return;
    setDeleting(drill.id);
    try {
      await db.entities.Drill.delete(drill.id);
      setDrills(prev => prev.filter(d => d.id !== drill.id));
      toast.success('Drill deleted');
    } catch (e) {
      toast.error('Error deleting: ' + e.message);
    } finally {
      setDeleting(null);
    }
  };

  const exportDrills = (list) => {
    downloadCSV(list.map(d => ({
      name: d.name || '', item_type: d.item_type || 'Drill', theme: d.theme || '',
      play_category: d.play_category || '', duration_minutes: d.duration_minutes || '',
      description: d.description || '', coaching_points: d.coaching_points || '',
      skill_focus: d.skill_focus || '', age_group: d.age_group || '',
      level: d.level || '', video_url: d.video_url || '',
    })), 'drills-export.csv');
  };

  const runDrillsExport = (scope) => {
    if (scope === 'by_theme') {
      return exportDrills([...drills].sort((a, b) => (a.theme || a.play_category || 'zzz').localeCompare(b.theme || b.play_category || 'zzz')));
    }
    if (scope === 'filtered') return exportDrills(filtered);
    return exportDrills(drills);
  };

  const hasFilters = typeFilter !== 'All' || themeFilter !== 'All';
  const filterCount = [typeFilter !== 'All', themeFilter !== 'All'].filter(Boolean).length;

  const allThemes = ['All', ...THEMES];
  const filtered = drills
    .filter(d => typeFilter === 'All' || d.item_type === typeFilter)
    .filter(d => themeFilter === 'All' || d.theme === themeFilter || d.play_category === themeFilter)
    .filter(d => !search || d.name?.toLowerCase().includes(search.toLowerCase()));

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      {/* Row 1: Search + Filters + Select */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search club drills..."
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setShowFilters(true)}
          className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${hasFilters ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          <SlidersHorizontal size={13} /> Filters
          {hasFilters && <span className="bg-white text-blue-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">{filterCount}</span>}
        </button>
        <button onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()); }}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <Check size={14} /> Select
        </button>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold flex-1">
            {selectedIds.size > 0 ? `${selectedIds.size} drill${selectedIds.size !== 1 ? 's' : ''} selected` : 'Tap drills to select'}
          </span>
          <button onClick={selectAll} className="text-xs font-semibold text-blue-200 hover:text-white transition-colors">All</button>
          <button onClick={clearSelect} className="text-xs font-semibold text-blue-200 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => setBulkAssign(true)} disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40">
            <Users size={13} /> Assign to Teams
          </button>
          <button onClick={bulkDelete} disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Layers size={32} className="mb-2 opacity-30" />
            <p className="text-sm font-medium">{drills.length === 0 ? 'No club drills yet' : 'No drills match your search'}</p>
            {drills.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-blue-600 font-semibold hover:underline">
                Add your first drill
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-2 w-full min-w-0">
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(drill => {
              const assignedTeams = parseIds(drill.team_ids).map(id => teamMap[id]).filter(Boolean);
              const isSelected = selectedIds.has(drill.id);
              return (
                <div key={drill.id}
                  onClick={() => selectMode ? toggleSelect(drill.id, { stopPropagation: () => {} }) : setEditDrill(drill)}
                  className={`bg-white rounded-2xl border p-4 flex items-center gap-3 hover:shadow-sm transition-all cursor-pointer ${
                    isSelected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
                  }`}>

                  {/* Checkbox visible in select mode */}
                  {selectMode && (
                    <div onClick={e => toggleSelect(drill.id, e)}
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                      }`}>
                      {isSelected && <Check size={13} className="text-white" strokeWidth={3} />}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{drill.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">{drill.theme || drill.play_category || '—'}</span>
                      {drill.duration_minutes && <span className="text-xs text-slate-400">· {drill.duration_minutes}min</span>}
                      {assignedTeams.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {assignedTeams.slice(0, 2).map(t => (
                            <span key={t.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{t.team_name}</span>
                          ))}
                          {assignedTeams.length > 2 && (
                            <span className="text-xs text-slate-400">+{assignedTeams.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">Unassigned</span>
                      )}
                    </div>
                  </div>

                  {/* Actions (hidden in select mode) */}
                  {!selectMode && (
                    <div onClick={e => e.stopPropagation()}>
                      <OptionsMenu items={[
                        { label: 'Assign to teams', action: () => setAssignDrill(drill) },
                        { label: 'Edit drill', action: () => setEditDrill(drill) },
                        { divider: true },
                        { label: 'Delete drill', action: () => deleteDrill(drill), danger: true },
                      ]} />
                    </div>
                  )}
                </div>
              );
            })}
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPage={setPage} />
          </div>
        )}
      </div>

      {/* Settings page overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-slate-50 z-30 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Library Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Drills per page</p>
              <div className="flex gap-2">
                {[10, 25, 50, 100].map(n => (
                  <button key={n} onClick={() => setDraftDrillsSettings(s => ({ ...s, perPage: n }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftDrillsSettings.perPage === n ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">How many drills to show per page.</p>
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex items-center gap-3">
            <div className="flex-1" />
            <button onClick={() => setShowSettings(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
            <button onClick={() => { localStorage.setItem(DRILLS_SETTINGS_KEY, JSON.stringify(draftDrillsSettings)); setDrillsSettings(draftDrillsSettings); setPage(0); setShowSettings(false); }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">Save Settings</button>
          </div>
        </div>
      )}

      {/* Export page overlay */}
      {showExport && (
        <div className="absolute inset-0 bg-slate-50 z-30 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <button onClick={() => setShowExport(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Export Drills</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-3">
            <p className="text-sm text-slate-500">Choose what to export. Files download as CSV.</p>
            <button onClick={() => { runDrillsExport('all'); setShowExport(false); }}
              className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
              <FileDown size={18} className="text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">All drills</p>
                <p className="text-xs text-slate-400">Every drill ({drills.length}) in the library.</p>
              </div>
            </button>
            <button onClick={() => { setShowExport(false); setShowCustomExport(true); }}
              className="w-full text-left bg-white rounded-2xl border-2 border-dashed border-slate-300 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
              <SlidersHorizontal size={18} className="text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">Custom export…</p>
                <p className="text-xs text-slate-400">Pick exactly which columns to include.</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {showCustomExport && (
        <CustomExportModal
          title="Custom Drill Export"
          fields={[
            { key: 'name', label: 'Name' },
            { key: 'item_type', label: 'Type' },
            { key: 'theme', label: 'Theme' },
            { key: 'play_category', label: 'Play category' },
            { key: 'duration_minutes', label: 'Duration (min)' },
            { key: 'skill_focus', label: 'Skill focus' },
            { key: 'age_group', label: 'Age group' },
            { key: 'description', label: 'Description' },
            { key: 'coaching_points', label: 'Coaching points' },
            { key: 'video_url', label: 'Video URL' },
          ]}
          rows={drills.map(d => ({
            name: d.name || '', item_type: d.item_type || 'Drill', theme: d.theme || '',
            play_category: d.play_category || '', duration_minutes: d.duration_minutes || '',
            skill_focus: d.skill_focus || '', age_group: d.age_group || '',
            description: d.description || '', coaching_points: d.coaching_points || '', video_url: d.video_url || '',
          }))}
          filename="drills-custom.csv"
          onClose={() => setShowCustomExport(false)}
        />
      )}

      {/* Modals */}
      {showImport && (
        <ImportCsvModal
          teams={teams}
          squads={squads}
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); load(); }}
        />
      )}
      {(showAdd || editDrill) && (
        <AddDrillModal
          teams={teams}
          editDrill={editDrill}
          onClose={() => { setShowAdd(false); setEditDrill(null); }}
          onSaved={() => { setShowAdd(false); setEditDrill(null); load(); }}
          onImport={() => { setShowAdd(false); setEditDrill(null); setShowImport(true); }}
        />
      )}
      {assignDrill && (
        <AssignTeamsModal
          drill={assignDrill}
          teams={teams}
          squads={squads}
          onClose={() => setAssignDrill(null)}
          onSaved={() => { setAssignDrill(null); load(); }}
        />
      )}
      {bulkAssign && (
        <AssignTeamsModal
          drills={drills.filter(d => selectedIds.has(d.id))}
          teams={teams}
          squads={squads}
          onClose={() => setBulkAssign(false)}
          onSaved={() => { setBulkAssign(false); clearSelect(); load(); }}
        />
      )}

      {/* Filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={() => setShowFilters(false)}>
          <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Type</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="All">All types</option>
                  <option value="Drill">Drills</option>
                  <option value="Play">Plays</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Theme</label>
                <select value={themeFilter} onChange={e => setThemeFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {allThemes.map(t => <option key={t} value={t}>{t === 'All' ? 'All themes' : t}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setTypeFilter('All'); setThemeFilter('All'); }}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Clear
              </button>
              <button onClick={() => setShowFilters(false)}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

