import { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin, Clock, Users, CalendarDays, SlidersHorizontal, X, Search, LayoutList, Timer, CheckSquare, Check, Trash2, Pause, Plus } from 'lucide-react';
import { db } from '@/api/db';
import { Spinner } from './shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEL_CLS = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
const DAYS      = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HOUR_START = 6;
const HOUR_END   = 22;
const ROW_H      = 76;   // px per court row
const LABEL_W    = 148;  // px for sticky court label
const SLOT_H     = 60;   // px per 30-min (timeline y-axis)

const PALETTE = [
  { bg:'bg-blue-500',    light:'bg-blue-50',    text:'text-blue-700',    border:'border-blue-200',    solid:'#3b82f6' },
  { bg:'bg-violet-500',  light:'bg-violet-50',  text:'text-violet-700',  border:'border-violet-200',  solid:'#8b5cf6' },
  { bg:'bg-emerald-500', light:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200', solid:'#10b981' },
  { bg:'bg-orange-500',  light:'bg-orange-50',  text:'text-orange-700',  border:'border-orange-200',  solid:'#f97316' },
  { bg:'bg-rose-500',    light:'bg-rose-50',    text:'text-rose-700',    border:'border-rose-200',    solid:'#f43f5e' },
  { bg:'bg-cyan-500',    light:'bg-cyan-50',    text:'text-cyan-700',    border:'border-cyan-200',    solid:'#06b6d4' },
  { bg:'bg-amber-500',   light:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200',   solid:'#f59e0b' },
  { bg:'bg-pink-500',    light:'bg-pink-50',    text:'text-pink-700',    border:'border-pink-200',    solid:'#ec4899' },
  { bg:'bg-teal-500',    light:'bg-teal-50',    text:'text-teal-700',    border:'border-teal-200',    solid:'#14b8a6' },
  { bg:'bg-indigo-500',  light:'bg-indigo-50',  text:'text-indigo-700',  border:'border-indigo-200',  solid:'#6366f1' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getColor(id) {
  let h = 0;
  for (let i = 0; i < (id||'').length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function timeToMins(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

// The next real calendar date (today included) matching a recurring slot's weekday —
// e.g. "Wednesday" -> the coming Wednesday's actual date, for one-off "just this one" actions.
function nextOccurrenceDate(dayName) {
  const targetIdx = WEEKDAY_INDEX[dayName];
  if (targetIdx == null) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === targetIdx) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

function fmtDateNice(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function isPaused(alloc) {
  if (!alloc.pause_start || !alloc.pause_end) return false;
  const t = todayStr();
  return t >= alloc.pause_start && t <= alloc.pause_end;
}

// "Paused" with an override venue means the session still happens, just
// somewhere else — distinct from a plain pause (cancelled, no session).
function isMoved(alloc) {
  return isPaused(alloc) && !!alloc.override_venue_id;
}
function isCancelled(alloc) {
  return isPaused(alloc) && !alloc.override_venue_id;
}

function getSquadTeamIds(sq) {
  try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; }
}

// ── Court Gantt (main view) ───────────────────────────────────────────────────

function useHourWidth() {
  const [hourW, setHourW] = useState(() => window.innerWidth < 640 ? 52 : 80);
  useEffect(() => {
    const update = () => setHourW(window.innerWidth < 640 ? 52 : 80);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return hourW;
}

function detectOverlaps(allocs) {
  // Returns a Set of allocation IDs that overlap with at least one other on the same court
  const conflicting = new Set();
  for (let i = 0; i < allocs.length; i++) {
    for (let j = i + 1; j < allocs.length; j++) {
      const a = allocs[i], b = allocs[j];
      const sameVenue = (a.venue || 'Unassigned') === (b.venue || 'Unassigned');
      const sameCourt = String(a.court || '') === String(b.court || '');
      if (!sameVenue || !sameCourt) continue;
      const aStart = timeToMins(a.start_time), aEnd = timeToMins(a.end_time) || (aStart + 60);
      const bStart = timeToMins(b.start_time), bEnd = timeToMins(b.end_time) || (bStart + 60);
      if (aStart === null || bStart === null) continue;
      if (aStart < bEnd && aEnd > bStart) { conflicting.add(a.id); conflicting.add(b.id); }
    }
  }
  return conflicting;
}

function CourtGantt({ dayAllocs, allocInfo, onSelect, venueEntities }) {
  const scrollRef = useRef(null);
  const hourW = useHourWidth();
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const totalW = (HOUR_END - HOUR_START) * hourW;

  const conflictingIds = detectOverlaps(dayAllocs);

  // Build ordered court list: only courts that have allocations on this day
  const courtMap = new Map();
  dayAllocs.forEach(a => {
    const venue = a.venue || 'Unassigned';
    const court = a.court ? String(a.court) : '';
    const key   = `${venue}||${court}`;
    if (!courtMap.has(key)) courtMap.set(key, { venue, court });
  });

  const courts = [...courtMap.values()].sort((a, b) =>
    a.venue !== b.venue ? a.venue.localeCompare(b.venue) : a.court.localeCompare(b.court)
  );

  // Group allocations by court key
  const byCourtKey = {};
  dayAllocs.forEach(a => {
    const key = `${a.venue || 'Unassigned'}||${a.court ? String(a.court) : ''}`;
    (byCourtKey[key] = byCourtKey[key] || []).push(a);
  });

  // Auto-scroll to first slot
  useEffect(() => {
    if (!scrollRef.current || !dayAllocs.length) return;
    const earliest = dayAllocs.reduce((min, a) => {
      const m = timeToMins(a.start_time);
      return m !== null && m < min ? m : min;
    }, Infinity);
    if (earliest === Infinity) return;
    const x = ((earliest - HOUR_START * 60) / 60) * hourW;
    scrollRef.current.scrollLeft = Math.max(0, x - 100);
  }, [dayAllocs, hourW]);

  const venues = [...new Set(courts.map(c => c.venue))];

  if (courts.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
        <CalendarDays size={24} className="text-slate-300" />
      </div>
      <p className="text-slate-500 font-semibold text-sm">No sessions on this day</p>
      <p className="text-slate-400 text-xs">Pick another day above.</p>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Conflict banner */}
      {conflictingIds.size > 0 && (
        <div className="shrink-0 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
          <span className="text-red-500 text-base">⚠️</span>
          <p className="text-xs font-semibold text-red-700">
            {conflictingIds.size / 2 >= 1 ? `${Math.ceil(conflictingIds.size / 2)} court conflict${Math.ceil(conflictingIds.size / 2) > 1 ? 's' : ''}` : 'Court conflict'} — sessions overlap on the same court. Highlighted in red below.
          </p>
        </div>
      )}
    <div ref={scrollRef} className="flex-1 overflow-auto">
      {/* Minimum width so the grid never collapses */}
      <div style={{ minWidth: LABEL_W + totalW }}>

        {/* ── Time header — sticky top, corner also sticky left ── */}
        <div className="sticky top-0 z-30 flex bg-white border-b border-slate-200 shadow-sm">
          {/* Corner cell: sticky both top (from parent) and left */}
          <div className="sticky left-0 z-30 shrink-0 bg-white border-r border-slate-200"
            style={{ width: LABEL_W, height: 40 }} />
          {/* Hour labels */}
          <div className="flex" style={{ minWidth: totalW }}>
            {hours.map(h => (
              <div key={h} className="border-l border-slate-100 flex items-end pb-2 pl-2 shrink-0"
                style={{ width: hourW, height: 40 }}>
                <span className="text-[11px] text-slate-400 font-semibold select-none">
                  {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h-12} PM`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Venue groups ── */}
        {venues.map(venue => {
          const venueCourts = courts.filter(c => c.venue === venue);
          return (
            <div key={venue}>

              {/* Venue header row */}
              <div className="flex border-b border-t border-slate-200 bg-slate-50">
                {/* Venue label — sticky left */}
                <div className="sticky left-0 z-20 shrink-0 bg-slate-50 border-r border-slate-200
                                px-3 py-1.5 flex items-center gap-1.5" style={{ width: LABEL_W }}>
                  <MapPin size={11} className="text-slate-400 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{venue}</span>
                </div>
                {/* Extend venue stripe across full grid width */}
                <div className="bg-slate-50" style={{ minWidth: totalW }} />
              </div>

              {/* Court rows */}
              {venueCourts.map(({ court }) => {
                const key        = `${venue}||${court}`;
                const allocs     = byCourtKey[key] || [];
                const empty      = allocs.length === 0;
                const hasConflict = allocs.some(a => conflictingIds.has(a.id));
                return (
                  <div key={key} className={`flex border-b ${hasConflict ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>

                    {/* Court label — sticky left */}
                    <div className={`sticky left-0 z-20 shrink-0 border-r flex items-center px-3 gap-2
                                    ${hasConflict ? 'bg-red-50 border-red-200' : empty ? 'bg-slate-50/90 border-slate-200' : 'bg-white border-slate-200'}`}
                      style={{ width: LABEL_W, height: ROW_H }}>
                      <div className={`w-1.5 h-8 rounded-full shrink-0 ${hasConflict ? 'bg-red-400' : empty ? 'bg-slate-200' : 'bg-blue-400'}`} />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${hasConflict ? 'text-red-700' : empty ? 'text-slate-400' : 'text-slate-700'}`}>
                          {court ? `Court ${court}` : 'No Court'}
                        </p>
                        {hasConflict
                          ? <p className="text-[10px] text-red-500 font-semibold">⚠ Conflict</p>
                          : empty
                            ? <p className="text-[10px] text-slate-300 font-medium">Available</p>
                            : <p className="text-[10px] text-blue-500 font-semibold">{allocs.length} session{allocs.length > 1 ? 's' : ''}</p>
                        }
                      </div>
                    </div>

                    {/* Time grid + booking bars */}
                    <div className={`relative ${empty ? 'bg-slate-50/40' : 'bg-white'}`}
                      style={{ height: ROW_H, minWidth: totalW }}>

                      {/* Hour grid lines */}
                      {hours.map(h => (
                        <div key={h} className="absolute top-0 bottom-0 border-l border-slate-100"
                          style={{ left: (h - HOUR_START) * hourW }} />
                      ))}
                      {/* Half-hour lines */}
                      {hours.slice(0, -1).map(h => (
                        <div key={h} className="absolute top-0 bottom-0 border-l border-slate-50"
                          style={{ left: (h - HOUR_START) * hourW + hourW / 2 }} />
                      ))}

                      {/* Booking bars */}
                      {allocs.map(a => {
                        const startMins = timeToMins(a.start_time);
                        if (startMins === null) return null;
                        const endMins   = timeToMins(a.end_time) || (startMins + 60);
                        const left      = ((startMins - HOUR_START * 60) / 60) * hourW + 3;
                        const width     = Math.max(24, ((endMins - startMins) / 60) * hourW - 6);
                        const info      = allocInfo(a);
                        const narrow    = width < 80;
                        const conflict  = conflictingIds.has(a.id);
                        const paused    = isCancelled(a);
                        const moved     = isMoved(a);
                        return (
                          <button key={a.id} onClick={() => onSelect(a)}
                            style={{ position: 'absolute', left, top: 8, bottom: 8, width,
                              ...(conflict ? { outline: '2.5px solid #ef4444', outlineOffset: '1px' } : {}) }}
                            className={`rounded-2xl ${conflict ? 'bg-red-500' : info.color.bg} text-white px-2.5 flex flex-col justify-center
                                        overflow-hidden hover:opacity-90 active:scale-95 transition-all shadow-md ${paused ? 'opacity-50' : ''}`}>
                            {paused && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-400 flex items-center justify-center shadow">
                                <Pause size={9} className="text-red-950" fill="currentColor" />
                              </div>
                            )}
                            {moved && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center shadow">
                                <MapPin size={9} className="text-blue-950" fill="currentColor" />
                              </div>
                            )}
                            {conflict && !narrow && (
                              <p className="text-[9px] font-black text-white/90 leading-none mb-0.5 uppercase tracking-wide">⚠ Overlap</p>
                            )}
                            <p className="font-bold text-[12px] leading-tight truncate">{info.name}</p>
                            {!narrow && (
                              <p className="text-[10px] text-white/80 mt-0.5 leading-tight truncate">
                                {paused ? 'Cancelled' : moved ? 'Moved venue' : `${fmt12(a.start_time)} – ${fmt12(a.end_time)}`}
                              </p>
                            )}
                            {!narrow && !paused && !moved && info.ageGroup && (
                              <p className="text-[10px] text-white/70 leading-tight truncate">{info.ageGroup}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

// ── Timeline (by time) ────────────────────────────────────────────────────────

function layoutSlots(allocs) {
  const sorted = [...allocs].sort((a, b) => (a.start_time||'').localeCompare(b.start_time||''));
  const laneEnds = [];
  const assigned = [];
  for (const a of sorted) {
    const start = timeToMins(a.start_time);
    const end   = timeToMins(a.end_time) || (start !== null ? start + 60 : null);
    let lane = laneEnds.findIndex(e => e <= (start ?? 0));
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); }
    else laneEnds[lane] = end;
    assigned.push({ a, lane });
  }
  const total = Math.max(1, laneEnds.length);
  return assigned.map(({ a, lane }) => ({ alloc: a, lane, total }));
}

function Timeline({ allocs, allocInfo, onSelect }) {
  const scrollRef = useRef(null);
  const TOTAL_H = (HOUR_END - HOUR_START) * 2 * SLOT_H;
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  useEffect(() => {
    if (!scrollRef.current || !allocs.length) return;
    const earliest = allocs.reduce((min, a) => { const m = timeToMins(a.start_time); return m !== null && m < min ? m : min; }, Infinity);
    if (earliest === Infinity) return;
    scrollRef.current.scrollTop = Math.max(0, ((earliest - HOUR_START * 60) / 30) * SLOT_H - 80);
  }, [allocs]);

  const laid = layoutSlots(allocs);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="relative flex" style={{ height: TOTAL_H }}>
        <div className="shrink-0 bg-white border-r border-slate-100 relative" style={{ width: 52, height: TOTAL_H }}>
          {hours.map((h, i) => (
            <div key={h} className="absolute flex items-center justify-end pr-3"
              style={{ top: i * SLOT_H * 2 - 8, left: 0, width: 52 }}>
              <span className="text-[11px] text-slate-400 font-medium">
                {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h-12} PM`}
              </span>
            </div>
          ))}
        </div>
        <div className="flex-1 relative" style={{ height: TOTAL_H }}>
          {hours.map((_, i) => <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: i * SLOT_H * 2 }} />)}
          {hours.slice(0,-1).map((_, i) => <div key={i} className="absolute left-0 right-0 border-t border-slate-50" style={{ top: i * SLOT_H * 2 + SLOT_H }} />)}
          {laid.map(({ alloc: a, lane, total }) => {
            const startMins = timeToMins(a.start_time);
            if (startMins === null) return null;
            const endMins = timeToMins(a.end_time) || (startMins + 60);
            const top    = ((startMins - HOUR_START * 60) / 30) * SLOT_H;
            const height = Math.max(SLOT_H - 2, ((endMins - startMins) / 30) * SLOT_H - 4);
            const info   = allocInfo(a);
            const GAP = 3;
            const pct  = 100 / total;
            const short = height < 58;
            const paused = isCancelled(a);
            const moved = isMoved(a);
            return (
              <button key={a.id} onClick={() => onSelect(a)}
                style={{ position:'absolute', top: top+2, height, left:`calc(${lane*pct}% + ${GAP}px)`, width:`calc(${pct}% - ${GAP*2}px)` }}
                className={`rounded-2xl ${info.color.light} border ${info.color.border} hover:brightness-95 active:scale-[0.98] transition-all text-left overflow-hidden shadow-sm ${paused ? 'opacity-60' : ''}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${info.color.bg}`} />
                {paused && (
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-red-400 text-red-950 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    <Pause size={8} fill="currentColor" /> Cancelled
                  </div>
                )}
                {moved && (
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-blue-400 text-blue-950 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    <MapPin size={8} fill="currentColor" /> Moved
                  </div>
                )}
                <div className="pl-4 pr-2 pt-2 pb-2 h-full flex flex-col justify-center gap-0.5">
                  <p className={`font-bold text-[12px] leading-tight truncate ${info.color.text}`}>{info.name}</p>
                  {!short && a.start_time && <p className="text-[11px] text-slate-500 leading-tight font-medium">{fmt12(a.start_time)}{a.end_time ? ` – ${fmt12(a.end_time)}` : ''}</p>}
                  {!short && (a.venue || a.court) && <p className={`text-[11px] truncate leading-tight ${info.color.text} opacity-70`}>📍 {[a.venue, a.court ? `Court ${a.court}` : null].filter(Boolean).join(' · ')}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ activeDays, byDay, allocInfo, onSelect, total, selectMode, selectedIds, onToggleSelect }) {
  if (!activeDays.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center"><CalendarDays size={24} className="text-slate-300" /></div>
      <p className="text-slate-500 font-semibold text-sm">No sessions match</p>
      <p className="text-slate-400 text-xs">Adjust your filters or add allocations in a Team or Squad profile.</p>
    </div>
  );
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        <p className="text-xs text-slate-400">{total} training slot{total !== 1 ? 's' : ''}</p>
        {activeDays.map(day => (
          <div key={day}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">{day}</h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{byDay[day].length}</span>
            </div>
            <div className="space-y-2">
              {byDay[day].map(a => {
                const info = allocInfo(a);
                const timeStr = a.start_time ? `${fmt12(a.start_time)}${a.end_time ? ` – ${fmt12(a.end_time)}` : ''}` : null;
                const checked = selectedIds?.has(a.id);
                return (
                  <button key={a.id} onClick={() => selectMode ? onToggleSelect(a.id) : onSelect(a)}
                    className={`w-full text-left flex items-center gap-3 bg-white rounded-2xl border px-4 py-3.5 transition-all group ${
                      checked ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200 hover:shadow-sm'
                    }`}>
                    {selectMode && (
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {checked && <Check size={12} className="text-white" />}
                      </div>
                    )}
                    <div className={`w-1.5 self-stretch rounded-full shrink-0 ${info.color.bg}`} />
                    <div className={`w-9 h-9 ${info.color.bg} text-white rounded-xl flex items-center justify-center font-black text-xs shrink-0`}>{info.name?.substring(0,2).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900 text-sm truncate">{info.name}</p>
                        {isCancelled(a) && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full shrink-0">🚫 Cancelled</span>}
                        {isMoved(a) && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0">📍 Moved</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {timeStr && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={11}/>{timeStr}</span>}
                        {a.venue && <span className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={11}/>{a.venue}{a.court ? ` · Court ${a.court}` : ''}</span>}
                      </div>
                    </div>
                    {!selectMode && <span className="text-slate-300 group-hover:text-blue-400 transition-colors">→</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Slot detail drawer ────────────────────────────────────────────────────────

function SlotDetail({ alloc, info, venueEntities, courts, onClose, onProfileClick, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    day: alloc.day || '',
    start_time: alloc.start_time || '',
    end_time: alloc.end_time || '',
    venue_id: alloc.venue_id || '',
    court_id: alloc.court_id || '',
    pause_start: alloc.pause_start || '',
    pause_end: alloc.pause_end || '',
    override_venue_id: alloc.override_venue_id || '',
    override_court_id: alloc.override_court_id || '',
  }));
  const [note, setNote] = useState('');
  const [deleteNote, setDeleteNote] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  // null | 'choose' | 'cancel' | 'move' — one quick-action button expands into
  // a chooser instead of adding separate top-level buttons for each option.
  const [adjustMode, setAdjustMode] = useState(null);
  const [skipNote, setSkipNote] = useState('');
  const [skipping, setSkipping] = useState(false);
  const [moveVenueId, setMoveVenueId] = useState('');
  const [moveCourtId, setMoveCourtId] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [moving, setMoving] = useState(false);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const filteredCourts = courts.filter(c => !form.venue_id || c.venue_id === form.venue_id);
  const filteredMoveCourts = courts.filter(c => !moveVenueId || c.venue_id === moveVenueId);

  const nextDate = nextOccurrenceDate(alloc.day);
  const nextDateInPause = !!(alloc.pause_start && alloc.pause_end && nextDate >= alloc.pause_start && nextDate <= alloc.pause_end);

  const confirmSkip = async () => {
    setSkipping(true);
    setError('');
    try {
      await onSave(alloc.id, {
        day: alloc.day,
        start_time: alloc.start_time || '',
        end_time: alloc.end_time || '',
        venue_id: alloc.venue_id || '',
        court_id: alloc.court_id || '',
        pause_start: nextDate,
        pause_end: nextDate,
        override_venue_id: '',
        override_court_id: '',
        pending_note: skipNote.trim() || null,
      });
      setAdjustMode(null);
    } catch (e) {
      setError(e.message || 'Failed to skip. Please try again.');
    } finally {
      setSkipping(false);
    }
  };

  const confirmMove = async () => {
    if (!moveVenueId) { setError('Pick a venue.'); return; }
    setMoving(true);
    setError('');
    try {
      await onSave(alloc.id, {
        day: alloc.day,
        start_time: alloc.start_time || '',
        end_time: alloc.end_time || '',
        venue_id: alloc.venue_id || '',
        court_id: alloc.court_id || '',
        pause_start: nextDate,
        pause_end: nextDate,
        override_venue_id: moveVenueId,
        override_court_id: moveCourtId || '',
        pending_note: moveNote.trim() || null,
      });
      setAdjustMode(null);
    } catch (e) {
      setError(e.message || 'Failed to move. Please try again.');
    } finally {
      setMoving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(alloc.id, { ...form, pending_note: note.trim() || null });
      setEditing(false);
    } catch (e) {
      setError(e.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteClick = async () => {
    setDeleting(true);
    setError('');
    try {
      await onDelete(alloc.id, deleteNote.trim() || null);
    } catch (e) {
      setError(e.message || 'Failed to delete. Please try again.');
      setDeleting(false);
    }
  };

  const timeStr  = alloc.start_time ? `${fmt12(alloc.start_time)}${alloc.end_time ? ` – ${fmt12(alloc.end_time)}` : ''}` : null;
  const duration = alloc.start_time && alloc.end_time ? (() => { const d = timeToMins(alloc.end_time) - timeToMins(alloc.start_time); return d > 0 ? `${d} min` : null; })() : null;

  if (editing) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
        <div className="bg-white rounded-t-3xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Edit {info.name}</h2>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18}/></button>
          </div>
          <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Day</label>
              <select value={form.day} onChange={e => upd('day', e.target.value)} className={SEL_CLS}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Start</label>
                <input type="time" value={form.start_time} onChange={e => upd('start_time', e.target.value)} className={SEL_CLS} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">End</label>
                <input type="time" value={form.end_time} onChange={e => upd('end_time', e.target.value)} className={SEL_CLS} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Venue</label>
              <select value={form.venue_id} onChange={e => { upd('venue_id', e.target.value); upd('court_id', ''); }} className={SEL_CLS}>
                <option value="">— No venue —</option>
                {venueEntities.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            {filteredCourts.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Court</label>
                <select value={form.court_id} onChange={e => upd('court_id', e.target.value)} className={SEL_CLS}>
                  <option value="">— No court —</option>
                  {filteredCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Cancel training (optional)</label>
              <p className="text-xs text-slate-400 mb-2">Cancel this recurring slot between two dates — e.g. school holidays or a venue closure. It resumes automatically after the end date.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">From</label>
                  <input type="date" value={form.pause_start} onChange={e => upd('pause_start', e.target.value)} className={SEL_CLS} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Until</label>
                  <input type="date" value={form.pause_end} onChange={e => upd('pause_end', e.target.value)} className={SEL_CLS} />
                </div>
              </div>
              {(form.pause_start || form.pause_end) && (
                <button onClick={() => { upd('pause_start', ''); upd('pause_end', ''); upd('override_venue_id', ''); upd('override_court_id', ''); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold mt-2">
                  Clear cancel/move dates
                </button>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Message to coaches (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="e.g. Sorry for the short notice — the court's being resurfaced."
                className={`${SEL_CLS} resize-none`} />
              <p className="text-xs text-slate-400 mt-1">Sent alongside the automatic notification coaches get whenever this changes.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="px-5 pb-6 pt-1 flex gap-3 border-t border-slate-100">
            <button onClick={() => setEditing(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
            <button onClick={save} disabled={saving || !form.day} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className={`${info.color.bg} px-5 pt-5 pb-5 rounded-t-3xl`}>
          <div className="flex items-start justify-between mb-1">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">{info.isSquad ? 'Squad' : 'Team'} · {alloc.day}</p>
            <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded-lg bg-white/10"><X size={16}/></button>
          </div>
          <h2 className="text-white font-black text-2xl leading-tight">{info.name}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {info.ageGroup && <span className="text-white/80 text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">{info.ageGroup}</span>}
            {duration     && <span className="text-white/80 text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">{duration}</span>}
            {isCancelled(alloc) && <span className="text-xs font-bold bg-red-400 text-red-950 px-2 py-0.5 rounded-full">🚫 Cancelled now</span>}
            {isMoved(alloc) && <span className="text-xs font-bold bg-blue-400 text-blue-950 px-2 py-0.5 rounded-full">📍 Moved now</span>}
          </div>
        </div>
        <div className="px-5 py-5 space-y-4">
          {(alloc.pause_start || alloc.pause_end) && (
            alloc.override_venue_id ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                Moved to <strong>{venueEntities.find(v => v.id === alloc.override_venue_id)?.name || 'a different venue'}</strong>{alloc.override_court_id ? <> · <strong>{courts.find(c => c.id === alloc.override_court_id)?.name}</strong></> : null} on <strong>{fmtDateNice(alloc.pause_start)}</strong>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-800">
                Cancelled from <strong>{alloc.pause_start || '—'}</strong> to <strong>{alloc.pause_end || '—'}</strong>
              </div>
            )
          )}
          {timeStr && (
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 ${info.color.light} ${info.color.border} border rounded-2xl flex items-center justify-center shrink-0`}><Clock size={16} className={info.color.text}/></div>
              <div><p className="text-xs text-slate-400 font-medium">Time</p><p className="text-sm font-bold text-slate-800">{timeStr}</p></div>
            </div>
          )}
          {(alloc.venue || alloc.court) && (
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 ${info.color.light} ${info.color.border} border rounded-2xl flex items-center justify-center shrink-0`}><MapPin size={16} className={info.color.text}/></div>
              <div><p className="text-xs text-slate-400 font-medium">Location</p><p className="text-sm font-bold text-slate-800">{[alloc.venue, alloc.court ? `Court ${alloc.court}` : null].filter(Boolean).join(' · ')}</p></div>
            </div>
          )}
          {info.coaches.length > 0 && (
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 ${info.color.light} ${info.color.border} border rounded-2xl flex items-center justify-center shrink-0`}><Users size={16} className={info.color.text}/></div>
              <div><p className="text-xs text-slate-400 font-medium">Coach{info.coaches.length > 1 ? 'es' : ''}</p><p className="text-sm font-bold text-slate-800">{info.coaches.map(c => c.full_name || c.email).join(', ')}</p></div>
            </div>
          )}
        </div>
        <div className="px-5 pb-8 pt-1 space-y-2">
          <button onClick={() => { if (info.isSquad && info.squad) onProfileClick?.('squad', info.squad); else if (info.team) onProfileClick?.('team', info.team); onClose(); }}
            className={`w-full py-3.5 ${info.color.bg} text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity`}>
            View {info.isSquad ? 'Squad' : 'Team'} Profile →
          </button>

          {nextDate && !nextDateInPause && !adjustMode && (
            <button onClick={() => setAdjustMode('choose')}
              className="w-full py-3 border border-amber-200 bg-amber-50 rounded-2xl text-sm font-bold text-amber-700 hover:bg-amber-100 flex items-center justify-center gap-1.5">
              <Pause size={14}/> Change {fmtDateNice(nextDate)}
            </button>
          )}

          {adjustMode === 'choose' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-bold text-slate-600">
                Just for {fmtDateNice(nextDate)} — every other week keeps running as normal.
              </p>
              <button onClick={() => setAdjustMode('cancel')}
                className="w-full py-2.5 px-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50 flex items-center gap-2">
                <Pause size={14} className="text-amber-600 shrink-0"/> Cancel this date
              </button>
              <button onClick={() => setAdjustMode('move')}
                className="w-full py-2.5 px-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 flex items-center gap-2">
                <MapPin size={14} className="text-blue-600 shrink-0"/> Move to a different venue
              </button>
              <button onClick={() => setAdjustMode(null)} className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-600 text-center">
                Never mind
              </button>
            </div>
          )}

          {adjustMode === 'cancel' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-bold text-amber-800">
                Cancels only {fmtDateNice(nextDate)} — every other week keeps running as normal.
              </p>
              <textarea value={skipNote} onChange={e => setSkipNote(e.target.value)} rows={2}
                placeholder="e.g. Venue unavailable this week (optional)"
                className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setAdjustMode('choose'); setError(''); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Back</button>
                <button onClick={confirmSkip} disabled={skipping} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50">
                  {skipping ? 'Cancelling…' : `Cancel ${fmtDateNice(nextDate)}`}
                </button>
              </div>
            </div>
          )}

          {adjustMode === 'move' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-bold text-blue-800">
                Moves only {fmtDateNice(nextDate)} to a different venue — every other week stays at {alloc.venue || 'the usual venue'}.
              </p>
              <select value={moveVenueId} onChange={e => { setMoveVenueId(e.target.value); setMoveCourtId(''); }}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="">— Select venue —</option>
                {venueEntities.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {filteredMoveCourts.length > 0 && (
                <select value={moveCourtId} onChange={e => setMoveCourtId(e.target.value)}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="">— No specific court —</option>
                  {filteredMoveCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <textarea value={moveNote} onChange={e => setMoveNote(e.target.value)} rows={2}
                placeholder="e.g. Usual court is unavailable this week (optional)"
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setAdjustMode('choose'); setError(''); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Back</button>
                <button onClick={confirmMove} disabled={moving || !moveVenueId} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                  {moving ? 'Moving…' : `Move ${fmtDateNice(nextDate)}`}
                </button>
              </div>
            </div>
          )}

          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-2">
              <label className="text-xs font-bold text-red-700 uppercase tracking-wider block mb-1.5">Message to coaches (optional)</label>
              <textarea value={deleteNote} onChange={e => setDeleteNote(e.target.value)} rows={2}
                placeholder="e.g. Cancelled due to the venue closure — sorry for the disruption."
                className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white resize-none" />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)}
              className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-50">
              Edit
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="flex-1 py-3 border border-red-200 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5">
                <Trash2 size={14}/> Delete
              </button>
            ) : (
              <button onClick={confirmDeleteClick} disabled={deleting}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bulk move modal ───────────────────────────────────────────────────────────

function BulkMoveModal({ count, venueEntities, courts, onClose, onApply }) {
  const [venueId, setVenueId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [changeTime, setChangeTime] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCourts = courts.filter(c => !venueId || c.venue_id === venueId);

  const apply = async () => {
    setSaving(true);
    await onApply({ venueId, courtId, changeTime, startTime, endTime });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
          <h2 className="font-bold text-slate-900">Move {count} training slot{count !== 1 ? 's' : ''}</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">New venue *</label>
            <select value={venueId} onChange={e => { setVenueId(e.target.value); setCourtId(''); }} className={SEL_CLS}>
              <option value="">— Select venue —</option>
              {venueEntities.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {filteredCourts.length > 0 && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Court</label>
              <select value={courtId} onChange={e => setCourtId(e.target.value)} className={SEL_CLS}>
                <option value="">— No specific court —</option>
                {filteredCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={changeTime} onChange={e => setChangeTime(e.target.checked)} className="rounded" />
            Also change start/end time for all selected
          </label>
          {changeTime && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Start</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={SEL_CLS} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">End</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={SEL_CLS} />
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400">
            Day and team/squad assignment stay the same for all selected sessions — only the venue{filteredCourts.length ? '/court' : ''}{changeTime ? ' and time' : ''} will change.
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={apply} disabled={saving || !venueId} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Moving…' : `Move ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TrainingScheduleTab({ onProfileClick, onAddTraining, refreshTrigger }) {
  const [allocations,   setAllocations]   = useState([]);
  const [teams,         setTeams]         = useState([]);
  const [squads,        setSquads]        = useState([]);
  const [access,        setAccess]        = useState([]);
  const [users,         setUsers]         = useState([]);
  const [venueEntities, setVenueEntities] = useState([]);
  const [courts,        setCourts]        = useState([]);
  const [loading,       setLoading]       = useState(true);

  const [view,        setView]        = useState('court'); // 'court' | 'time' | 'list'
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [search,      setSearch]      = useState('');
  const [filterVenue,    setFilterVenue]    = useState('');
  const [filterSquad,    setFilterSquad]    = useState('');
  const [filterCoach,    setFilterCoach]    = useState('');
  const [filterAgeGroup, setFilterAgeGroup] = useState('');
  const [showFilters,    setShowFilters]    = useState(false);
  const [selectedAlloc,  setSelectedAlloc]  = useState(null);
  const [selectMode,     setSelectMode]     = useState(false);
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [showBulkMove,   setShowBulkMove]   = useState(false);

  useEffect(() => {
    Promise.all([
      db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000).catch(() => []),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
      db.entities.UserTeamAccess.list('-created_date', 500).catch(() => []),
      db.entities.User.list('-created_date', 200).catch(() => []),
      db.entities.Venue.list('name', 200).catch(() => []),
      db.entities.Court.list('name', 200).catch(() => []),
    ]).then(([a, t, sq, acc, u, vs, cs]) => {
      setAllocations(a); setTeams(t); setSquads(sq); setAccess(acc); setUsers(u); setVenueEntities(vs); setCourts(cs);
      const first = DAYS.find(d => a.some(al => al.day === d));
      if (first) setSelectedDay(first);
      setLoading(false);
    });
  }, [refreshTrigger]);

  const toggleSelectId = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const saveAlloc = async (id, form) => {
    const selectedVenue = venueEntities.find(v => v.id === form.venue_id);
    const selectedCourt = courts.find(c => c.id === form.court_id);
    const payload = {
      day: form.day,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      venue_id: form.venue_id || null,
      court_id: form.court_id || null,
      venue: selectedVenue?.name || '',
      court: selectedCourt?.name || '',
      pause_start: form.pause_start || null,
      pause_end: form.pause_end || null,
      override_venue_id: form.override_venue_id || null,
      override_court_id: form.override_court_id || null,
      pending_note: form.pending_note ?? null,
    };
    await db.entities.TrainingAllocation.update(id, payload);
    setAllocations(prev => prev.map(a => a.id === id ? { ...a, ...payload } : a));
    setSelectedAlloc(null);
  };

  const deleteAlloc = async (id, note) => {
    // A note on a row about to be deleted only reaches the notification
    // webhook if it's on the row when the DELETE fires — so write it first
    // (this update alone doesn't trigger a notification: pending_note isn't
    // in WATCHED_FIELDS), then delete.
    if (note) {
      await db.entities.TrainingAllocation.update(id, { pending_note: note }).catch(() => {});
    }
    await db.entities.TrainingAllocation.delete(id);
    setAllocations(prev => prev.filter(a => a.id !== id));
    setSelectedAlloc(null);
  };

  const applyBulkMove = async ({ venueId, courtId, changeTime, startTime, endTime }) => {
    const selectedVenue = venueEntities.find(v => v.id === venueId);
    const selectedCourt = courts.find(c => c.id === courtId);
    const payload = {
      venue_id: venueId || null,
      court_id: courtId || null,
      venue: selectedVenue?.name || '',
      court: selectedCourt?.name || '',
      ...(changeTime ? { start_time: startTime || null, end_time: endTime || null } : {}),
    };
    const ids = [...selectedIds];
    await Promise.all(ids.map(id => db.entities.TrainingAllocation.update(id, payload).catch(() => {})));
    setAllocations(prev => prev.map(a => ids.includes(a.id) ? { ...a, ...payload } : a));
    setShowBulkMove(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const getSquadById       = id => squads.find(s => s.id === id);
  const getTeamById        = id => teams.find(t => t.id === id);
  const getSquadForTeam    = teamId => squads.find(sq => getSquadTeamIds(sq).includes(teamId));
  const getCoachesForTeam  = teamId => { const es = access.filter(a => a.team_id === teamId).map(a => a.user_email); return users.filter(u => es.includes(u.email)); };
  const getCoachesForSquad = squadId => { const sq = getSquadById(squadId); if (!sq) return []; const tids = getSquadTeamIds(sq); const es = [...new Set(access.filter(a => tids.includes(a.team_id)).map(a => a.user_email))]; return users.filter(u => es.includes(u.email)); };

  const displayAllocations = useMemo(() => {
    const squadIdsWithAllocs = new Set(allocations.filter(a => a.allocation_type === 'Squad').map(a => a.squad_id));
    return allocations.filter(a => {
      if (a.allocation_type === 'Squad') return true;
      const sq = getSquadForTeam(a.team_id);
      return !sq || !squadIdsWithAllocs.has(sq.id);
    });
  }, [allocations, squads]);

  const venues    = useMemo(() => [...new Set([...venueEntities.map(v => v.name), ...allocations.map(a => a.venue).filter(Boolean)])].sort(), [venueEntities, allocations]);
  const ageGroups = useMemo(() => [...new Set([...teams.map(t => t.age_group), ...squads.map(s => s.age_group)].filter(Boolean))].sort(), [teams, squads]);
  const coachUsers = useMemo(() => users.filter(u => access.some(a => a.user_email === u.email)), [users, access]);

  const filtered = useMemo(() => displayAllocations.filter(a => {
    if (filterVenue    && (a.venue||'').toLowerCase() !== filterVenue.toLowerCase()) return false;
    if (filterSquad) {
      if (a.allocation_type === 'Squad' && a.squad_id !== filterSquad) return false;
      if (a.allocation_type === 'Team') { const sq = getSquadForTeam(a.team_id); if (!sq || sq.id !== filterSquad) return false; }
    }
    if (filterAgeGroup) { const e = a.allocation_type === 'Squad' ? getSquadById(a.squad_id) : getTeamById(a.team_id); if (!e || e.age_group !== filterAgeGroup) return false; }
    if (filterCoach)    { const cs = a.allocation_type === 'Squad' ? getCoachesForSquad(a.squad_id) : getCoachesForTeam(a.team_id); if (!cs.some(c => c.email === filterCoach)) return false; }
    if (search) {
      const q = search.toLowerCase();
      const name = a.allocation_type === 'Squad' ? (getSquadById(a.squad_id)?.name||'') : (getTeamById(a.team_id)?.team_name||'');
      if (!name.toLowerCase().includes(q) && !(a.venue||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [displayAllocations, filterVenue, filterSquad, filterAgeGroup, filterCoach, search, squads, teams, access, users]);

  const byDay = useMemo(() => DAYS.reduce((acc, day) => {
    acc[day] = filtered.filter(a => a.day === day).sort((a, b) => (a.start_time||'').localeCompare(b.start_time||''));
    return acc;
  }, {}), [filtered]);

  const activeDays = DAYS.filter(d => byDay[d]?.length > 0);

  const allocInfo = a => {
    const isSquad  = a.allocation_type === 'Squad';
    const squad    = isSquad ? getSquadById(a.squad_id) : null;
    const team     = !isSquad ? getTeamById(a.team_id)  : null;
    const name     = isSquad ? (squad?.name || '—') : (team?.team_name || '—');
    const ageGroup = isSquad ? squad?.age_group : team?.age_group;
    const coaches  = isSquad ? getCoachesForSquad(a.squad_id) : getCoachesForTeam(a.team_id);
    const color    = getColor(isSquad ? a.squad_id : a.team_id);
    return { isSquad, squad, team, name, ageGroup, coaches, color };
  };

  const hasFilters        = filterVenue || filterSquad || filterCoach || filterAgeGroup;
  const activeFilterCount = [filterVenue, filterSquad, filterCoach, filterAgeGroup].filter(Boolean).length;
  const clearFilters      = () => { setFilterVenue(''); setFilterSquad(''); setFilterCoach(''); setFilterAgeGroup(''); };
  const SEL = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  useEffect(() => { if (view !== 'list') { setSelectMode(false); setSelectedIds(new Set()); } }, [view]);

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams or venues…"
            className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setShowFilters(true)}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${activeFilterCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && <span className="bg-white text-blue-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">{activeFilterCount}</span>}
        </button>
        {onAddTraining && (
          <button onClick={onAddTraining} title="Add Training"
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 bg-blue-600 text-white hover:bg-blue-700">
            <Plus size={14} />
            <span className="hidden sm:inline">Add Training</span>
          </button>
        )}
        {/* View toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0 gap-0.5">
          <button onClick={() => setView('court')} title="By court"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === 'court' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            Courts
          </button>
          <button onClick={() => setView('time')} title="By time"
            className={`p-1.5 rounded-lg transition-colors ${view === 'time' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <Timer size={15} />
          </button>
          <button onClick={() => setView('list')} title="List"
            className={`p-1.5 rounded-lg transition-colors ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutList size={15} />
          </button>
        </div>
        {view === 'list' && (
          <button onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <CheckSquare size={14} />
            <span className="hidden sm:inline">{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
        )}
      </div>

      {/* Day strip (Court + Time views) */}
      {view !== 'list' && (
        <div className="bg-white border-b border-slate-100 shrink-0 overflow-x-auto">
          <div className="flex px-1">
            {DAYS.map((day, i) => {
              const count  = byDay[day]?.length || 0;
              const active = selectedDay === day;
              return (
                <button key={day} onClick={() => setSelectedDay(day)}
                  className={`flex flex-col items-center px-2 py-2.5 relative transition-colors flex-1 min-w-0 ${
                    active ? 'text-blue-600' : count > 0 ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300'
                  }`}>
                  <span className="text-[11px] font-bold uppercase tracking-wide">{DAY_SHORT[i]}</span>
                  <span className={`mt-1 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ${
                    count === 0 ? 'text-slate-200' : active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>{count || '·'}</span>
                  {active && <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 rounded-t" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      {view === 'court' && (
        <CourtGantt
          key={selectedDay}
          dayAllocs={byDay[selectedDay] || []}
          allocInfo={allocInfo}
          onSelect={setSelectedAlloc}
          venueEntities={venueEntities}
        />
      )}
      {view === 'time' && (
        byDay[selectedDay]?.length > 0
          ? <Timeline key={selectedDay} allocs={byDay[selectedDay]} allocInfo={allocInfo} onSelect={setSelectedAlloc} />
          : <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center"><CalendarDays size={24} className="text-slate-300"/></div>
              <p className="text-slate-500 font-semibold text-sm">No sessions on {selectedDay}</p>
            </div>
      )}
      {view === 'list' && (
        <ListView activeDays={activeDays} byDay={byDay} allocInfo={allocInfo} onSelect={setSelectedAlloc} total={filtered.length}
          selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelectId} />
      )}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Clear</button>
            <button onClick={() => setShowBulkMove(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">Move…</button>
          </div>
        </div>
      )}

      {/* Filters drawer */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={() => setShowFilters(false)}>
          <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18}/></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { label:'Venue',     val:filterVenue,    set:setFilterVenue,    opts:venues.map(v=>({v,l:v})) },
                { label:'Squad',     val:filterSquad,    set:setFilterSquad,    opts:squads.filter(s=>s.status!=='Archived').map(s=>({v:s.id,l:s.name})) },
                { label:'Coach',     val:filterCoach,    set:setFilterCoach,    opts:coachUsers.map(c=>({v:c.email,l:c.full_name||c.email})) },
                { label:'Age Group', val:filterAgeGroup, set:setFilterAgeGroup, opts:ageGroups.map(ag=>({v:ag,l:ag})) },
              ].map(({ label, val, set, opts }) => (
                <div key={label}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">{label}</label>
                  <select value={val} onChange={e => set(e.target.value)} className={SEL}>
                    <option value="">All {label}s</option>
                    {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="px-5 pb-6 flex gap-3">
              {hasFilters && <button onClick={() => { clearFilters(); setShowFilters(false); }} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear All</button>}
              <button onClick={() => setShowFilters(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">Done</button>
            </div>
          </div>
        </div>
      )}

      {selectedAlloc && (
        <SlotDetail alloc={selectedAlloc} info={allocInfo(selectedAlloc)} venueEntities={venueEntities} courts={courts}
          onClose={() => setSelectedAlloc(null)} onProfileClick={onProfileClick} onSave={saveAlloc} onDelete={deleteAlloc} />
      )}

      {showBulkMove && (
        <BulkMoveModal count={selectedIds.size} venueEntities={venueEntities} courts={courts}
          onClose={() => setShowBulkMove(false)} onApply={applyBulkMove} />
      )}
    </div>
  );
}

