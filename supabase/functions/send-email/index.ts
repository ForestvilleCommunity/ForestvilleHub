// ============================================================
// send-email — Supabase Edge Function
//
// Sends a previously-created `emails` row via Resend, one message per row
// in `email_recipients` (already inserted as 'Pending' by the compose UI),
// updating each recipient's status and the parent email's overall status
// (Sent/Partial/Failed) once done.
//
// Unlike notify-session-change/notify-schedule-change, this isn't triggered
// by a database change — it's called directly by an admin via
// supabase.functions.invoke() right after composing an email, authenticated
// by their own session JWT. No webhook secret involved; instead this
// function verifies the caller is a logged-in admin itself before sending
// anything, since it dispatches real email to real people.
//
// This is also the first function in this project called directly from a
// browser (the others fire server-to-server, from pg_net or a webhook) —
// supabase.functions.invoke() sends an Authorization header, which makes
// the browser preflight with an OPTIONS request first. Every response path
// below needs CORS headers, and OPTIONS must be answered before any auth
// checks run, or the browser blocks the real request before it's even sent.
//
// ── Deployment ──────────────────────────────────────────────
// Dashboard → Edge Functions → New Function → name it exactly `send-email`,
// paste this file, deploy. Secrets — reuse RESEND_API_KEY / RESEND_FROM_EMAIL
// already set for notify-session-change / notify-schedule-change; no new
// secrets needed.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'CoachPad <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY is not configured on this function.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Verify the caller is a logged-in admin — this function sends real email
  // to real people, so being merely authenticated isn't enough.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single();
  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const body = await req.json().catch(() => null);
  const emailId = body?.emailId;
  if (!emailId) {
    return json({ error: 'emailId is required' }, 400);
  }

  const { data: email, error: emailErr } = await supabase.from('emails').select('*').eq('id', emailId).single();
  if (emailErr || !email) {
    return json({ error: emailErr ? `Failed to load email: ${emailErr.message}` : 'Email not found' }, emailErr ? 500 : 404);
  }

  const { data: recipients, error: recErr } = await supabase
    .from('email_recipients')
    .select('*')
    .eq('email_id', emailId)
    .eq('status', 'Pending');
  if (recErr) {
    return json({ error: recErr.message }, 500);
  }

  await supabase.from('emails').update({ status: 'Sending' }).eq('id', emailId);

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients || []) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: recipient.recipient_email,
          subject: email.subject,
          text: email.body,
        }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (res.ok) {
        sentCount++;
        await supabase.from('email_recipients').update({
          status: 'Sent',
          sent_at: new Date().toISOString(),
          provider_message_id: resJson?.id || null,
        }).eq('id', recipient.id);
      } else {
        failedCount++;
        await supabase.from('email_recipients').update({
          status: 'Failed',
          error_message: resJson?.message || `HTTP ${res.status}`,
        }).eq('id', recipient.id);
      }
    } catch (err: any) {
      failedCount++;
      await supabase.from('email_recipients').update({
        status: 'Failed',
        error_message: err?.message || 'Unknown error',
      }).eq('id', recipient.id);
    }
  }

  const finalStatus = failedCount === 0 ? 'Sent' : sentCount === 0 ? 'Failed' : 'Partial';
  await supabase.from('emails').update({ status: finalStatus, sent_at: new Date().toISOString() }).eq('id', emailId);

  return json({ sent: sentCount, failed: failedCount, status: finalStatus });
});
