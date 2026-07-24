import { db } from '@/api/db';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/**
 * Creates a complete demo story for new users:
 * - 1 demo team
 * - 2 demo players (linked to team)
 * - 2 private sessions (linked to players)
 * - session drills with goals, results, ratings, notes
 * - 3 demo games with realistic stats
 */
export async function createDemoData(user) {
  try {
    // ── Demo Team ─────────────────────────────────────────────────
    const team = await db.entities.Team.create({
      team_name: 'Starter Team',
      age_group: 'U14',
      program_type: 'Club',
      visibility: 'Private',
      owner_user_email: user.email,
      status: 'Active',
    });

    // ── Demo Players ──────────────────────────────────────────────
    const [alex, mia] = await Promise.all([
      db.entities.Player.create({
        name: 'Alex Carter',
        team_id: team.id,
        jersey_number: 7,
        position: 'Guard',
        owner_user_email: user.email,
        visibility: 'Private',
        status: 'Active',
        injury_status: 'Healthy',
        notes: 'Strong left hand. Working on pull-up consistency and defensive footwork.',
        }),
      db.entities.Player.create({
        name: 'Mia Johnson',
        team_id: team.id,
        jersey_number: 12,
        position: 'Forward',
        owner_user_email: user.email,
        visibility: 'Private',
        status: 'Active',
        injury_status: 'Healthy',
        notes: 'Excellent court vision and passing. Needs to improve finishing on the left side.',
        }),
    ]);

    // ── Demo Private Sessions ─────────────────────────────────────
    const [s1, s2] = await Promise.all([
      db.entities.Session.create({
        session_name: 'Alex & Mia — Ball Handling & Finishing',
        session_type: 'Private',
        team_id: team.id,
        date: daysAgo(14),
        duration_minutes: 60,
        focus_category: 'Finishing',
        status: 'Completed',
        notes: 'Great session. Both players showed real improvement in two-foot stops.',
        owner_user_email: user.email,
        owner_id: user.id,
        player_ids: JSON.stringify([alex.id, mia.id]),
        }),
      db.entities.Session.create({
        session_name: 'Alex & Mia — Decision Making & Shooting',
        session_type: 'Private',
        team_id: team.id,
        date: daysAgo(7),
        duration_minutes: 75,
        focus_category: 'Decision Making',
        status: 'Completed',
        notes: 'Alex reads the defence well now. Mia needs to attack the advantage earlier.',
        owner_user_email: user.email,
        owner_id: user.id,
        player_ids: JSON.stringify([alex.id, mia.id]),
        }),
    ]);

    // ── Session 1 Drills ──────────────────────────────────────────
    await Promise.all([
      // Alex — Session 1
      db.entities.SessionDrill.create({
        session_id: s1.id,
        player_id: alex.id,
        drill_name: 'Dribble Jump Stop Pivot & Pass',
        order: 1,
        duration: 15,
        focus_category: 'Ball Handling',
        goal_type: 'Reps',
        goal_target: '20',
        goal_result: '16',
        session_notes: 'Good footwork on the right side. Left pivot still inconsistent under pressure.',
        coach_rating: 3,
        status: 'Completed',
        }),
      db.entities.SessionDrill.create({
        session_id: s1.id,
        player_id: alex.id,
        drill_name: 'Tennessee Shooting Drill',
        order: 2,
        duration: 20,
        focus_category: 'Finishing',
        goal_type: 'Makes',
        goal_target: '25',
        goal_result: '21',
        session_notes: 'Excellent right-hand finish. Left-hand layup needs more confidence.',
        coach_rating: 4,
        status: 'Completed',
        }),
      // Mia — Session 1
      db.entities.SessionDrill.create({
        session_id: s1.id,
        player_id: mia.id,
        drill_name: 'Dribble Jump Stop Pivot & Pass',
        order: 1,
        duration: 15,
        focus_category: 'Ball Handling',
        goal_type: 'Reps',
        goal_target: '20',
        goal_result: '18',
        session_notes: 'Very clean pivot. Needs to look up more before the pass.',
        coach_rating: 4,
        status: 'Completed',
        }),
      db.entities.SessionDrill.create({
        session_id: s1.id,
        player_id: mia.id,
        drill_name: 'Tennessee Shooting Drill',
        order: 2,
        duration: 20,
        focus_category: 'Finishing',
        goal_type: 'Makes',
        goal_target: '25',
        goal_result: '17',
        session_notes: 'Left-hand finishing is a consistent gap. Repeat this drill next session.',
        coach_rating: 3,
        status: 'Completed',
        }),
    ]);

    // ── Session 2 Drills ──────────────────────────────────────────
    await Promise.all([
      // Alex — Session 2
      db.entities.SessionDrill.create({
        session_id: s2.id,
        player_id: alex.id,
        drill_name: 'Pass Tag',
        order: 1,
        duration: 15,
        focus_category: 'Passing',
        goal_type: 'Score',
        goal_target: '15',
        goal_result: '14',
        session_notes: 'Very sharp vision. Making the right read almost every time now.',
        coach_rating: 5,
        status: 'Completed',
        }),
      db.entities.SessionDrill.create({
        session_id: s2.id,
        player_id: alex.id,
        drill_name: 'Tennessee Shooting Drill',
        order: 2,
        duration: 25,
        focus_category: 'Shooting',
        goal_type: 'Makes',
        goal_target: '30',
        goal_result: '26',
        session_notes: 'Best shooting session yet. Form is consistent. Just needs game reps.',
        coach_rating: 5,
        status: 'Completed',
        }),
      // Mia — Session 2
      db.entities.SessionDrill.create({
        session_id: s2.id,
        player_id: mia.id,
        drill_name: 'Pass Tag',
        order: 1,
        duration: 15,
        focus_category: 'Passing',
        goal_type: 'Score',
        goal_target: '15',
        goal_result: '13',
        session_notes: 'Smart decisions with the ball. Needs to play faster on the second pass.',
        coach_rating: 4,
        status: 'Completed',
        }),
      db.entities.SessionDrill.create({
        session_id: s2.id,
        player_id: mia.id,
        drill_name: 'Tennessee Shooting Drill',
        order: 2,
        duration: 25,
        focus_category: 'Shooting',
        goal_type: 'Makes',
        goal_target: '30',
        goal_result: '22',
        session_notes: 'Shot selection improving but pull-up off the dribble needs more work.',
        coach_rating: 3,
        status: 'Completed',
        }),
    ]);

    // ── Demo Games ────────────────────────────────────────────────
    const buildStats = (oReb, dReb, to, fga, fta, paint, defl, oppOReb, oppDReb) =>
      JSON.stringify([
        { name: 'Our Offensive Rebounds', result: oReb, section: 'us' },
        { name: 'Our Defensive Rebounds', result: dReb, section: 'us' },
        { name: 'Turnovers', result: to, section: 'us' },
        { name: 'FGA', result: fga, section: 'us' },
        { name: 'FTA', result: fta, section: 'us' },
        { name: 'Paint Touches', result: paint, section: 'us' },
        { name: 'Deflections', result: defl, section: 'us' },
        { name: 'Opponent Offensive Rebounds', result: oppOReb, section: 'them' },
        { name: 'Opponent Defensive Rebounds', result: oppDReb, section: 'them' },
      ]);

    await Promise.all([
      db.entities.Game.create({
        game_date: daysAgo(21),
        team_id: team.id,
        opponent: 'Riverside Tigers',
        result: 'Win',
        our_score: 62,
        opponent_score: 51,
        season: '2024-25',
        notes: 'Solid defensive effort. Good ball movement in the second half.',
        owner_user_email: user.email,
          team_stats: buildStats(8, 22, 12, 48, 14, 18, 9, 6, 19),
      }),
      db.entities.Game.create({
        game_date: daysAgo(10),
        team_id: team.id,
        opponent: 'City Hawks',
        result: 'Loss',
        our_score: 44,
        opponent_score: 58,
        season: '2024-25',
        notes: 'Too many turnovers and struggled on the offensive glass. Work on finishing.',
        owner_user_email: user.email,
          team_stats: buildStats(5, 14, 18, 41, 8, 11, 4, 11, 21),
      }),
      db.entities.Game.create({
        game_date: daysAgo(3),
        team_id: team.id,
        opponent: 'North Stars',
        result: 'Win',
        our_score: 71,
        opponent_score: 60,
        season: '2024-25',
        notes: 'Best team performance of the season. Dominated the boards and ran the floor.',
        owner_user_email: user.email,
          team_stats: buildStats(10, 25, 9, 52, 18, 22, 12, 7, 18),
      }),
    ]);

    return { team, players: [alex, mia] };
  } catch (e) {
    console.warn('Demo data creation failed (non-critical):', e.message);
    return null;
  }
}