import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { db } from '@/api/db';

const STATUSES = ['Present', 'Absent', 'Late', 'Injured', 'Excused'];

const STATUS_STYLE = {
  Present: 'bg-green-600 text-white border-green-600',
  Absent: 'bg-red-600 text-white border-red-600',
  Late: 'bg-amber-500 text-white border-amber-500',
  Injured: 'bg-pink-600 text-white border-pink-600',
  Excused: 'bg-blue-600 text-white border-blue-600',
};

export default function AttendancePanel({ session, user, onClose, onSaved }) {
  const [players, setPlayers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!session?.team_id) { setLoading(false); return; }
      const [p, existing] = await Promise.all([
        db.entities.Player.filter({ team_id: session.team_id, status: 'Active' }).catch(() => []),
        db.entities.AttendanceRecord.filter({ session_id: session.id }).catch(() => []),
      ]);
      setPlayers(p);
      const map = {};
      existing.forEach(r => { map[r.player_id] = { status: r.status, id: r.id }; });
      setAttendance(map);
      setLoading(false);
    };
    load();
  }, [session?.id]);

  const mark = (playerId, status) => {
    setAttendance(prev => ({ ...prev, [playerId]: { ...prev[playerId], status } }));
  };

  const markAll = (status) => {
    const map = {};
    players.forEach(p => { map[p.id] = { ...attendance[p.id], status }; });
    setAttendance(map);
  };

  const save = async () => {
    setSaving(true);
    try {
      const date = session.date || new Date().toISOString().split('T')[0];
      for (const player of players) {
        const entry = attendance[player.id];
        const status = entry?.status || 'Present';
        if (entry?.id) {
          await db.entities.AttendanceRecord.update(entry.id, { status });
        } else {
          await db.entities.AttendanceRecord.create({
            session_id: session.id,
            team_id: session.team_id,
            player_id: player.id,
            coach_id: user?.id,
            status,
            date,
          });
        }
      }
      onSaved ? onSaved() : onClose();
    } catch (e) {
      alert('Error saving attendance: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h3 className="font-bold text-white text-base">Attendance</h3>
            <p className="text-xs text-slate-400 mt-0.5">{session?.session_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Quick mark all */}
        <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 mr-1">Mark all:</span>
          {['Present', 'Absent'].map(s => (
            <button key={s} onClick={() => markAll(s)}
              className="text-xs px-3 py-1 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 font-semibold transition-colors">
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-6 h-6 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No active players found for this team.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {players.map(p => {
              const status = attendance[p.id]?.status || '';
              return (
                <div key={p.id} className="bg-slate-700/60 rounded-xl p-3">
                  <p className="text-white font-semibold text-sm mb-2">
                    {p.jersey_number ? `#${p.jersey_number} ` : ''}{p.name}
                    {p.position && <span className="text-slate-400 font-normal text-xs ml-1">· {p.position}</span>}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {STATUSES.map(s => (
                      <button key={s} onClick={() => mark(p.id, s)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                          status === s ? STATUS_STYLE[s] : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-4 py-4 border-t border-slate-700 shrink-0">
          <button onClick={save} disabled={saving || players.length === 0}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : `Save Attendance (${players.length} players)`}
          </button>
        </div>
      </div>
    </div>
  );
}