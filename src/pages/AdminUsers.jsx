import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShieldAlert, UserX, UserCheck, Loader2 } from 'lucide-react';
import { db } from '@/api/db';
import { format } from 'date-fns';

const STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Suspended: 'bg-red-100 text-red-700',
  'Pending Deletion': 'bg-amber-100 text-amber-700',
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    db.auth.me().then(u => {
      if (u?.role !== 'admin') { navigate('/'); return; }
      setCurrentUser(u);
      loadUsers();
    }).catch(() => navigate('/'));
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const list = await db.entities.User.list('-created_date', 200);
    setUsers(list);
    setLoading(false);
  };

  const setStatus = async (userId, status) => {
    setUpdatingId(userId);
    await db.entities.User.update(userId, { account_status: status });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, account_status: status } : u));
    setUpdatingId(null);
  };

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col" style={{ zIndex: 100 }}>
      {/* Header */}
      <div className="bg-slate-950 text-white px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <ShieldAlert size={18} className="text-orange-400" />
          <h1 className="font-bold text-lg">User Management</h1>
        </div>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">Admin Only</span>
      </div>

      {/* Privacy notice */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <p className="text-xs text-amber-700 font-medium">
          ⚠️ You can manage account status here. Private coaching data is not shown to protect coach privacy.
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">No users found</p>
        ) : filtered.map(u => {
          const status = u.account_status || 'Active';
          const isUpdating = updatingId === u.id;
          const isSelf = u.id === currentUser?.id;
          return (
            <div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                  {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm">{u.full_name || '—'}</p>
                    {u.role === 'admin' && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Admin</span>
                    )}
                    {isSelf && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">You</span>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.Active}`}>{status}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{u.email}</p>
                  {u.created_date && (
                    <p className="text-xs text-slate-300 mt-0.5">
                      Joined {format(new Date(u.created_date), 'd MMM yyyy')}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions — don't show for self */}
              {!isSelf && !isUpdating && (
                <div className="flex gap-2 mt-3">
                  {status !== 'Active' && (
                    <button onClick={() => setStatus(u.id, 'Active')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold transition-colors">
                      <UserCheck size={13} /> Activate
                    </button>
                  )}
                  {status !== 'Suspended' && (
                    <button onClick={() => setStatus(u.id, 'Suspended')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold transition-colors">
                      <UserX size={13} /> Suspend
                    </button>
                  )}
                  {status !== 'Pending Deletion' && (
                    <button onClick={() => setStatus(u.id, 'Pending Deletion')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-semibold transition-colors">
                      Mark for Deletion
                    </button>
                  )}
                </div>
              )}
              {isUpdating && (
                <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" /> Updating...
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border-t border-slate-200 px-4 py-3 text-center">
        <p className="text-xs text-slate-400">{filtered.length} user{filtered.length !== 1 ? 's' : ''} shown</p>
      </div>
    </div>
  );
}