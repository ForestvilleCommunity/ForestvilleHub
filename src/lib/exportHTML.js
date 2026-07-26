// Clean HTML-to-print exports (opens in new tab → Print → Save as PDF)
import { renderPhasesToSVGStrings } from './whiteboardExport';

function printWindow(title, bodyHTML) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; padding: 32px 40px; max-width: 760px; margin: 0 auto; font-size: 14px; line-height: 1.5; }
    h1 { font-size: 26px; font-weight: 800; margin-bottom: 4px; }
    h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 24px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px; color: #64748b; font-size: 13px; margin-top: 6px; margin-bottom: 20px; }
    .meta span { display: flex; align-items: center; gap: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-orange { background: #fed7aa; color: #c2410c; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-slate { background: #f1f5f9; color: #475569; }
    .row { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: none; }
    .num { width: 32px; height: 32px; border-radius: 8px; background: #0f172a; color: #fff; font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; shrink: 0; flex-shrink: 0; }
    .row-name { font-weight: 600; font-size: 14px; }
    .row-meta { font-size: 12px; color: #94a3b8; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .starter { background: #0f172a; border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; }
    .starter .num2 { width: 28px; height: 28px; border-radius: 6px; background: #f97316; color: #fff; font-weight: 800; font-size: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .starter .name { color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    pre, .pre { white-space: pre-wrap; background: #f8fafc; border-radius: 8px; padding: 12px; font-size: 13px; color: #334155; border: 1px solid #e2e8f0; }
    .goal-row { display: flex; gap: 12px; font-size: 12px; }
    .goal-cell { flex: 1; background: #f8fafc; border-radius: 6px; padding: 6px 8px; }
    .goal-label { color: #94a3b8; font-weight: 600; font-size: 10px; text-transform: uppercase; }
    .goal-val { color: #1e293b; font-weight: 700; margin-top: 2px; }
    img.preview { width: 100%; max-height: 220px; object-fit: cover; border-radius: 10px; margin-bottom: 16px; }
    footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-align: center; }
    @media print { body { padding: 20px; } @page { margin: 1cm; } }
  </style>
</head>
<body>
${bodyHTML}
<footer>Exported by CoachPad · ${new Date().toLocaleDateString()}</footer>
<script>setTimeout(() => window.print(), 400);</script>
</body>
</html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

// Escapes for both HTML text content AND "double-quoted" attribute values —
// quotes must be escaped too, or a value like a coach-entered video_url
// containing a `"` can break out of `href="${esc(...)}"` and inject markup.
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── DRILL EXPORT ─────────────────────────────────────────────────────────────
export function exportDrill(drill) {
  const levelLabel = { 1: 'L1 · Beginner', 2: 'L2 · Intermediate', 3: 'L3 · Advanced' }[drill.level] || '';
  const typeBadge = drill.item_type === 'Play' ? 'badge-orange' : 'badge-blue';

  let body = `
<h1>${esc(drill.name)}</h1>
<div class="meta">
  ${drill.item_type ? `<span><span class="badge ${typeBadge}">${esc(drill.item_type)}</span></span>` : ''}
  ${drill.theme ? `<span><span class="badge badge-slate">${esc(drill.theme)}</span></span>` : ''}
  ${drill.level ? `<span><span class="badge badge-slate">${esc(levelLabel)}</span></span>` : ''}
  ${drill.age_group ? `<span>👤 ${esc(drill.age_group)}</span>` : ''}
  ${drill.duration_minutes ? `<span>⏱ ${drill.duration_minutes} min</span>` : ''}
</div>`;

  if (drill.image_url) {
    body += `<img class="preview" src="${esc(drill.image_url)}" alt="Drill image" />`;
  }
  if (drill.drawing_data) {
    const phaseSVGs = renderPhasesToSVGStrings(drill.drawing_data);
    let parsedPhases = [];
    try { parsedPhases = JSON.parse(drill.drawing_data).phases || []; } catch {}
    if (phaseSVGs.length > 0) {
      body += `<h2>Whiteboard Phases (${phaseSVGs.length})</h2>`;
      phaseSVGs.forEach((svg, i) => {
        const phase = parsedPhases[i];
        const phaseTitle = phase?.title || `Phase ${i + 1}`;
        const phaseDesc = phase?.description || '';
        body += `<div style="margin-bottom:20px">
          <p style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:${phaseDesc ? '2px' : '8px'}">${esc(phaseTitle)}</p>
          ${phaseDesc ? `<p style="font-size:11px;color:#64748b;margin-bottom:8px;font-style:italic">${esc(phaseDesc)}</p>` : ''}
          ${svg}
        </div>`;
      });
    }
  }
  if (drill.description) {
    body += `<h2>Description</h2><div class="pre">${esc(drill.description)}</div>`;
  }
  if (drill.coaching_points) {
    body += `<h2>Coaching Points</h2><div class="pre">${esc(drill.coaching_points)}</div>`;
  }
  if (drill.video_url) {
    body += `<h2>Video</h2><p>▶ <a href="${esc(drill.video_url)}">${esc(drill.video_url)}</a></p>`;
  }

  printWindow(drill.name || 'Drill', body);
}

// ─── SESSION EXPORT ───────────────────────────────────────────────────────────
export function exportSession(session, sessionDrills = [], teamName = '') {
  const totalMins = sessionDrills.reduce((sum, sd) => sum + (Number(sd.duration) || sd.drill?.duration_minutes || 0), 0);

  let body = `
<h1>${esc(session.session_name)}</h1>
<div class="meta">
  <span>📅 ${session.date || '—'}</span>
  ${teamName ? `<span>👥 ${esc(teamName)}</span>` : ''}
  ${session.duration_minutes ? `<span>⏱ ${session.duration_minutes} min planned</span>` : ''}
  ${session.session_type ? `<span><span class="badge badge-slate">${esc(session.session_type)}</span></span>` : ''}
  ${session.focus_target ? `<span>🎯 Focus: ${esc(session.focus_target)}</span>` : ''}
</div>`;

  if (session.focus_category || session.focus_outcome) {
    body += `<h2>Session Focus</h2>`;
    if (session.focus_category) body += `<p><strong>${esc(session.focus_category)}</strong></p>`;
    if (session.focus_outcome) body += `<div class="pre" style="margin-top:6px">${esc(session.focus_outcome)}</div>`;
  }

  if (session.opponent_name) {
    body += `<h2>Opponent Prep</h2>`;
    body += `<p><strong>${esc(session.opponent_name)}</strong></p>`;
    if (session.opponent_strategy) body += `<div class="pre" style="margin-top:6px"><strong>Their style:</strong> ${esc(session.opponent_strategy)}</div>`;
    if (session.counter_strategies) body += `<div class="pre" style="margin-top:6px"><strong>Counter:</strong> ${esc(session.counter_strategies)}</div>`;
  }

  if (sessionDrills.length > 0) {
    body += `<h2>Drill Plan (${sessionDrills.length} drills · ${totalMins} min)</h2>`;
    sessionDrills.forEach((sd, i) => {
      const drill = sd.drill || {};
      const dur = Number(sd.duration) || drill.duration_minutes || '—';
      body += `<div class="row">
        <div class="num">${i + 1}</div>
        <div style="flex:1">
          <div class="row-name">${esc(drill.name || 'Drill')}</div>
          <div class="row-meta">${drill.theme || ''} ${drill.theme && drill.level ? '·' : ''} ${drill.level ? `L${drill.level}` : ''} · ${dur} min</div>
          ${sd.goal_type ? `<div class="goal-row" style="margin-top:6px">
            <div class="goal-cell"><div class="goal-label">Goal</div><div class="goal-val">${esc(sd.goal_type)}</div></div>
            ${sd.goal_target ? `<div class="goal-cell"><div class="goal-label">Target</div><div class="goal-val">${esc(sd.goal_target)}</div></div>` : ''}
            ${sd.goal_result ? `<div class="goal-cell"><div class="goal-label">Result</div><div class="goal-val">${esc(sd.goal_result)}</div></div>` : ''}
          </div>` : ''}
          ${sd.session_notes ? `<div style="font-size:12px;color:#64748b;margin-top:4px;font-style:italic">${esc(sd.session_notes)}</div>` : ''}
        </div>
      </div>`;
    });
  }

  if (session.notes) {
    body += `<h2>Notes</h2><div class="pre">${esc(session.notes)}</div>`;
  }

  printWindow(session.session_name || 'Session', body);
}

// ─── GAME PLAN EXPORT ─────────────────────────────────────────────────────────
export function exportGamePlan(game, players = [], plays = [], teamName = '') {
  const safeParse = (str, fb) => { try { return str ? JSON.parse(str) : fb; } catch { return fb; } };
  const availability = safeParse(game.player_availability, { in: [], out: [], questionable: [] });
  const startingFive = safeParse(game.starting_five, []);
  const matchups = safeParse(game.matchups, []);
  const playerMap = players.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});

  const resultBadge = { Win: 'badge-green', Loss: 'badge-red', Draw: 'badge-amber', TBD: 'badge-slate' }[game.result] || 'badge-slate';
  const score = game.result !== 'TBD' && game.our_score !== undefined ? ` ${game.our_score}–${game.opponent_score}` : '';

  let body = `
<h1>vs ${esc(game.opponent)}</h1>
<div class="meta">
  <span><span class="badge ${resultBadge}">${esc(game.result || 'TBD')}${esc(score)}</span></span>
  <span>📅 ${esc(game.game_date || '—')}</span>
  ${game.location ? `<span>📍 ${esc(game.location)}</span>` : ''}
  ${teamName ? `<span>👥 ${esc(teamName)}</span>` : ''}
</div>`;

  if (players.length > 0) {
    body += `<h2>Player Availability</h2>`;
    players.forEach(p => {
      const b = availability.in.includes(p.id) ? { text: 'IN', cls: 'badge-green' } : availability.out.includes(p.id) ? { text: 'OUT', cls: 'badge-red' } : availability.questionable.includes(p.id) ? { text: '?', cls: 'badge-amber' } : { text: '—', cls: 'badge-slate' };
      body += `<div class="row"><div class="num">#${p.jersey_number ?? '—'}</div><div style="flex:1"><div class="row-name">${esc(p.name)}</div></div><span class="badge ${b.cls}">${b.text}</span></div>`;
    });
  }

  if (startingFive.length > 0) {
    body += `<h2>Starting Five</h2><div class="grid2">`;
    startingFive.forEach((id, i) => {
      const p = playerMap[id];
      if (!p) return;
      body += `<div class="starter"><div class="num2">#${p.jersey_number ?? '—'}</div><div class="name">${esc(p.name)}</div></div>`;
    });
    body += `</div>`;
  }

  if (matchups.length > 0) {
    body += `<h2>Matchups</h2>`;
    matchups.forEach(mu => {
      const p = playerMap[mu.our];
      body += `<div class="row"><div style="flex:1;font-weight:600">${esc(p?.name || '—')}</div><div style="color:#94a3b8;font-size:12px">vs</div><div style="flex:1">${esc(mu.their || '—')}</div></div>`;
    });
  }

  if (game.substitution_plan) {
    body += `<h2>Substitution Plan</h2><div class="pre">${esc(game.substitution_plan)}</div>`;
  }

  if (plays.length > 0) {
    body += `<h2>Special Plays</h2>`;
    plays.forEach(play => {
      body += `<div class="row"><div class="row-name">${esc(play.name)}</div><span class="badge badge-orange" style="margin-left:auto">${esc(play.play_category || play.theme || '')}</span></div>`;
    });
  }

  if (game.reminders) {
    body += `<h2>Reminders</h2><div class="pre">${esc(game.reminders)}</div>`;
  }
  if (game.notes) {
    body += `<h2>Coach Notes</h2><div class="pre">${esc(game.notes)}</div>`;
  }

  printWindow(`vs ${game.opponent}`, body);
}

// ─── PLAYER PROFILE EXPORT ────────────────────────────────────────────────────
// `data` is the same shape PlayerProfile.jsx computes for its own display
// (totalSessions/totalMins/goalsCompleted/attendanceRate/categories/topDrills/
// notes); `playerNotes` is the separate player_notes table (explicit coach
// notes), kept apart from the derived "Coach Observations" timeline.
export function exportPlayerProfile(player, teamName, data, playerNotes = []) {
  const age = player.date_of_birth
    ? Math.floor((Date.now() - new Date(player.date_of_birth)) / (365.25 * 24 * 3600 * 1000))
    : null;

  let body = `
<h1>${esc(player.name)}</h1>
<div class="meta">
  ${player.jersey_number != null ? `<span>#${esc(player.jersey_number)}</span>` : ''}
  ${teamName ? `<span>👥 ${esc(teamName)}</span>` : ''}
  ${age != null ? `<span>Age ${age}</span>` : ''}
  ${player.position ? `<span><span class="badge badge-slate">${esc(player.position)}</span></span>` : ''}
</div>

<h2>Summary</h2>
<div class="goal-row">
  <div class="goal-cell"><div class="goal-label">Sessions</div><div class="goal-val">${data?.totalSessions ?? 0}</div></div>
  <div class="goal-cell"><div class="goal-label">Training Time</div><div class="goal-val">${data?.totalMins ? `${data.totalMins} min` : '—'}</div></div>
  <div class="goal-cell"><div class="goal-label">Goals Hit</div><div class="goal-val">${data?.goalsCompleted ?? 0}</div></div>
  <div class="goal-cell"><div class="goal-label">Attendance</div><div class="goal-val">${data?.attendanceRate != null ? `${data.attendanceRate}%` : '—'}</div></div>
</div>`;

  if (data?.categories?.length) {
    body += `<h2>Skill Focus</h2>`;
    data.categories.forEach(cat => {
      body += `<div class="row"><div style="flex:1;font-weight:600">${esc(cat.name)}</div><span class="row-meta">${cat.count}× practiced</span></div>`;
    });
  }

  if (data?.topDrills?.length) {
    body += `<h2>Most Practiced Drills</h2>`;
    data.topDrills.forEach(d => {
      const latest = d.points?.length ? d.points[d.points.length - 1] : null;
      body += `<div class="row">
        <div style="flex:1">
          <div class="row-name">${esc(d.name)}</div>
          ${latest ? `<div class="row-meta">Latest: ${esc(latest.result)} / ${esc(latest.target)}</div>` : ''}
        </div>
        <span class="badge badge-slate">${d.count}×</span>
      </div>`;
    });
  }

  if (data?.notes?.length) {
    body += `<h2>Coach Observations</h2>`;
    data.notes.forEach(n => {
      body += `<div style="margin-bottom:10px">
        <p class="row-meta">${n.date ? esc(n.date) : ''}${n.drill ? ` · ${esc(n.drill)}` : ''}</p>
        <div class="pre">${esc(n.text)}</div>
      </div>`;
    });
  }

  if (playerNotes?.length) {
    body += `<h2>Coach Notes</h2>`;
    playerNotes.forEach(n => {
      const date = n.created_at || n.created_date;
      body += `<div style="margin-bottom:10px">
        <p class="row-meta">${date ? esc(new Date(date).toLocaleDateString()) : ''}${n.note_type ? ` · ${esc(n.note_type)}` : ''}</p>
        <div class="pre">${esc(n.content || n.note || '')}</div>
      </div>`;
    });
  }

  if (!data?.categories?.length && !data?.topDrills?.length && !data?.notes?.length && !playerNotes?.length) {
    body += `<h2>Development</h2><p style="color:#94a3b8">No development work recorded yet.</p>`;
  }

  printWindow(player.name || 'Player', body);
}