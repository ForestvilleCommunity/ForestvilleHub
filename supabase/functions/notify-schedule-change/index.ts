// ============================================================
// notify-schedule-change — Supabase Edge Function
//
// Fires when a Database Webhook posts a training_allocations INSERT,
// UPDATE, or DELETE here (the recurring weekly team/squad schedule, edited
// only by admins — see rls.sql). Writes an in-app `notifications` row for
// every affected coach, emails them via Resend, and pushes a real Web Push
// notification to every device they've opted into. Structurally mirrors
// notify-session-change/index.ts — same infra, different trigger table.
//
// Also handles pausing/resuming a recurring slot (pause_start/pause_end
// columns) and an optional admin note (pending_note column) that gets
// folded into whichever notification fires next for that row — the
// frontend sets it in the same update/delete call as the actual change so
// it rides along without needing a second, separately-authenticated call.
//
// ── Deployment (there's no Supabase CLI in this checkout, so do this
//    from wherever you have it installed, or paste the code via the
//    Dashboard) ──────────────────────────────────────────────────────
// 1. `supabase functions deploy notify-schedule-change`
//    (or: Dashboard → Edge Functions → paste this file over the existing one)
// 2. Secrets — reuse the SAME values already set for notify-session-change
//    (RESEND_API_KEY, WEBHOOK_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
//    no new secrets needed.
// 3. The existing Database Webhook (table: training_allocations, events:
//    Insert + Update + Delete) doesn't need any changes.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'CoachPad <onboarding@resend.dev>';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@forestville-hub.example', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// NOTE: the live column is `day` (schema.sql's `day_of_week` is stale docs —
// every UI component reads/writes `day`; confirmed against the deployed DB).
// pending_note is deliberately excluded here — setting a note by itself
// shouldn't fire a notification, only ride along with an actual change below.
const WATCHED_FIELDS = ['day', 'start_time', 'end_time', 'venue_id', 'court_id', 'pause_start', 'pause_end', 'override_venue_id', 'override_court_id'];

function resolveTeamIds(record: any, squadTeamIdsJson?: string | null) {
  const teamIds = new Set<string>();
  if (record.team_id) teamIds.add(record.team_id);
  if (squadTeamIdsJson) {
    try { JSON.parse(squadTeamIdsJson).forEach((id: string) => teamIds.add(id)); } catch { /* ignore malformed JSON */ }
  }
  return teamIds;
}

async function dispatchToRecipients(
  supabase: ReturnType<typeof createClient>,
  { teamIds, subject, message, type }: { teamIds: Set<string>; subject: string; message: string; type: string },
): Promise<string> {
  if (teamIds.size === 0) return 'skip:no-team-ids';

  const { data: access, error: accessErr } = await supabase.from('user_team_access').select('user_id').in('team_id', Array.from(teamIds));
  if (accessErr) return `error:access:${accessErr.message}`;
  const recipientIds = new Set((access || []).map((a: any) => a.user_id));
  if (recipientIds.size === 0) return `skip:no-recipients(teamIds=${Array.from(teamIds).join(',')})`;

  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', Array.from(recipientIds));
  if (profilesErr) return `error:profiles:${profilesErr.message}`;

  if (!profiles || profiles.length === 0) return `skip:no-profiles(recipientIds=${Array.from(recipientIds).join(',')})`;

  let sent = 0;
  let lastError = '';
  for (const profile of profiles) {
    const { data: notification, error: insertErr } = await supabase
      .from('notifications')
      .insert({ recipient_id: profile.id, session_id: null, type, message })
      .select()
      .single();
    if (insertErr) { lastError = insertErr.message; continue; }
    sent++;

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
          subject,
          text: message,
        }),
      });
      if (emailRes.ok && notification) {
        await supabase.from('notifications').update({ email_sent: true }).eq('id', notification.id);
      }
    }

    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', profile.id);

      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: subject, body: message, url: '/schedule' }),
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }
  }

  return sent > 0 ? `ok:sent-${sent}` : `error:insert-failed:${lastError}`;
}

Deno.serve(async (req) => {
  // Fail closed: if WEBHOOK_SECRET isn't configured, refuse every request
  // rather than silently accepting unauthenticated ones.
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rawBody = await req.text();
  const payload = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
  if (!payload) return new Response(`skip:bad-json:${rawBody.slice(0, 200)}`, { status: 200 });
  if (payload.table !== 'training_allocations') return new Response(`skip:wrong-table:${payload.table}`, { status: 200 });

  const isInsert = payload.type === 'INSERT';
  const isDelete = payload.type === 'DELETE';
  const isUpdate = payload.type === 'UPDATE';
  if (!isInsert && !isDelete && !isUpdate) {
    return new Response(`skip:wrong-type:${payload.type}`, { status: 200 });
  }

  const record = payload.record || payload.old_record; // DELETE has no `record`
  const oldRecord = payload.old_record || {};
  if (!record) return new Response('skip:no-record', { status: 200 });

  if (isUpdate) {
    const changed = WATCHED_FIELDS.filter((f) => record[f] !== oldRecord[f]);
    if (changed.length === 0) return new Response('skip:no-watched-change', { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const [venueRes, courtRes, teamRes, squadRes, overrideVenueRes, overrideCourtRes] = await Promise.all([
    record.venue_id ? supabase.from('venues').select('name').eq('id', record.venue_id).single() : Promise.resolve({ data: null }),
    record.court_id ? supabase.from('courts').select('name').eq('id', record.court_id).single() : Promise.resolve({ data: null }),
    record.team_id ? supabase.from('teams').select('team_name').eq('id', record.team_id).single() : Promise.resolve({ data: null }),
    record.squad_id ? supabase.from('squads').select('name, team_ids').eq('id', record.squad_id).single() : Promise.resolve({ data: null }),
    record.override_venue_id ? supabase.from('venues').select('name').eq('id', record.override_venue_id).single() : Promise.resolve({ data: null }),
    record.override_court_id ? supabase.from('courts').select('name').eq('id', record.override_court_id).single() : Promise.resolve({ data: null }),
  ]);
  const venueName = venueRes.data?.name;
  const courtName = courtRes.data?.name;
  const entityName = teamRes.data?.team_name || squadRes.data?.name || 'Your team';
  const overrideVenueName = overrideVenueRes.data?.name;
  const overrideCourtName = overrideCourtRes.data?.name;

  const whereText = `${venueName || 'a venue'}${courtName ? ` (${courtName})` : ''}`;
  const whenText = `${record.day || 'a day'}${record.start_time ? ` at ${record.start_time}` : ''}`;

  const wasPaused = !!(oldRecord.pause_start && oldRecord.pause_end);
  const isPausedNow = !!(record.pause_start && record.pause_end);
  const isMovedNow = isPausedNow && !!record.override_venue_id;
  const pauseJustSet = isPausedNow && !isMovedNow && (record.pause_start !== oldRecord.pause_start || record.pause_end !== oldRecord.pause_end);
  const moveJustSet = isMovedNow && (record.pause_start !== oldRecord.pause_start || record.pause_end !== oldRecord.pause_end || record.override_venue_id !== oldRecord.override_venue_id || record.override_court_id !== oldRecord.override_court_id);
  const pauseJustCleared = wasPaused && !isPausedNow;

  let type: string, subject: string, message: string;

  if (isInsert) {
    type = 'schedule_added';
    subject = 'New training added';
    message = `A new training slot was added for ${entityName}: ${whenText}, ${whereText}.`;
  } else if (isDelete) {
    type = 'schedule_removed';
    subject = 'Training cancelled';
    message = `The training slot for ${entityName} (${whenText}, ${whereText}) has been cancelled.`;
  } else if (moveJustSet) {
    type = 'schedule_moved';
    subject = 'Training venue changed for one date';
    const overrideWhere = `${overrideVenueName || 'a different venue'}${overrideCourtName ? ` (${overrideCourtName})` : ''}`;
    message = `Training for ${entityName} (${whenText}) is moving to ${overrideWhere} on ${record.pause_start} only — every other week stays at ${whereText}.`;
  } else if (pauseJustSet) {
    type = 'schedule_paused';
    subject = 'Training cancelled for a date';
    message = `Training for ${entityName} (${whenText}) is cancelled from ${record.pause_start} to ${record.pause_end}.`;
  } else if (pauseJustCleared) {
    type = 'schedule_resumed';
    subject = 'Training resumed';
    message = `Training for ${entityName} (${whenText}) has resumed as normal.`;
  } else {
    type = 'schedule_updated';
    subject = 'Training schedule changed';
    const changeDescriptions: string[] = [];
    if (record.day !== oldRecord.day || record.start_time !== oldRecord.start_time || record.end_time !== oldRecord.end_time) {
      changeDescriptions.push(`time is now ${whenText}`);
    }
    if (record.venue_id !== oldRecord.venue_id || record.court_id !== oldRecord.court_id) {
      changeDescriptions.push(`venue is now ${whereText}`);
    }
    message = `The training schedule for ${entityName} has changed: ${changeDescriptions.join(', ')}.`;
  }

  if (record.pending_note && String(record.pending_note).trim()) {
    message += ` Note from admin: "${String(record.pending_note).trim()}"`;
  }

  const teamIds = resolveTeamIds(record, squadRes.data?.team_ids);
  if (teamIds.size === 0) {
    return new Response(
      `skip:no-team-ids;squad_id=${record.squad_id};team_id=${record.team_id};squad_data=${JSON.stringify(squadRes.data)};squad_err=${(squadRes as any).error?.message || 'none'}`,
      { status: 200 },
    );
  }

  const result = await dispatchToRecipients(supabase, { teamIds, subject, message, type });

  return new Response(result, { status: 200 });
});
