import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Dumbbell, Star, PenLine } from 'lucide-react';
import Pagination from '@/components/admin/Pagination';
import HelpBubble from '@/components/HelpBubble';
import { db } from '@/api/db';
import { getAccessibleDrills, canEditDrill } from '@/lib/drillAccess';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import DrillCard from '@/components/drills/DrillCard';
import DrillViewModal from '@/components/drills/DrillViewModal';

const DRILL_THEMES = ['All', 'Ball Handling', 'Finishing', 'Shooting', 'Passing', 'Footwork', 'Decision Making', 'Defense', 'Transition', 'Small-Sided Games', 'Team Concepts', 'Competitive', 'Press Break', 'Rebounding'];
const PLAY_THEMES = ['All', 'Half Court Offense', 'Transition Offense', 'Inbound Play', 'Press Break', 'Defensive System', 'Special Situation'];
const LEVELS = [{ val: null, label: 'All Levels' }, { val: 1, label: 'L1 Beginner' }, { val: 2, label: 'L2 Intermediate' }, { val: 3, label: 'L3 Advanced' }];

export default function DrillLibrary() {
  const [user, setUser] = useState(null);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [drills, setDrills] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('Drill');
  const THEMES = typeFilter === 'Drill' ? DRILL_THEMES : PLAY_THEMES;
  const [search, setSearch] = useState('');
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [themeFilter, setThemeFilter] = useState('All');
  const [levelFilter, setLevelFilter] = useState(null);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewDrill, setViewDrill] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    db.auth.me().then(u => { setUser(u); }).catch(() => {});
    const unsub = subscribeActiveTeam(t => setActiveTeamState(t));
    return unsub;
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, activeTeam]);

  const load = async () => {
    setLoading(true);
    const [list, templateList, favs] = await Promise.all([
      getAccessibleDrills(user),
      db.entities.Drill.filter({ visibility: 'Template', status: 'Active' }, '-created_date', 200),
      db.entities.DrillFavorite.filter({ user_id: user.id }),
    ]);
    const combined = [...list];
    templateList.forEach(t => { if (!combined.find(d => d.id === t.id)) combined.push(t); });
    setDrills(combined);
    setFavorites(favs);
    setLoading(false);
  };

  const loadFavorites = async () => {
    const favs = await db.entities.DrillFavorite.filter({ user_id: user.id });
    setFavorites(favs);
  };

  const favSet = new Set(favorites.map(f => f.drill_id));

  const toggleFavorite = async (drillId) => {
    const existing = favorites.find(f => f.drill_id === drillId);
    if (existing) {
      await db.entities.DrillFavorite.delete(existing.id);
    } else {
      await db.entities.DrillFavorite.create({ user_id: user.id, drill_id: drillId });
    }
    loadFavorites();
  };

  const handleDelete = async (drill) => {
    if (deleteConfirm?.id === drill.id) {
      try {
        await db.entities.Drill.delete(drill.id);
        setDeleteConfirm(null);
        load();
      } catch {
        toast.error('Could not delete drill. You may not have permission.');
        setDeleteConfirm(null);
      }
    } else {
      setDeleteConfirm(drill);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleDuplicate = async (drill, withMedia = true) => {
    const { id, created_date, updated_date, ...rest } = drill;
    const payload = { ...rest, name: `${drill.name} (copy)`, owner_user_email: user?.email, owner_id: user?.id, visibility: 'Private' };
    if (!withMedia) {
      payload.image_url = '';
      payload.extra_images = '';
      payload.drawing_data = null;
    }
    await db.entities.Drill.create(payload);
    setViewDrill(null);
    load();
  };

  // Always fetch fresh data before opening View — never rely on potentially stale card state
  const openView = async (drill) => {
    try {
      const fresh = await db.entities.Drill.get(drill.id);
      setViewDrill(fresh || drill);
    } catch {
      setViewDrill(drill);
    }
  };

  // Reset pagination when filters change
  useEffect(() => { setPage(0); }, [search, typeFilter, themeFilter, levelFilter, showFavOnly]);

  const parseTeamIds = (val) => {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val || '[]'); } catch { return []; }
  };

  const filtered = drills
    .filter(d => d.item_type === typeFilter)
    .filter(d => {
      if (!activeTeam) return true;
      // Always show user's own private drills
      if (d.visibility === 'Private' && d.owner_id === user?.id) return true;
      // Show club/template drills assigned to this team
      return parseTeamIds(d.team_ids).includes(activeTeam.id);
    })
    .filter(d => !showFavOnly || favSet.has(d.id))
    .filter(d => {
      if (themeFilter === 'All') return true;
      return typeFilter === 'Play' ? d.play_category === themeFilter : d.theme === themeFilter;
    })
    .filter(d => levelFilter === null || d.level === levelFilter)
    .filter(d => !search || d.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aFav = favSet.has(a.id) ? 0 : 1;
      const bFav = favSet.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return new Date(b.created_date) - new Date(a.created_date);
    });

  const totalType = drills.filter(d => d.item_type === typeFilter).length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Drill Library</h1>
            <p className="text-sm text-slate-500">{activeTeam ? activeTeam.team_name : `${totalType} ${typeFilter.toLowerCase()}${totalType !== 1 ? 's' : ''}`}</p>
          </div>
          <button
            onClick={() => navigate('/drills/new')}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-orange-200 shrink-0"
          >
            <Plus size={16} />
            New {typeFilter}
          </button>
        </div>

        {/* Drills / Plays toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button onClick={() => { setTypeFilter('Drill'); setThemeFilter('All'); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${typeFilter === 'Drill' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Dumbbell size={13} /> Drills
          </button>
          <button onClick={() => { setTypeFilter('Play'); setThemeFilter('All'); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${typeFilter === 'Play' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <PenLine size={13} /> Plays
          </button>
        </div>

        {/* Search + Favorites */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${typeFilter.toLowerCase()}s...`}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <button onClick={() => setShowFavOnly(!showFavOnly)}
            className={`shrink-0 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors flex items-center gap-1.5 ${showFavOnly ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            <Star size={15} className={showFavOnly ? 'fill-amber-400 text-amber-400' : ''} />
            <span className="hidden sm:inline">Favourites</span>
          </button>
        </div>

        {/* Theme + Level */}
        <div className="flex gap-2">
          <select value={themeFilter} onChange={e => setThemeFilter(e.target.value)}
            className="flex-1 min-w-0 text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
            {THEMES.map(t => <option key={t} value={t}>{t === 'All' ? 'All Themes' : t}</option>)}
          </select>
          <select value={levelFilter ?? ''} onChange={e => setLevelFilter(e.target.value === '' ? null : Number(e.target.value))}
            className="flex-1 min-w-0 text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
            {LEVELS.map(l => <option key={String(l.val)} value={l.val ?? ''}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <HelpBubble
        id={typeFilter === 'Play' ? 'plays' : 'drills'}
        text={typeFilter === 'Play'
          ? '📐 Plays are tactical diagrams. Use phases to show your team exactly where to move.'
          : '💡 Built-in drills are templates. Duplicate them to make your own version.'
        }
      />

      {/* Count */}
      <div className="px-4 pb-1.5">
        <p className="text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* List */}
      <div className="px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-[3px] border-slate-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
              {showFavOnly ? <Star size={28} className="text-amber-400" /> : <Dumbbell size={28} className="text-orange-400" />}
            </div>
            <p className="font-semibold text-slate-700">
              {showFavOnly ? 'No favourites yet' : search ? `No ${typeFilter.toLowerCase()}s match` : `No ${typeFilter.toLowerCase()}s yet`}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {showFavOnly ? 'Tap the ★ star on any drill to favourite it' :
               !search ? `Tap "New ${typeFilter}" to add one` : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(drill => (
                <div key={drill.id}>
                  <DrillCard
                    drill={drill}
                    canEdit={canEditDrill(drill, user)}
                    isFavorite={favSet.has(drill.id)}
                    onToggleFavorite={() => toggleFavorite(drill.id)}
                    onEdit={d => navigate(`/drills/${d.id}/edit`)}
                    onView={openView}
                    onDelete={handleDelete}
                  />
                  {deleteConfirm?.id === drill.id && (
                    <p className="text-xs text-red-500 text-center mt-1 animate-pulse">Tap delete again to confirm</p>
                  )}
                </div>
              ))}
            </div>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPage={setPage} />
          </>
        )}
      </div>

      {viewDrill && (
        <DrillViewModal
          drill={viewDrill}
          onClose={() => setViewDrill(null)}
          onEdit={d => { setViewDrill(null); navigate(`/drills/${d.id}/edit`); }}
          onDuplicate={handleDuplicate}
        />
      )}
    </div>
  );
}