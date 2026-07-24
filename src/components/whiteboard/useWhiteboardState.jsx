import { useState, useCallback } from 'react';
import cloneDeep from 'lodash/cloneDeep';

const uid = () => Math.random().toString(36).slice(2, 9);

const newPhase = (index = 0) => ({
  id: uid(),
  title: `Phase ${index + 1}`,
  description: '',
  order: index,
  players: [],
  actions: [],
  notes: '',
});

const defaultState = () => ({
  courtType: 'half',
  phases: [newPhase()],
  currentPhaseIndex: 0,
});

function parseInitial(data) {
  if (!data) return defaultState();
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (parsed && parsed.phases && parsed.phases.length) {
      // Migrate: add title/description/order to phases that don't have them
      parsed.phases = parsed.phases.map((phase, i) => ({
        ...phase,
        title: phase.title || `Phase ${i + 1}`,
        description: phase.description || '',
        order: phase.order !== undefined ? phase.order : i,
      }));
      return parsed;
    }
  } catch (e) {}
  return defaultState();
}

export function useWhiteboardState(initialData = null) {
  const [history, setHistory] = useState(() => [parseInitial(initialData)]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const state = history[historyIndex];
  const currentPhase = state.phases[state.currentPhaseIndex] || state.phases[0];

  const commit = useCallback((newState) => {
    setHistory(h => {
      const trimmed = h.slice(0, historyIndex + 1);
      return [...trimmed, newState];
    });
    setHistoryIndex(i => i + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    setHistoryIndex(i => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setHistory(h => {
      setHistoryIndex(i => Math.min(h.length - 1, i + 1));
      return h;
    });
  }, []);

  const updateCurrentPhase = useCallback((updater) => {
    const next = cloneDeep(state);
    updater(next.phases[next.currentPhaseIndex]);
    commit(next);
  }, [state, commit]);

  const addPlayer = useCallback((type, x, y, defaultLabel) => {
    updateCurrentPhase(phase => {
      phase.players.push({ id: uid(), type, x, y, label: defaultLabel });
    });
  }, [updateCurrentPhase]);

  const movePlayer = useCallback((id, x, y) => {
    updateCurrentPhase(phase => {
      const p = phase.players.find(p => p.id === id);
      if (p) { p.x = x; p.y = y; }
    });
  }, [updateCurrentPhase]);

  const renamePlayer = useCallback((id, label) => {
    updateCurrentPhase(phase => {
      const p = phase.players.find(p => p.id === id);
      if (p) p.label = label;
    });
  }, [updateCurrentPhase]);

  const deletePlayer = useCallback((id) => {
    updateCurrentPhase(phase => {
      phase.players = phase.players.filter(p => p.id !== id);
    });
  }, [updateCurrentPhase]);

  const addAction = useCallback((type, points, fromPlayerId, toPlayerId) => {
    updateCurrentPhase(phase => {
      const action = { id: uid(), type, points };
      if (fromPlayerId) action.fromPlayerId = fromPlayerId;
      if (toPlayerId) action.toPlayerId = toPlayerId;
      phase.actions.push(action);
    });
  }, [updateCurrentPhase]);

  const deleteAction = useCallback((id) => {
    updateCurrentPhase(phase => {
      phase.actions = phase.actions.filter(a => a.id !== id);
    });
  }, [updateCurrentPhase]);

  const updateActionControlPoint = useCallback((id, cp) => {
    updateCurrentPhase(phase => {
      const a = phase.actions.find(a => a.id === id);
      if (a) a.controlPoint = cp;
    });
  }, [updateCurrentPhase]);

  const setCourt = useCallback((courtType) => {
    const next = cloneDeep(state);
    next.courtType = courtType;
    commit(next);
  }, [state, commit]);

  const addPhase = useCallback(() => {
    const next = cloneDeep(state);
    const curPhase = next.phases[next.currentPhaseIndex];
    const currentPlayers = cloneDeep(curPhase.players);
    const currentActions = curPhase.actions || [];
    const phase = newPhase(next.phases.length);
    // Keep stable player IDs (do NOT generate new ones)
    phase.players = currentPlayers.map(p => ({ ...p }));

    // Movement: cut/drive/screen actions with fromPlayerId move that player to endpoint
    const MOVEMENT_TYPES = ['cut', 'drive', 'screen'];
    currentActions.forEach(action => {
      if (MOVEMENT_TYPES.includes(action.type) && action.fromPlayerId) {
        const endPt = action.points[action.points.length - 1];
        const player = phase.players.find(p => p.id === action.fromPlayerId);
        if (player) { player.x = endPt.x; player.y = endPt.y; }
      }
    });

    // Ball transfer: pass/handoff transfers ball via toPlayerId (or distance fallback)
    const TRANSFER_TYPES = ['pass', 'handoff'];
    const transferAction = currentActions.find(a => TRANSFER_TYPES.includes(a.type));
    if (transferAction) {
      if (transferAction.toPlayerId) {
        phase.players.forEach(p => { p.hasBall = p.id === transferAction.toPlayerId; });
      } else {
        // Distance fallback for old data
        const endPt = transferAction.points[transferAction.points.length - 1];
        let receiverId = null, minDist = 50;
        currentPlayers.forEach(p => {
          const d = Math.sqrt((p.x - endPt.x) ** 2 + (p.y - endPt.y) ** 2);
          if (d < minDist) { minDist = d; receiverId = p.id; }
        });
        if (transferAction.fromPlayerId) {
          phase.players.forEach(p => { p.hasBall = p.id === receiverId; });
        } else {
          phase.players.forEach(p => { p.hasBall = p.id === receiverId; });
        }
      }
    } else {
      // Preserve existing ball state
      phase.players.forEach(p => { p.hasBall = p.hasBall || false; });
    }

    next.phases.push(phase);
    next.currentPhaseIndex = next.phases.length - 1;
    commit(next);
  }, [state, commit]);

  const clonePhase = useCallback(() => {
    const next = cloneDeep(state);
    const cloned = cloneDeep(next.phases[next.currentPhaseIndex]);
    cloned.id = uid();
    cloned.players = cloned.players.map(p => ({ ...p, id: uid() }));
    cloned.actions = cloned.actions.map(a => ({ ...a, id: uid() }));
    next.phases.splice(next.currentPhaseIndex + 1, 0, cloned);
    next.currentPhaseIndex = next.currentPhaseIndex + 1;
    commit(next);
  }, [state, commit]);

  const deletePhase = useCallback(() => {
    if (state.phases.length <= 1) return;
    const next = cloneDeep(state);
    next.phases.splice(next.currentPhaseIndex, 1);
    next.currentPhaseIndex = Math.max(0, next.currentPhaseIndex - 1);
    commit(next);
  }, [state, commit]);

  const clearBoard = useCallback(() => {
    const next = cloneDeep(state);
    next.phases = [newPhase(0)];
    next.currentPhaseIndex = 0;
    commit(next);
  }, [state, commit]);

  const renamePhase = useCallback((title) => {
    const next = cloneDeep(state);
    next.phases[next.currentPhaseIndex].title = title;
    commit(next);
  }, [state, commit]);

  const updatePhaseDescription = useCallback((description) => {
    const next = cloneDeep(state);
    next.phases[next.currentPhaseIndex].description = description;
    commit(next);
  }, [state, commit]);

  const updatePlayerType = useCallback((id, newRole) => {
    updateCurrentPhase(phase => {
      const p = phase.players.find(p => p.id === id);
      if (!p) return;
      if (newRole === 'defense') {
        p.role = 'defense';
        p.hasBall = false;
        p.label = 'X' + p.label.replace(/^X/, '');
      } else if (newRole === 'offense') {
        p.role = 'offense';
        p.hasBall = false;
        p.label = p.label.replace(/^X/, '');
      }
    });
  }, [updateCurrentPhase]);

  const setPlayerBall = useCallback((id, hasBall) => {
    updateCurrentPhase(phase => {
      const p = phase.players.find(p => p.id === id);
      if (p) p.hasBall = hasBall; // allows multiple ball holders
    });
  }, [updateCurrentPhase]);

  const goToPhase = useCallback((index) => {
    const next = cloneDeep(state);
    next.currentPhaseIndex = Math.max(0, Math.min(index, next.phases.length - 1));
    // Navigate without adding undo history
    setHistory(h => h.map((s, i) => i === historyIndex ? next : s));
  }, [state, historyIndex]);

  const getDrawingData = useCallback(() => JSON.stringify(state), [state]);

  const reinit = useCallback((data) => {
    const parsed = parseInitial(data);
    setHistory([parsed]);
    setHistoryIndex(0);
  }, []);

  return {
    state,
    currentPhase,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    addPlayer,
    movePlayer,
    renamePlayer,
    deletePlayer,
    addAction,
    deleteAction,
    updateActionControlPoint,
    setCourt,
    addPhase,
    clonePhase,
    deletePhase,
    goToPhase,
    clearBoard,
    renamePhase,
    updatePhaseDescription,
    updatePlayerType,
    setPlayerBall,
    getDrawingData,
    reinit,
  };
}