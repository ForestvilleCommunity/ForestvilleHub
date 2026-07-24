import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ type: 'error', text: error.message });
      // On success, AuthContext onAuthStateChange fires and redirects automatically

    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Check your email to confirm your account, then log in.' });
        setMode('login');
      }

    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
        setMode('login');
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center">
            <span className="text-white font-black text-lg">CP</span>
          </div>
          <div>
            <p className="text-white font-black text-2xl leading-none">CoachPad</p>
            <p className="text-slate-400 text-xs">Basketball coaching platform</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-5">
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create an account' : 'Reset password'}
          </h2>

          {message && (
            <div className={`mb-4 px-3 py-2.5 rounded-xl text-sm font-medium ${
              message.type === 'error'
                ? 'bg-red-900/40 border border-red-700/50 text-red-300'
                : 'bg-green-900/40 border border-green-700/50 text-green-300'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="coach@club.com"
                className="live-input w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required={mode !== 'reset'}
                  placeholder="••••••••"
                  className="live-input w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset email'}
            </button>
          </form>

          {/* Mode switchers */}
          <div className="mt-5 space-y-2 text-center">
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('reset'); setMessage(null); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors block w-full">
                  Forgot password?
                </button>
                <button onClick={() => { setMode('signup'); setMessage(null); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors block w-full">
                  Don't have an account? <span className="text-blue-400 font-semibold">Sign up</span>
                </button>
              </>
            )}
            {mode !== 'login' && (
              <button onClick={() => { setMode('login'); setMessage(null); }}
                className="text-xs text-slate-400 hover:text-white transition-colors">
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">CoachPad · Forestville Basketball</p>
      </div>
    </div>
  );
}
