import { useState, useEffect, useMemo } from 'react';
import { X, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '@/api/db';
import { supabase } from '@/api/supabaseClient';
import { resolveRecipients } from '@/lib/emailTargeting';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// audience: 'members' | 'coaches'
// targetType/targetIds: the same vocabulary emailTargeting.js resolves —
// 'all' | 'team' | 'squad' | 'role' | 'individual'
export default function EmailComposeModal({ audience, targetType, targetIds = [], targetLabel, onClose }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [pool, setPool] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showSender, setShowSender] = useState(false);
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');

  useEffect(() => {
    const poolPromise = audience === 'members'
      ? Promise.all([
          db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
          db.entities.Squad.list('-created_date', 200).catch(() => []),
        ]).then(([members, squads]) => ({ members, squads }))
      : Promise.all([
          db.entities.User.list('-created_date', 500).catch(() => []),
          db.entities.UserTeamAccess.list('-created_date', 1000).catch(() => []),
          db.entities.Squad.list('-created_date', 200).catch(() => []),
        ]).then(([profiles, userTeamAccess, squads]) => ({ profiles, userTeamAccess, squads }));

    Promise.all([
      db.entities.EmailTemplate.filter({ audience }, '-created_date', 100).catch(() => []),
      poolPromise,
      db.auth.me().catch(() => null),
    ]).then(([tpls, poolData, me]) => {
      setTemplates(tpls);
      setPool(poolData);
      if (me?.full_name) setFromName(me.full_name);
      if (me?.email) setReplyTo(me.email);
      setLoading(false);
    });
  }, [audience]);

  const recipients = useMemo(() => {
    if (!pool) return [];
    return resolveRecipients(audience, targetType, targetIds, pool);
  }, [pool, audience, targetType, targetIds]);

  const reachable = recipients.filter(r => r.reachable);
  const unreachableCount = recipients.length - reachable.length;

  const applyTemplate = (id) => {
    setSelectedTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setError('Subject and message are required.'); return; }
    if (reachable.length === 0) { setError('No recipients with a valid email address.'); return; }
    setSending(true);
    setError('');
    try {
      let templateId = selectedTemplateId || null;
      if (saveAsTemplate && templateName.trim()) {
        const tpl = await db.entities.EmailTemplate.create({ name: templateName.trim(), subject, body, audience });
        templateId = tpl.id;
      }

      const emailRow = await db.entities.Email.create({
        template_id: templateId,
        subject,
        body,
        audience,
        target_type: targetType,
        target_ids: targetIds,
        recipient_count: reachable.length,
        status: 'Draft',
        ...(showSender && fromName.trim() ? { from_name: fromName.trim() } : {}),
        ...(showSender && replyTo.trim() ? { reply_to: replyTo.trim() } : {}),
      });

      await Promise.all(reachable.map(r => db.entities.EmailRecipient.create({
        email_id: emailRow.id,
        member_id: r.member_id || null,
        profile_id: r.profile_id || null,
        recipient_name: r.name,
        recipient_email: r.email,
        status: 'Pending',
      })));

      const { data: sendResult, error: fnError } = await supabase.functions.invoke('send-email', { body: { emailId: emailRow.id } });
      if (fnError) throw new Error(fnError.message || 'Failed to reach the send function.');
      if (sendResult?.error) throw new Error(sendResult.error);
      setResult(sendResult);
    } catch (e) {
      setError(e.message || 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
          {result.status === 'Sent' ? (
            <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
          ) : (
            <AlertTriangle size={40} className="text-amber-500 mx-auto mb-3" />
          )}
          <h2 className="font-bold text-slate-900 text-lg mb-1">
            {result.status === 'Sent' ? 'Email sent' : result.status === 'Partial' ? 'Partially sent' : 'Send failed'}
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            {result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ''}.
          </p>
          <button onClick={onClose} className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><Mail size={16} /> Email {targetLabel || (audience === 'members' ? 'Members' : 'Coaches')}</h2>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <span className="font-bold text-slate-800">{reachable.length}</span> <span className="text-slate-500">recipient{reachable.length !== 1 ? 's' : ''} will receive this</span>
                {unreachableCount > 0 && (
                  <span className="text-amber-600"> · {unreachableCount} skipped (no email on file)</span>
                )}
              </div>

              <div>
                {!showSender ? (
                  <button onClick={() => setShowSender(true)} className="text-xs text-blue-600 font-semibold hover:underline">
                    Send this one as yourself instead of CoachPad →
                  </button>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Personalize sender</label>
                      <button onClick={() => setShowSender(false)} className="text-xs text-slate-400 hover:text-slate-600">Use CoachPad instead</button>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Shown as</label>
                      <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="e.g. Isabella - Head Coach" className={IC} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Replies go to</label>
                      <input value={replyTo} onChange={e => setReplyTo(e.target.value)} type="email" placeholder="you@example.com" className={IC} />
                    </div>
                    <p className="text-xs text-slate-400">
                      The email address it sends from stays the same (that's a Resend/domain requirement) — but recipients see this name, and replying goes straight to you.
                    </p>
                  </div>
                )}
              </div>

              {templates.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Start from a template (optional)</label>
                  <select value={selectedTemplateId} onChange={e => applyTemplate(e.target.value)} className={IC}>
                    <option value="">— Write from scratch —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Training update this week" className={IC} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="Write your message…" className={`${IC} resize-none`} />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={saveAsTemplate} onChange={e => setSaveAsTemplate(e.target.checked)} className="rounded" />
                Save this as a reusable template
              </label>
              {saveAsTemplate && (
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name" className={IC} />
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={send} disabled={loading || sending || reachable.length === 0}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
            {sending ? 'Sending…' : `Send to ${reachable.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
