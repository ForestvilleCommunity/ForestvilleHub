// ============================================================
// notify-session-change — Supabase Edge Function
//
// Fires when a Database Webhook (not a SQL trigger, so it can call an
// email API) posts a session UPDATE payload here. Diffs venue/court/
// start_time/status against the previous row, writes an in-app
// `notifications` row for every coach on the team, and emails them
// via Resend.
//
// ── Deployment (there's no Supabase CLI in this checkout, so do this
//    from wherever you have it installed, or paste the code via the
//    Dashboard) ──────────────────────────────────────────────────────
// 1. `supabase functions deploy notify-session-change`
//    (or: Dashboard → Edge Functions → New Function → paste this file)
// 2. Set secrets on the function:
//      supabase secrets set RESEND_API_KEY=<your Resend API key>
//      supabase secrets set WEBHOOK_SECRET=<any random string you pick>
//    (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected already.)
//    Sign up for Resend and generate the API key yourself at resend.com —
//    that's an account only you can create.
// 3. Dashboard → Database → Webhooks → Create a new webhook:
//      table: sessions, event: Update, type: Supabase Edge Functions,
//      function: notify-session-change,
//      HTTP header: x-webhook-secret: <the same value as step 2>
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'CoachPad <onboarding@resend.dev>';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

const WATCHED_FIELDS = ['venue_id', 'court_id', 'start_time', 'status'];

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || payload.table !== 'sessions' || payload.type !== 'UPDATE') {
    return new Response('ok', { status: 200 });
  }

  const record = payload.record;
  const oldRecord = payload.old_record || {};
  const changed = WATCHED_FIELDS.filter(f => record[f] !== oldRecord[f]);
  if (changed.length === 0) {
    return new Response('ok', { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const [venueRes, courtRes] = await Promise.all([
    record.venue_id
      ? supabase.from('venues').select('name, address').eq('id', record.venue_id).single()
      : Promise.resolve({ data: null }),
    record.court_id
      ? supabase.from('courts').select('name').eq('id', record.court_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const venueName = venueRes.data?.name;
  const courtName = courtRes.data?.name;

  const isCancelled = record.status === 'Cancelled' && oldRecord.status !== 'Cancelled';
  const type = isCancelled ? 'session_cancelled' : 'session_updated';

  const changeDescriptions = [];
  if (changed.includes('status') && !isCancelled) changeDescriptions.push(`status is now ${record.status}`);
  if (changed.includes('venue_id') || changed.includes('court_id')) {
    changeDescriptions.push(`venue is now ${venueName || 'unset'}${courtName ? ` (${courtName})` : ''}`);
  }
  if (changed.includes('start_time')) {
    changeDescriptions.push(`start time is now ${record.start_time || 'unset'}`);
  }

  const message = isCancelled
    ? `Your training "${record.session_name}" on ${record.date} has been cancelled.`
    : `Your training "${record.session_name}" on ${record.date} has changed: ${changeDescriptions.join(', ')}.`;

  // Recipients: coaches assigned to the team (user_team_access) + the session owner
  const recipientIds = new Set();
  if (record.owner_id) recipientIds.add(record.owner_id);
  if (record.team_id) {
    const { data: access } = await supabase.from('user_team_access').select('user_id').eq('team_id', record.team_id);
    (access || []).forEach(a => recipientIds.add(a.user_id));
  }
  if (recipientIds.size === 0) {
    return new Response('ok', { status: 200 });
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', Array.from(recipientIds));

  for (const profile of profiles || []) {
    const { data: notification } = await supabase
      .from('notifications')
      .insert({ recipient_id: profile.id, session_id: record.id, type, message })
      .select()
      .single();

    if (RESEND_API_KEY && profile.email) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: profile.email,
          subject: isCancelled ? 'Training cancelled' : 'Training details changed',
          text: message,
        }),
      });
      if (emailRes.ok && notification) {
        await supabase.from('notifications').update({ email_sent: true }).eq('id', notification.id);
      }
    }
  }

  return new Response('ok', { status: 200 });
});
