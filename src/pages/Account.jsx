import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Shield, Building2, KeyRound, LogOut, Check } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabaseClient';

export default function Account() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState('');

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const ROLE_LABELS = { admin: 'Club Admin', coach: 'Coach', jdo: 'JDO' };
  const ROLE_COLORS = { admin: 'bg-purple-100 text-purple-700', coach: 'bg-blue-100 text-blue-700', jdo: 'bg-green-100 text-green-700' };

  const saveName = async () => {
    if (!fullName.trim()) { setNameError('Name cannot be empty'); return; }
    setNameError('');
    setSaving(true);
    try {
      await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setNameError('Error saving: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwNew !== pwConfirm) { setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return; }
    if (pwNew.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    setPwSaving(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) {
      setPwMsg({ type: 'error', text: error.message });
    } else {
      setPwMsg({ type: 'success', text: 'Password updated successfully.' });
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    }
    setPwSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-slate-900">My Account</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Profile info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Profile</h2>

          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0">
              <span className="text-white font-black text-lg">
                {(fullName || user?.email || '?')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-bold text-slate-900">{fullName || 'No name set'}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              <User size={12} className="inline mr-1" />Full Name
            </label>
            <div className="flex gap-2">
              <input
                type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your full name"
              />
              <button onClick={saveName} disabled={saving}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5">
                {saved ? <><Check size={14} /> Saved</> : saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>

          {/* Email (read-only) */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              <Mail size={12} className="inline mr-1" />Email
            </label>
            <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
              {user?.email}
            </div>
          </div>

          {/* Role */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              <Shield size={12} className="inline mr-1" />Role
            </label>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-xl text-sm font-bold ${ROLE_COLORS[user?.role] || 'bg-slate-100 text-slate-600'}`}>
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
              <span className="text-xs text-slate-400">Assigned by your club administrator</span>
            </div>
          </div>

          {/* Club */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              <Building2 size={12} className="inline mr-1" />Club
            </label>
            <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
              Forestville Basketball
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            <KeyRound size={13} className="inline mr-1.5" />Change Password
          </h2>

          {pwMsg && (
            <div className={`mb-4 px-3 py-2.5 rounded-xl text-sm font-medium ${
              pwMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'
            }`}>{pwMsg.text}</div>
          )}

          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">New password</label>
              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} required
                placeholder="Min 8 characters"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Confirm new password</label>
              <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} required
                placeholder="Repeat new password"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={pwSaving}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Sign out */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <button onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-100 text-red-500 hover:bg-red-50 font-bold text-sm transition-colors">
            <LogOut size={16} />Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}
