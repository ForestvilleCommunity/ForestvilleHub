import { useState, useRef } from 'react';
import { X, Upload, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '@/api/db';

const FIELD_MAP = [
  { key: 'name',             label: 'Full Name',         required: true,
    aliases: ['member name', 'full name', 'player name', 'name'] },
  { key: 'date_of_birth',   label: 'Date of Birth',
    aliases: ['date of birth', 'dob', 'birth date', 'born', 'birthday'] },
  { key: 'gender',          label: 'Gender',
    aliases: ['gender identity', 'gender', 'sex'] },
  { key: 'email',           label: 'Email',
    aliases: ['email address', 'email'] },
  { key: 'phone',           label: 'Mobile Phone',
    aliases: ['phone number', 'mobile phone', 'mobile', 'cell phone', 'cell'] },
  { key: 'address',         label: 'Address',
    aliases: ['address', 'home address'] },
  // team_name must come before squad_name — "Squad" col in revolutionise = team
  { key: 'team_name',       label: 'Team',
    aliases: ['squad', 'team name', 'teams', 'club team', 'current team'] },
  { key: 'program_type',   label: 'Program Type',
    aliases: ['program', 'program type', 'competition type', 'comp type', 'type'] },
  { key: 'squad_name',      label: 'Squad / Division',
    aliases: ['squad name', 'division'] },
  { key: 'jersey_number',   label: 'Jersey Number',
    aliases: ['jersey number', 'jersey', 'uniform number', 'position', 'number'] },
  { key: 'parent_name',     label: 'Parent Name',
    aliases: ['parent name(s)', 'parent name', 'parent names', 'parent', 'guardian', 'parent / guardian'] },
  { key: 'parent_phone',    label: 'Secondary Contact Number',
    aliases: ['secondary contact number', 'parent phone', 'parent mobile', 'guardian phone'] },
  { key: 'parent_email',    label: 'Parent Email',
    aliases: ['additional email addresses', 'additional email', 'parent email', 'guardian email'] },
  { key: 'school',          label: 'School',
    aliases: ['school attending', 'school name', 'school'] },
  { key: 'medical_conditions', label: 'Medical Conditions',
    aliases: ['does the player suffer from any of the following', 'medical conditions', 'medical', 'health notes', 'health'] },
  { key: 'medication',      label: 'Medication',
    aliases: ['if yes to above please indicate medication', 'medication/special instructions', 'medication', 'meds', 'medicine'] },
  { key: 'other_conditions', label: 'Other Conditions',
    aliases: ['does the player have any other conditions', 'other conditions', 'other medical'] },
  { key: 'notes',           label: 'Notes',
    aliases: ['notes', 'additional info', 'comments'] },
  { key: 'previous_club',   label: 'Previous Club',
    aliases: ['do you play or have you played', 'previous club', 'prev club', 'former club', 'last club'] },
  { key: 'registered_on',   label: 'Registered On',
    aliases: ['registered on', 'registration date', 'registered'] },
  { key: 'age_group',       label: 'Age Group / Division',
    aliases: ['current team - age group and division', 'age group and division', 'age group'] },
  { key: 'volunteer_role',  label: 'Volunteer Role',
    aliases: ['volunteer to be coach', 'volunteer to be coach/team manager', 'volunteer role', 'volunteer'] },
  { key: 'parent_occupation', label: 'Parents Occupation',
    aliases: ['parents occupation', 'parent occupation', 'occupation'] },
];

const PROGRAM_TYPES = ['District', 'Domestic', 'Club', 'Academy'];
function normaliseProgramType(raw) {
  if (!raw) return '';
  const s = raw.trim().toLowerCase();
  return PROGRAM_TYPES.find(p => p.toLowerCase() === s) || raw.trim();
}

const FEMALE_WORDS = /\b(girl|girls|woman|women|female|ladies|lady)\b/i;
function detectTeamGender(teamName) {
  return FEMALE_WORDS.test(teamName || '') ? 'Female' : 'Male';
}

// Convert DD/MM/YYYY → YYYY-MM-DD; pass through YYYY-MM-DD unchanged
function normaliseDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // Excel may output as YYYY-MM-DD when we use dateNF
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
  // Excel date serial stored as plain number (e.g. 35958)
  const num = Number(s);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    // Excel epoch: Jan 0 1900; offset 25569 to Unix epoch
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(d)) {
      const yr = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
      return `${yr}-${mo}-${dy}`;
    }
  }
  return s;
}

// Normalise Australian phone numbers (add leading 0 when stored as 9-digit number starting with 4)
function normalisePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('4')) return '0' + digits;
  if (digits.length === 10 && digits.startsWith('04')) return '0' + digits.slice(1); // already correct
  return String(raw).trim();
}

// Detect "Last, First" format and reformat to "First Last"
function reformatName(raw) {
  if (!raw) return '';
  const commaIdx = raw.indexOf(',');
  if (commaIdx > 0 && commaIdx < raw.length - 1) {
    const last = raw.slice(0, commaIdx).trim();
    const first = raw.slice(commaIdx + 1).trim();
    return `${first} ${last}`;
  }
  return raw.trim();
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line) => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line + ',') {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    return vals.map(v => v.replace(/^"|"$/g, '').trim());
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  });
  return { headers, rows };
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false converts all values to strings; dateNF formats date cells as YYYY-MM-DD
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
  if (data.length < 2) return { headers: [], rows: [] };
  const headers = (data[0] || []).map(h => String(h || '').trim());
  const rows = data.slice(1)
    .filter(r => r.some(c => String(c || '').trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] || '').trim()])));
  return { headers, rows };
}

// Field-first auto-map: for each field, find the best (longest-alias) matching header.
// Longer alias = more specific = higher priority. Already-claimed headers are skipped.
function autoMap(headers) {
  const map = {};
  const used = new Set();
  for (const field of FIELD_MAP) {
    let bestHeader = null, bestLen = 0;
    for (const h of headers) {
      if (used.has(h)) continue;
      const hl = h.toLowerCase().trim();
      for (const a of field.aliases) {
        if ((hl === a || hl.includes(a)) && a.length > bestLen) {
          bestHeader = h;
          bestLen = a.length;
        }
      }
    }
    if (bestHeader) {
      map[field.key] = bestHeader;
      used.add(bestHeader);
    }
  }
  return map;
}

// Shared by both the create and reconcile paths, so a returning member's
// refreshed contact/medical/jersey info is built the exact same way as a
// brand-new one — the only difference is whether it lands in an insert or
// an update.
function buildMemberFieldsFromRow(row, getVal) {
  const memberData = {};
  const memberFields = ['date_of_birth','gender','email','phone','address','parent_name','parent_phone',
    'parent_email','school','medical_conditions','medication','other_conditions','notes','jersey_number'];
  memberFields.forEach(field => {
    let v = getVal(row, field);
    if (!v) return;
    if (field === 'date_of_birth') v = normaliseDate(v);
    if (field === 'phone' || field === 'parent_phone') v = normalisePhone(v);
    memberData[field] = v;
  });

  const extraParts = [];
  const prevClub = getVal(row, 'previous_club');
  if (prevClub) extraParts.push(`Previous club: ${prevClub}`);
  const regOn = getVal(row, 'registered_on');
  if (regOn) extraParts.push(`Registered on: ${normaliseDate(regOn)}`);
  const ageGroup = getVal(row, 'age_group');
  if (ageGroup) extraParts.push(`Age group: ${ageGroup}`);
  const volunteer = getVal(row, 'volunteer_role');
  if (volunteer) extraParts.push(`Volunteer: ${volunteer}`);
  const parentOcc = getVal(row, 'parent_occupation');
  if (parentOcc) extraParts.push(`Parents occupation: ${parentOcc}`);
  if (extraParts.length) {
    memberData.notes = [memberData.notes, ...extraParts].filter(Boolean).join('\n');
  }
  return memberData;
}

export default function MemberImportModal({ onClose, existingTeams = [], existingMembers = [], onImported }) {
  const [step, setStep] = useState('upload');
  const [parsed, setParsed] = useState(null);
  const [colMap, setColMap] = useState({});
  const [showMapping, setShowMapping] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState('');
  const [result, setResult] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isXLSX = /\.(xlsx|xls)$/i.test(file.name);

    if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = parseXLSX(new Uint8Array(ev.target.result));
        setParsed(data);
        setColMap(autoMap(data.headers));
        setShowMapping(true);
        setStep('preview');
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = parseCSV(ev.target.result);
        setParsed(data);
        setColMap(autoMap(data.headers));
        setShowMapping(true);
        setStep('preview');
      };
      reader.readAsText(file);
    }
  };

  const getVal = (row, field) => colMap[field] ? (row[colMap[field]] || '').trim() : '';

  const buildSummary = () => {
    if (!parsed) return null;
    const newTeamNames = new Set();
    const newSquadNames = new Set();
    const toCreate = [], toReconcile = [], invalid = [];

    parsed.rows.forEach(row => {
      const name = reformatName(getVal(row, 'name'));
      const email = getVal(row, 'email');
      const dob = normaliseDate(getVal(row, 'date_of_birth'));
      const teamName = getVal(row, 'team_name');
      const squadName = getVal(row, 'squad_name');

      if (!name) { invalid.push(row); return; }

      // Same person returning for a new season — matched by name+DOB or by
      // name+email. Revolutionise has no persistent ID across seasons, so this
      // is the most reliable signal available; reconciled below instead of
      // skipped, so their new team/season info actually lands without
      // manually redoing it for every returning player.
      // Name is required on every branch: families often reuse one parent
      // email across multiple kids' registrations, so an email-only match
      // (with no name check) could reconcile a sibling's row onto the wrong
      // existing member and overwrite their data.
      const existingMember = existingMembers.find(m => {
        const nameMatch = m.name?.toLowerCase() === name.toLowerCase();
        if (!nameMatch) return false;
        const dobMatch = dob && m.date_of_birth === dob;
        const emailMatch = email && email !== '' && m.email?.toLowerCase() === email.toLowerCase();
        return dobMatch || emailMatch;
      });

      if (existingMember) toReconcile.push({ row, existingMember });
      else toCreate.push(row);

      if (teamName && !existingTeams.some(t => t.team_name?.toLowerCase() === teamName.toLowerCase())) {
        newTeamNames.add(teamName);
      }
      if (squadName) newSquadNames.add(squadName);
    });

    return { toCreate, toReconcile, invalid, newTeams: [...newTeamNames], newSquads: [...newSquadNames] };
  };

  const doImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setImportLog('Starting import…');
    try {
      await runImport();
    } catch (err) {
      setImporting(false);
      setImportLog('');
      alert(`Import failed: ${err?.message || err}`);
    }
  };

  const runImport = async () => {

    const me = await db.auth.me();
    const summary = buildSummary();

    // Build team cache
    const teamCache = {};
    existingTeams.forEach(t => { teamCache[t.team_name?.toLowerCase()] = t.id; });

    // Build program_type lookup: team name → program type (from first matching row)
    const teamProgramType = {};
    parsed.rows.forEach(row => {
      const tName = getVal(row, 'team_name');
      const pt = normaliseProgramType(getVal(row, 'program_type'));
      if (tName && pt && !teamProgramType[tName.toLowerCase()]) {
        teamProgramType[tName.toLowerCase()] = pt;
      }
    });

    // Create missing teams
    setImportLog(`Creating ${summary.newTeams.length} new teams…`);
    for (const tName of summary.newTeams) {
      const pt = teamProgramType[tName.toLowerCase()];
      const t = await db.entities.Team.create({ team_name: tName, visibility: 'Club', status: 'Active', owner_user_email: me.email, owner_id: me.id, gender: detectTeamGender(tName), ...(pt ? { program_type: pt } : {}) });
      teamCache[tName.toLowerCase()] = t.id;
    }

    // Build squad cache
    const existingSquads = await db.entities.Squad.list('-created_date', 200).catch(() => []);
    const squadCache = {};
    existingSquads.forEach(s => { squadCache[s.name?.toLowerCase()] = s; });

    // Create missing squads
    const squadsToCreate = summary.newSquads.filter(sq => !squadCache[sq.toLowerCase()]);
    setImportLog(`Creating ${squadsToCreate.length} new squads…`);
    for (const sqName of squadsToCreate) {
      const sq = await db.entities.Squad.create({ name: sqName, visibility: 'Club', status: 'Active', owner_user_email: me.email, team_ids: '[]' });
      squadCache[sqName.toLowerCase()] = sq;
    }

    // Build member payloads
    const teamSquadLinks = {};
    const memberPayloads = [];
    const memberRowMeta = []; // track team/player info per row

    setImportLog(`Preparing ${summary.toCreate.length} members…`);
    for (const row of summary.toCreate) {
      const rawName = getVal(row, 'name');
      if (!rawName) continue;
      const name = reformatName(rawName);

      const teamName = getVal(row, 'team_name');
      const squadName = getVal(row, 'squad_name');
      const teamId = teamName ? teamCache[teamName.toLowerCase()] : '';

      if (teamId && squadName) teamSquadLinks[teamId] = squadName;

      const memberData = { name, visibility: 'Club', status: 'Active', owner_user_email: me.email, owner_id: me.id, ...buildMemberFieldsFromRow(row, getVal) };
      if (teamId) memberData.team_id = teamId;
      memberPayloads.push(memberData);
      memberRowMeta.push({
        name, teamId,
        email: memberData.email || '',
        dob: normaliseDate(getVal(row, 'date_of_birth')) || undefined,
        jersey: getVal(row, 'jersey_number') || undefined,
      });
    }

    // Match created rows back to their source row by (name+email+dob) rather than
    // array position — a bulk INSERT...RETURNING is not guaranteed to preserve
    // submission order, and matching by index could silently attach the wrong
    // team/player to the wrong member.
    const metaKey = (name, email, dob) => `${(name || '').toLowerCase()}|${(email || '').toLowerCase()}|${dob || ''}`;
    const metaQueueByKey = new Map();
    memberRowMeta.forEach(meta => {
      const k = metaKey(meta.name, meta.email, meta.dob);
      if (!metaQueueByKey.has(k)) metaQueueByKey.set(k, []);
      metaQueueByKey.get(k).push(meta);
    });

    // Bulk insert members in batches of 50 to avoid timeouts
    const BATCH = 50;
    const createdMembers = [];
    for (let i = 0; i < memberPayloads.length; i += BATCH) {
      setImportLog(`Creating members… ${Math.min(i + BATCH, memberPayloads.length)} / ${memberPayloads.length}`);
      const batch = await db.entities.Member.createMany(memberPayloads.slice(i, i + BATCH));
      createdMembers.push(...batch);
    }
    const createdMemberIds = createdMembers.map(m => m.id);
    let created = createdMembers.length;

    // Bulk insert player records in batches of 50
    setImportLog('Creating player records…');
    const playerPayloads = createdMembers
      .map((member) => {
        const k = metaKey(member.name, member.email, member.date_of_birth);
        const queue = metaQueueByKey.get(k);
        const meta = queue?.shift();
        if (!meta?.teamId) return null;
        return { name: meta.name, team_id: meta.teamId, member_id: member.id, visibility: 'Club', status: 'Active', owner_id: me.id, date_of_birth: meta.dob, jersey_number: meta.jersey };
      })
      .filter(Boolean);
    const createdPlayers = [];
    for (let i = 0; i < playerPayloads.length; i += BATCH) {
      setImportLog(`Creating player records… ${Math.min(i + BATCH, playerPayloads.length)} / ${playerPayloads.length}`);
      const batch = await db.entities.Player.createMany(playerPayloads.slice(i, i + BATCH)).catch(() => []);
      createdPlayers.push(...batch);
    }
    const createdPlayerIds = createdPlayers.map(p => p.id);

    // Reconcile returning members — matched by name+DOB or email above.
    // Update their existing Member row with this season's fresh info, then
    // either move/reactivate their existing Player row or create one if they
    // never had one, so session/attendance/notes history stays attached to
    // one continuous player record across seasons instead of forking into a
    // brand-new player row every year.
    setImportLog(`Reconciling ${summary.toReconcile.length} returning member${summary.toReconcile.length !== 1 ? 's' : ''}…`);
    const reconcileMeta = summary.toReconcile.map(({ row, existingMember }) => {
      const teamName = getVal(row, 'team_name');
      const squadName = getVal(row, 'squad_name');
      const teamId = teamName ? teamCache[teamName.toLowerCase()] : '';
      if (teamId && squadName) teamSquadLinks[teamId] = squadName;
      const memberUpdate = { status: 'Active', ...buildMemberFieldsFromRow(row, getVal) };
      if (teamId) memberUpdate.team_id = teamId;
      return {
        existingMember, memberUpdate, teamId,
        jersey: getVal(row, 'jersey_number') || undefined,
        dob: normaliseDate(getVal(row, 'date_of_birth')) || undefined,
      };
    });

    for (const { existingMember, memberUpdate } of reconcileMeta) {
      await db.entities.Member.update(existingMember.id, memberUpdate).catch(() => {});
    }

    // Fetch every reconciled member's existing Player row(s) in one batched
    // query rather than one query per member.
    const reconciledMemberIds = reconcileMeta.map(r => r.existingMember.id);
    const existingPlayersForReconciled = reconciledMemberIds.length
      ? await db.entities.Player.filter({ member_id: reconciledMemberIds }).catch(() => [])
      : [];
    const playersByMemberId = {};
    existingPlayersForReconciled.forEach(p => { (playersByMemberId[p.member_id] = playersByMemberId[p.member_id] || []).push(p); });

    let reconciled = 0;
    for (const { existingMember, teamId, jersey, dob } of reconcileMeta) {
      if (!teamId) { reconciled++; continue; } // member updated above; no team on this row to (re)assign
      const playerRow = (playersByMemberId[existingMember.id] || [])[0];
      if (playerRow) {
        await db.entities.Player.update(playerRow.id, {
          team_id: teamId, status: 'Active',
          ...(jersey ? { jersey_number: jersey } : {}),
          ...(dob ? { date_of_birth: dob } : {}),
        }).catch(() => {});
      } else {
        await db.entities.Player.create({
          name: existingMember.name, team_id: teamId, member_id: existingMember.id,
          visibility: 'Club', status: 'Active', owner_id: me.id, date_of_birth: dob, jersey_number: jersey,
        }).catch(() => {});
      }
      reconciled++;
    }

    // Link teams to squads
    setImportLog('Linking teams to squads…');
    for (const [teamId, squadName] of Object.entries(teamSquadLinks)) {
      const sq = squadCache[squadName.toLowerCase()];
      if (sq) {
        const currentIds = (() => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } })();
        if (!currentIds.includes(teamId)) {
          await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify([...currentIds, teamId]) });
          sq.team_ids = JSON.stringify([...currentIds, teamId]);
        }
      }
    }

    setImporting(false);
    const resultData = { created, reconciled, newTeams: summary.newTeams.length, newSquads: squadsToCreate.length, createdMemberIds, createdPlayerIds };
    setResult(resultData);
    // Save to import history in localStorage (keep last 10)
    try {
      const history = JSON.parse(localStorage.getItem('coachpad_import_history') || '[]');
      history.unshift({ id: Date.now(), date: new Date().toISOString(), ...resultData });
      localStorage.setItem('coachpad_import_history', JSON.stringify(history.slice(0, 10)));
    } catch {}
    setStep('done');
    onImported?.();
  };

  const summary = step === 'preview' ? buildSummary() : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-900">Import Members</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {step === 'upload' && (
          <div className="p-8 flex flex-col items-center gap-5">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Upload size={28} className="text-blue-600" />
            </div>
            <div className="text-center">
              <h4 className="font-bold text-slate-800 text-lg">Upload CSV or Excel File</h4>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Supports the Revolutionise Sport Teams Report (.xlsx) and any CSV export.
                Names in "Last, First" format are automatically converted.
              </p>
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 text-sm">
              Choose File
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={handleFile} className="hidden" />
          </div>
        )}

        {step === 'preview' && parsed && summary && (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-4">
                {[
                  { label: 'New Members', value: summary.toCreate.length, color: 'bg-green-50 text-green-800' },
                  { label: 'Returning Members', value: summary.toReconcile.length, color: 'bg-sky-50 text-sky-800' },
                  { label: 'New Teams', value: summary.newTeams.length, color: 'bg-blue-50 text-blue-800' },
                  { label: 'New Squads', value: summary.newSquads.length, color: 'bg-indigo-50 text-indigo-800' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                    <p className="text-2xl font-black">{s.value}</p>
                    <p className="text-xs font-semibold mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {summary.invalid.length > 0 && (
                <div className="mx-4 mb-3 bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-700">{summary.invalid.length} row{summary.invalid.length !== 1 ? 's' : ''} missing required Name — will be skipped.</p>
                </div>
              )}

              {(summary.newTeams.length > 0 || summary.newSquads.length > 0) && (
                <div className="mx-4 mb-3 bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                  {summary.newTeams.length > 0 && <p className="text-xs font-semibold text-blue-700">🏀 New teams will be created: {summary.newTeams.join(', ')}</p>}
                  {summary.newSquads.length > 0 && <p className="text-xs font-semibold text-indigo-700">📋 New squads will be created: {summary.newSquads.join(', ')}</p>}
                </div>
              )}

              {summary.toReconcile.length > 0 && (
                <div className="mx-4 mb-3 bg-sky-50 border border-sky-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-sky-700 mb-1">🔄 Returning members — matched by name+DOB or email, will be updated to this season's team and reactivated (not created again):</p>
                  <p className="text-xs text-sky-600">
                    {summary.toReconcile.slice(0, 5).map(({ row: r }) => colMap.name ? r[colMap.name] : '?').join(', ')}
                    {summary.toReconcile.length > 5 ? ` +${summary.toReconcile.length - 5} more` : ''}
                  </p>
                </div>
              )}

              <div className="px-4 pb-2">
                <button onClick={() => setShowMapping(v => !v)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 w-full text-left">
                  Column Mapping
                  {showMapping ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />}
                </button>
                {showMapping && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {FIELD_MAP.map(f => (
                      <div key={f.key} className="flex items-center gap-1.5">
                        <span title={f.label} className="text-xs text-slate-500 shrink-0 w-28 truncate">{f.label}{f.required ? ' *' : ''}:</span>
                        <select value={colMap[f.key] || ''} onChange={e => setColMap(m => ({ ...m, [f.key]: e.target.value }))}
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0">
                          <option value="">—</option>
                          {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 pb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preview (first 5 rows)</p>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Name', 'Team', 'Program', 'Jersey', 'DOB'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsed.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className={!getVal(row, 'name') ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2 text-slate-800 font-medium">{reformatName(getVal(row, 'name')) || <span className="text-red-500">Missing</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{getVal(row, 'team_name') || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{normaliseProgramType(getVal(row, 'program_type')) || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{getVal(row, 'jersey_number') || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{normaliseDate(getVal(row, 'date_of_birth')) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > 5 && <p className="text-xs text-slate-400 mt-1 text-center">+{parsed.rows.length - 5} more rows</p>}
              </div>
            </div>

            <div className="px-4 py-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => setStep('upload')} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 font-semibold">← Back</button>
              <button onClick={doImport} disabled={importing || (summary.toCreate.length === 0 && summary.toReconcile.length === 0)}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-50">
                {importing ? importLog || 'Importing…' : summary.toReconcile.length > 0
                  ? `Import ${summary.toCreate.length} new, update ${summary.toReconcile.length}`
                  : `Import ${summary.toCreate.length} Members`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div className="p-8 flex flex-col items-center gap-4">
            {undone ? (
              <>
                <CheckCircle size={48} className="text-amber-500" />
                <div className="text-center">
                  <h4 className="font-bold text-slate-900 text-lg">Import Undone</h4>
                  <p className="text-sm text-slate-600 mt-2">
                    {result.createdMemberIds.length} member{result.createdMemberIds.length !== 1 ? 's' : ''} and {result.createdPlayerIds.length} player record{result.createdPlayerIds.length !== 1 ? 's' : ''} have been deleted.
                  </p>
                </div>
                <button onClick={onClose} className="px-8 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-800">Close</button>
              </>
            ) : (
              <>
                <CheckCircle size={48} className="text-green-500" />
                <div className="text-center">
                  <h4 className="font-bold text-slate-900 text-lg">Import Complete!</h4>
                  <p className="text-sm text-slate-600 mt-2">
                    {result.created} member{result.created !== 1 ? 's' : ''} created
                    {result.newTeams > 0 ? `, ${result.newTeams} new team${result.newTeams !== 1 ? 's' : ''}` : ''}
                    {result.newSquads > 0 ? `, ${result.newSquads} new squad${result.newSquads !== 1 ? 's' : ''}` : ''}
                    {result.reconciled > 0 ? `, ${result.reconciled} returning member${result.reconciled !== 1 ? 's' : ''} updated & reassigned` : ''}.
                  </p>
                  {result.reconciled > 0 && (
                    <p className="text-xs text-slate-400 mt-1">Note: undo below only removes newly created records — returning members' updated info isn't reverted.</p>
                  )}
                </div>
                <button onClick={onClose} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">Done</button>
                <button
                  onClick={async () => {
                    setUndoing(true);
                    await Promise.all([
                      ...result.createdPlayerIds.map(id => db.entities.Player.delete(id).catch(() => {})),
                      ...result.createdMemberIds.map(id => db.entities.Member.delete(id).catch(() => {})),
                    ]);
                    setUndoing(false);
                    setUndone(true);
                    onImported?.();
                  }}
                  disabled={undoing}
                  className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                >
                  {undoing ? 'Undoing…' : 'Undo this import'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
