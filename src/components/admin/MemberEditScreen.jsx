import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { db } from '@/api/db';
import { INPUT, Field } from './shared';

const POSITIONS = ['Point Guard','Shooting Guard','Small Forward','Power Forward','Center','Guard','Forward','Utility'];
const EMPTY = {
  name:'', date_of_birth:'', gender:'', email:'', phone:'', address:'',
  team_id:'', position:'', jersey_number:'',
  parent_name:'', parent_phone:'', parent_email:'', secondary_contact:'',
  school:'', medical_conditions:'', medication:'', other_conditions:'',
  notes:'', status:'Active', visibility:'Club',
};

function FS({ title, open, toggle, children }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
        {title}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function JerseyConflictWarning({ jerseyNumber, currentMemberId, teamId, allMembers, teams }) {
  if (!teamId) return null;
  if (jerseyNumber === '' || jerseyNumber === null || jerseyNumber === undefined) return null;
  const num = parseInt(jerseyNumber);
  if (isNaN(num)) return null;

  const conflicts = allMembers.filter(m =>
    m.id !== currentMemberId &&
    m.status !== 'Archived' &&
    m.team_id === teamId &&
    m.jersey_number === num
  );
  if (conflicts.length === 0) return null;

  const team = teams.find(t => t.id === teamId);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 col-span-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
        <span className="text-xs font-bold text-amber-700">Jersey #{num} already taken on {team?.team_name || 'this team'}</span>
      </div>
      {conflicts.map(m => (
        <div key={m.id} className="bg-white rounded-lg p-2 border border-amber-100">
          <p className="text-xs font-semibold text-slate-800">{m.name}</p>
          <p className="text-xs text-slate-500">{m.position || 'No position'}</p>
        </div>
      ))}
      <p className="text-xs text-amber-600">Admin decides — this is a warning only.</p>
    </div>
  );
}


export default function MemberEditScreen({ member, teams: propTeams, squads: propSquads, allMembers: propAllMembers, onBack, onSaved }) {
  const [teams, setTeams] = useState(propTeams || []);
  const [squads, setSquads] = useState(propSquads || []);
  const [allMembers, setAllMembers] = useState(propAllMembers || []);
  const [players, setPlayers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(['basic', 'contact']);
  const [form, setForm] = useState({
    name: member.name || '',
    date_of_birth: member.date_of_birth || '',
    gender: member.gender || '',
    email: member.email || '',
    phone: member.phone || '',
    address: member.address || '',
    team_id: member.team_id || '',
    position: member.position || '',
    jersey_number: member.jersey_number?.toString() || '',
    parent_name: member.parent_name || '',
    parent_phone: member.parent_phone || '',
    parent_email: member.parent_email || '',
    secondary_contact: member.secondary_contact_name || '',
    school: member.school || '',
    medical_conditions: member.medical_conditions || '',
    medication: member.medication || '',
    other_conditions: member.other_conditions || '',
    notes: member.notes || '',
    status: member.status || 'Active',
    visibility: member.visibility || 'Club',
  });

  useEffect(() => {
    const loads = [];
    if (!propTeams) loads.push(db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000).then(setTeams));
    if (!propSquads) loads.push(db.entities.Squad.list('-created_date', 200).catch(() => []).then(setSquads));
    if (!propAllMembers) loads.push(db.entities.Member.filter({ visibility: 'Club' }, '-created_date', 500).then(setAllMembers));
    loads.push(db.entities.Player.filter({ visibility: 'Club' }, '-created_date', 500).then(setPlayers));
    Promise.all(loads);
  }, []);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSection = (s) => setOpen(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const getMemberAge = () => {
    if (!form.date_of_birth) return null;
    const b = new Date(form.date_of_birth);
    return new Date().getFullYear() - b.getFullYear();
  };

  const checkAgeMismatch = () => {
    if (!form.team_id || form.team_id === member.team_id) return true;
    const newTeam = teams.find(t => t.id === form.team_id);
    if (!newTeam?.age_group) return true;
    const match = newTeam.age_group.match(/U(\d+)/i);
    if (!match) return true;
    const teamMaxAge = parseInt(match[1], 10);
    const memberAge = getMemberAge();
    if (memberAge === null) return true;
    if (memberAge > teamMaxAge) {
      return window.confirm(
        `⚠️ Age mismatch\n\n${form.name} is ${memberAge} years old but ${newTeam.team_name} is for players Under ${teamMaxAge}.\n\nAre you sure you want to assign them to this team?`
      );
    }
    return true;
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (!checkAgeMismatch()) return;
    setSaving(true);
    const me = await db.auth.me();
    const teamChanged = form.team_id && form.team_id !== member.team_id;
    const oldTeam = teams.find(t => t.id === member.team_id);
    const newTeam = teams.find(t => t.id === form.team_id);
    const memberData = {
      name: form.name.trim(),
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      team_id: form.team_id || null,
      position: form.position || null,
      jersey_number: form.jersey_number !== '' ? Number(form.jersey_number) : null,
      parent_name: form.parent_name || null,
      parent_phone: form.parent_phone || null,
      parent_email: form.parent_email || null,
      secondary_contact_name: form.secondary_contact || null,
      school: form.school || null,
      medical_conditions: form.medical_conditions || null,
      medication: form.medication || null,
      other_conditions: form.other_conditions || null,
      notes: form.notes || null,
      status: form.status,
      visibility: form.visibility,
      owner_id: member.owner_id || me.id,
      owner_user_email: member.owner_user_email || me.email,
    };
    try {
      await db.entities.Member.update(member.id, memberData);

      // Log team transfer
      if (teamChanged) {
        const fromLabel = oldTeam ? oldTeam.team_name : 'No team';
        const toLabel   = newTeam ? newTeam.team_name : 'No team';
        await db.entities.PlayerNote.create({
          player_id:        member.id,
          team_id:          form.team_id || null,
          note:             `[Transfer] Moved from ${fromLabel} to ${toLabel}`,
          coach_user_email: me.email,
          created_date:     new Date().toISOString(),
        }).catch(() => {});
      }

      if (form.team_id) {
        const linked = players.find(p => p.member_id === member.id);
        const playerData = {
          name: form.name, team_id: form.team_id, member_id: member.id,
          owner_id: member.owner_id || me.id,
          owner_user_email: me.email, visibility: 'Club',
          status: form.status === 'Active' ? 'Active' : 'Inactive',
          date_of_birth: form.date_of_birth || null,
          position: form.position || null,
          jersey_number: form.jersey_number !== '' ? Number(form.jersey_number) : null,
        };
        if (linked) {
          await db.entities.Player.update(linked.id, playerData);
        } else {
          const existingForTeam = await db.entities.Player.filter({ member_id: member.id, team_id: form.team_id }).catch(() => []);
          if (existingForTeam.length > 0) {
            await db.entities.Player.update(existingForTeam[0].id, playerData);
          } else {
            await db.entities.Player.create({ ...playerData, injury_status: 'Healthy' });
          }
        }
      } else {
        // Team cleared — deactivate any linked Player record and clear its team
        const linked = players.find(p => p.member_id === member.id);
        if (linked) await db.entities.Player.update(linked.id, { status: 'Inactive', team_id: null }).catch(() => {});
      }
      onSaved?.();
    } catch (e) {
      alert('Error saving member: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const registrationDate = member.created_date ? new Date(member.created_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const currentSquad = squads.find(s => { try { return JSON.parse(s.team_ids || '[]').includes(form.team_id); } catch { return false; } });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-lg shrink-0">
          {member.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-900">Edit Member</h2>
          <p className="text-xs text-slate-400">{member.name} · Registered {registrationDate}</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">
        <FS title="Basic Information" open={open.includes('basic')} toggle={() => toggleSection('basic')}>
          <Field label="Full Name *">
            <input value={form.name} onChange={e => upd('name', e.target.value)} className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date of Birth">
              <input type="date" value={form.date_of_birth} onChange={e => upd('date_of_birth', e.target.value)} className={INPUT} />
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={INPUT}>
                <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => upd('status', e.target.value)} className={INPUT}>
                <option value="Active">Active</option><option value="Archived">Archived</option>
              </select>
            </Field>
            <Field label="Team">
              <select value={form.team_id} onChange={e => upd('team_id', e.target.value)} className={INPUT}>
                <option value="">Unassigned</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
              </select>
            </Field>
          </div>
          {form.team_id && (
            <p className="text-xs text-slate-500 px-1">
              Squad: <span className="font-semibold text-indigo-600">{currentSquad?.name || 'No squad'}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Jersey #">
              <input type="number" min="0" max="99" value={form.jersey_number} onChange={e => upd('jersey_number', e.target.value)} placeholder="10" className={INPUT} />
            </Field>
            <Field label="Position">
              <select value={form.position} onChange={e => upd('position', e.target.value)} className={INPUT}>
                <option value="">—</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <JerseyConflictWarning
              jerseyNumber={form.jersey_number}
              currentMemberId={member.id}
              teamId={form.team_id}
              allMembers={allMembers}
              teams={teams}
            />
          </div>
        </FS>

        <FS title="Contact Details" open={open.includes('contact')} toggle={() => toggleSection('contact')}>
          <Field label="Email"><input type="email" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="email@example.com" className={INPUT} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={e => upd('phone', e.target.value)} className={INPUT} /></Field>
          <Field label="Address"><input value={form.address} onChange={e => upd('address', e.target.value)} className={INPUT} /></Field>
        </FS>

        <FS title="Parent / Guardian" open={open.includes('parent')} toggle={() => toggleSection('parent')}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Parent Name"><input value={form.parent_name} onChange={e => upd('parent_name', e.target.value)} className={INPUT} /></Field>
            <Field label="Parent Phone"><input value={form.parent_phone} onChange={e => upd('parent_phone', e.target.value)} className={INPUT} /></Field>
          </div>
          <Field label="Parent Email"><input type="email" value={form.parent_email} onChange={e => upd('parent_email', e.target.value)} className={INPUT} /></Field>
          <Field label="Secondary Contact"><input value={form.secondary_contact} onChange={e => upd('secondary_contact', e.target.value)} className={INPUT} /></Field>
        </FS>

        <FS title="Background" open={open.includes('background')} toggle={() => toggleSection('background')}>
          <Field label="School Attending"><input value={form.school} onChange={e => upd('school', e.target.value)} className={INPUT} /></Field>
        </FS>

        <FS title="Medical Information" open={open.includes('medical')} toggle={() => toggleSection('medical')}>
          <Field label="Medical Conditions"><textarea value={form.medical_conditions} onChange={e => upd('medical_conditions', e.target.value)} rows={2} className={INPUT + ' resize-none'} /></Field>
          <Field label="Medication"><textarea value={form.medication} onChange={e => upd('medication', e.target.value)} rows={2} className={INPUT + ' resize-none'} /></Field>
          <Field label="Other Conditions"><textarea value={form.other_conditions} onChange={e => upd('other_conditions', e.target.value)} rows={2} className={INPUT + ' resize-none'} /></Field>
        </FS>

        <FS title="Notes" open={open.includes('notes')} toggle={() => toggleSection('notes')}>
          <Field label="Notes"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={3} className={INPUT + ' resize-none'} /></Field>
        </FS>

        <div className="flex gap-2 pb-8">
          <button onClick={onBack} className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
