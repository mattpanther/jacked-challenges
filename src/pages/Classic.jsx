import { useState, useEffect, useRef, useCallback } from 'react';
import { useChallengeState } from '../firebase.jsx';

// --- DATA STRUCTURE ---
const WORKOUT_DATA = {
  PULL: [
    { id: 'A', base: 'DB Chest Supported Rows', variations: { JackedUp: '1.5 Reps', Jacked: 'Standard', JackedDown: 'Standard Rows', HLL: 'Incline Crush Grip' } },
    { id: 'B', base: 'DB Urlachers', variations: { JackedUp: '3 sec ISO Hold', Jacked: 'Standard', JackedDown: 'Seated High Pulls', HLL: 'High Pulls' } },
    { id: 'C', base: 'DB Haney Shrugs', variations: { JackedUp: '10 sec ISO Hold', Jacked: 'Standard', JackedDown: 'Lower Partials w/ 5 sec ISO', HLL: 'Standard Shrugs' } },
    { id: 'D', base: 'DB No Money Curls', variations: { JackedUp: 'Zottman Curls', Jacked: 'Standard', JackedDown: 'Alt. No Money Curls', HLL: 'Shovel Curls' } },
  ],
  PUSH: [
    { id: 'A', base: 'DB Bench Press', variations: { JackedUp: 'Paused (5 Sec)', Jacked: 'Standard', JackedDown: 'Upper Partials', HLL: 'Crush Grip' } },
    { id: 'B', base: 'DB Side Lateral Raises', variations: { JackedUp: '1.5 Reps', Jacked: 'Standard', JackedDown: 'Cheat Laterals', HLL: 'Abduction Rows' } },
    { id: 'C', base: 'Lying DB Tricep Ext', variations: { JackedUp: 'Stretch Ext', Jacked: 'Standard', JackedDown: 'JM Press', HLL: 'Floor Ext' } },
    { id: 'D', base: 'DB OHP', variations: { JackedUp: 'Z Press', Jacked: 'Standard', JackedDown: 'Push Press', HLL: 'Over and Backs' } },
  ],
  LEGS: [
    { id: 'A', base: 'Alt. Reverse Lunges', variations: { JackedUp: '1.5 Reps', Jacked: 'Standard', JackedDown: 'Partials (Knees)', HLL: 'Goblet Lunges' } },
    { id: 'B', base: 'DB Hip Thrusts', variations: { JackedUp: 'Marches', Jacked: 'Standard', JackedDown: 'Partials (Knees)', HLL: 'Single Leg' } },
    { id: 'C', base: 'DB Rocket Squats', variations: { JackedUp: 'Deep (Floor)', Jacked: 'Standard (Shins)', JackedDown: 'Partials (Knees)', HLL: 'Standard Squats' } },
    { id: 'D', base: 'DB RDLs', variations: { JackedUp: '1.5 Reps', Jacked: 'Standard', JackedDown: 'Upper Partials', HLL: 'Single Leg' } },
  ],
};

// --- HELPERS ---
const getPathDetails = (reps) => {
  const r = parseInt(reps);
  if (isNaN(r)) return { path: 'Jacked', threshold: 6 };
  if (r >= 13) return { path: 'JackedUp', threshold: Math.ceil(r / 2) };
  if (r >= 10) return { path: 'Jacked', threshold: 6 };
  if (r >= 6) return { path: 'JackedDown', threshold: 6 };
  return { path: 'HLL', threshold: 6 };
};

const getRank = (score) => {
  if (score > 55) return { title: 'XTREME', color: 'var(--accent-purple)' };
  if (score >= 46) return { title: 'ELITE', color: 'var(--accent-red)' };
  if (score >= 36) return { title: 'PRO', color: 'var(--accent-orange)' };
  if (score >= 20) return { title: 'SOLID', color: 'var(--accent-yellow)' };
  return { title: 'BASIX', color: 'var(--text-secondary)' };
};

const PATH_COLORS = {
  JackedUp: 'jacked-up',
  Jacked: 'jacked',
  JackedDown: 'jacked-down',
  HLL: 'hll',
};

// --- Audio ---
let audioCtx = null;
const getAudioCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
};
const playTimerBeep = () => {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) { /* */ }
};

const DEFAULT_STATE = {
  phase: 'MENU',
  selectedDay: null,
  ignitorData: {},
  activeExercises: [],
  roundInputs: {},
  score: 0,
  round: 1,
  eliminatedList: [],
  lastReps: {},
  history: [],
};

export default function Classic() {
  const [appState, setAppState, loaded] = useChallengeState('classic', DEFAULT_STATE);
  const [giveUpConfirm, setGiveUpConfirm] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerActive, setTimerActive] = useState(false);

  const {
    phase = 'MENU',
    selectedDay,
    ignitorData = {},
    activeExercises = [],
    roundInputs = {},
    score = 0,
    round = 1,
    eliminatedList = [],
    lastReps = {},
    history = [],
  } = appState;

  // Timer logic
  useEffect(() => {
    let interval = null;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(p => p - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
      playTimerBeep();
      startNextRound();
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  useEffect(() => {
    setGiveUpConfirm(false);
    window.scrollTo(0, 0);
  }, [phase]);

  // --- Handlers ---
  const setPhase = (p) => setAppState(prev => ({ ...prev, phase: p }));

  const handleStartIgnitor = (day) => {
    const initialData = {};
    WORKOUT_DATA[day].forEach(ex => {
      initialData[ex.id] = { weight: '', reps: '', path: 'Jacked', threshold: 6 };
    });
    setAppState(prev => ({
      ...prev,
      selectedDay: day,
      ignitorData: initialData,
      phase: 'IGNITOR',
    }));
  };

  const handleIgnitorChange = (id, field, value) => {
    setAppState(prev => {
      const newData = { ...prev.ignitorData };
      if (!newData[id]) newData[id] = { weight: '', reps: '', path: 'Jacked', threshold: 6 };
      newData[id] = { ...newData[id], [field]: value };
      if (field === 'reps') {
        const { path, threshold } = getPathDetails(value);
        newData[id].path = path;
        newData[id].threshold = threshold;
      }
      return { ...prev, ignitorData: newData };
    });
  };

  const adjustIgnitorValue = (id, field, amount) => {
    const currentVal = ignitorData[id]?.[field];
    const val = currentVal === '' ? 0 : parseInt(currentVal);
    const newVal = Math.max(0, val + amount);
    handleIgnitorChange(id, field, newVal.toString());
  };

  const startChallenge = () => {
    try { getAudioCtx().resume(); } catch (e) { /* */ }
    const isValid = Object.values(ignitorData).every(d => d.weight && d.reps);
    if (!isValid) {
      alert('Please fill in Weight and Reps for all exercises.');
      return;
    }
    setAppState(prev => ({
      ...prev,
      activeExercises: ['A', 'B', 'C', 'D'],
      eliminatedList: [],
      lastReps: {},
      score: 0,
      round: 1,
      roundInputs: {},
      phase: 'WORKOUT',
    }));
  };

  const handleRoundInputChange = (id, val) => {
    setAppState(prev => ({
      ...prev,
      roundInputs: { ...prev.roundInputs, [id]: val },
    }));
  };

  const adjustRoundReps = (id, amount) => {
    const currentVal = roundInputs[id] === '' || roundInputs[id] === undefined ? 0 : parseInt(roundInputs[id]);
    const newVal = Math.max(0, currentVal + amount);
    handleRoundInputChange(id, newVal.toString());
  };

  const submitRound = () => {
    let currentScore = score;
    let nextEliminated = [...eliminatedList];
    let nextActive = [];
    let nextLastReps = { ...lastReps };

    activeExercises.forEach(id => {
      const inputVal = roundInputs[id];
      const repsPerformed = inputVal === '' || inputVal === undefined ? 0 : parseInt(inputVal);
      const threshold = ignitorData[id]?.threshold || 6;
      nextLastReps[id] = repsPerformed.toString();

      if (repsPerformed < threshold) {
        nextEliminated.push({
          id,
          round,
          name: WORKOUT_DATA[selectedDay].find(ex => ex.id === id)?.base,
        });
      } else {
        nextActive.push(id);
        currentScore += 1;
      }
    });

    if (nextActive.length === 0) {
      setAppState(prev => ({
        ...prev,
        score: currentScore,
        eliminatedList: nextEliminated,
        lastReps: nextLastReps,
        activeExercises: nextActive,
        phase: 'RESULTS',
      }));
    } else {
      setAppState(prev => ({
        ...prev,
        score: currentScore,
        eliminatedList: nextEliminated,
        lastReps: nextLastReps,
        activeExercises: nextActive,
        phase: 'REST',
      }));
      const isLastManStanding = nextActive.length === 1;
      setTimeLeft(isLastManStanding ? 10 : 60);
      setTimerActive(true);
    }
  };

  const startNextRound = () => {
    setAppState(prev => {
      const nextInputs = {};
      prev.activeExercises.forEach(id => {
        nextInputs[id] = prev.lastReps[id] || '';
      });
      return {
        ...prev,
        round: prev.round + 1,
        roundInputs: nextInputs,
        phase: 'WORKOUT',
      };
    });
  };

  const handleGiveUp = () => {
    const remaining = activeExercises.map(id => ({
      id,
      round,
      name: WORKOUT_DATA[selectedDay]?.find(ex => ex.id === id)?.base,
    }));
    setAppState(prev => ({
      ...prev,
      eliminatedList: [...prev.eliminatedList, ...remaining],
      phase: 'RESULTS',
    }));
  };

  const requestGiveUp = () => {
    if (giveUpConfirm) {
      handleGiveUp();
    } else {
      setGiveUpConfirm(true);
      setTimeout(() => setGiveUpConfirm(false), 3000);
    }
  };

  const saveToHistory = () => {
    setAppState(prev => ({
      ...prev,
      history: [
        {
          date: Date.now(),
          day: prev.selectedDay,
          score: prev.score,
          round: prev.round,
          eliminated: prev.eliminatedList,
          ignitor: JSON.parse(JSON.stringify(prev.ignitorData)),
        },
        ...(prev.history || []),
      ],
    }));
  };

  const resetApp = () => {
    saveToHistory();
    setAppState(prev => ({
      ...prev,
      phase: 'MENU',
      selectedDay: null,
      ignitorData: {},
      activeExercises: [],
      roundInputs: {},
      score: 0,
      round: 1,
      eliminatedList: [],
      lastReps: {},
    }));
  };

  // --- Loading ---
  if (!loaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  // ============ MENU ============
  if (phase === 'MENU') {
    return (
      <div className="animate-in" style={{ minHeight: 'calc(100vh - 50px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.03em', color: 'var(--accent-orange)', marginBottom: 4 }}>
            JACKED
          </h1>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-secondary)' }}>
            CLASSIC
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 380 }}>
          {['PULL', 'PUSH', 'LEGS'].map(day => (
            <button
              key={day}
              onClick={() => handleStartIgnitor(day)}
              style={{
                background: 'var(--bg-card)',
                border: '2px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px 20px',
                color: 'var(--text-primary)',
                fontSize: '1.2rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-orange)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'none'; }}
            >
              <span>{day} DAY</span>
              <span style={{ color: 'var(--accent-orange)' }}>→</span>
            </button>
          ))}
        </div>

        {/* History link */}
        {history.length > 0 && (
          <div style={{ marginTop: 32, width: '100%', maxWidth: 380 }}>
            <details style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <summary style={{ padding: 12, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', listStyle: 'none' }}>
                📊 Past Results ({history.length})
              </summary>
              <div style={{ padding: '0 12px 12px' }}>
                {history.slice(0, 10).map((h, i) => {
                  const rank = getRank(h.score);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {h.day} — {new Date(h.date).toLocaleDateString()}
                      </span>
                      <span style={{ fontWeight: 800, color: rank.color }}>
                        {h.score} ({rank.title})
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  }

  // ============ IGNITOR ============
  if (phase === 'IGNITOR') {
    return (
      <div className="animate-in" style={{ minHeight: 'calc(100vh - 50px)', paddingBottom: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, position: 'sticky', top: 49, zIndex: 10, background: 'rgba(2,6,23,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={() => setPhase('MENU')} className="btn-back">← Back</button>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-orange)' }}>{selectedDay} // IGNITOR</h2>
        </div>

        <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
          <div className="section-card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Set your Base Weight & Max Reps. This determines your Path and X-tinction Threshold.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-orange)', fontWeight: 600, fontSize: '0.8rem' }}>
              ⏱ Rest 2 minutes between each ignitor set.
            </div>
          </div>

          {WORKOUT_DATA[selectedDay].map(ex => {
            const data = ignitorData[ex.id] || { path: 'Jacked', threshold: 6 };
            const pathClass = PATH_COLORS[data.path] || 'jacked';
            return (
              <div key={ex.id} className="section-card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.2, width: '65%' }}>{ex.base}</h3>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`path-tag ${pathClass}`}>{data.path}</span>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>Threshold: {data.threshold}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Weight */}
                  <div style={{ background: 'var(--bg-secondary)', padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <label style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Weight (lbs)</label>
                    <input
                      type="number"
                      placeholder="0"
                      className="form-input"
                      value={data.weight || ''}
                      onChange={e => handleIgnitorChange(ex.id, 'weight', e.target.value)}
                      style={{ width: '100%', textAlign: 'center', fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[-5, -1, 1, 5].map(amt => (
                        <button key={amt} onClick={() => adjustIgnitorValue(ex.id, 'weight', amt)} className="btn-secondary" style={{ flex: 1, padding: '6px 0', fontSize: '0.7rem', fontWeight: 700 }}>
                          {amt > 0 ? '+' : ''}{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reps */}
                  <div style={{ background: 'var(--bg-secondary)', padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <label style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Max Reps</label>
                    <input
                      type="number"
                      placeholder="0"
                      className="form-input"
                      value={data.reps || ''}
                      onChange={e => handleIgnitorChange(ex.id, 'reps', e.target.value)}
                      style={{ width: '100%', textAlign: 'center', fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[-5, -1, 1, 5].map(amt => (
                        <button key={amt} onClick={() => adjustIgnitorValue(ex.id, 'reps', amt)} className="btn-secondary" style={{ flex: 1, padding: '6px 0', fontSize: '0.7rem', fontWeight: 700 }}>
                          {amt > 0 ? '+' : ''}{amt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Start button */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', padding: 16, background: 'rgba(2,6,23,0.95)', borderTop: '1px solid var(--border-color)', zIndex: 20 }}>
          <button onClick={startChallenge} className="btn-primary">
            🔥 START CHALLENGE
          </button>
        </div>
      </div>
    );
  }

  // ============ WORKOUT ============
  if (phase === 'WORKOUT') {
    return (
      <div className="animate-in" style={{ minHeight: 'calc(100vh - 50px)', display: 'flex', flexDirection: 'column', paddingBottom: 160 }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 49, zIndex: 20 }}>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            ROUND <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 800 }}>{round}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-orange)', fontWeight: 800, fontSize: '1.1rem' }}>
            🏆 {score}
          </div>
        </div>

        {/* Exercise cards */}
        <div style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600, margin: '0 auto', width: '100%' }}>
          {activeExercises.map(id => {
            const exData = WORKOUT_DATA[selectedDay]?.find(e => e.id === id);
            const userData = ignitorData[id] || {};
            const pathClass = PATH_COLORS[userData.path] || 'jacked';

            return (
              <div key={id} className="section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: 900 }}>{exData?.base}</h2>
                  <span className={`path-tag ${pathClass}`}>{userData.path}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Stats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', textAlign: 'center', minWidth: 56 }}>
                      <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>LBS</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace' }}>{userData.weight}</div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', textAlign: 'center', minWidth: 56 }}>
                      <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Goal</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent-red)' }}>&gt; {userData.threshold}</div>
                    </div>
                  </div>

                  {/* Input */}
                  <div style={{ flex: 1, background: 'rgba(30,41,59,0.3)', borderRadius: 'var(--radius-md)', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, maxWidth: 260, margin: '0 auto' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onMouseDown={() => adjustRoundReps(id, -5)} className="stepper-btn" style={{ width: 34, height: 36, fontSize: '0.7rem' }}>-5</button>
                      <button onMouseDown={() => adjustRoundReps(id, -1)} className="stepper-btn" style={{ width: 34, height: 36, fontSize: '0.9rem' }}>−</button>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={roundInputs[id] || ''}
                      onChange={e => handleRoundInputChange(id, e.target.value)}
                      style={{ width: 48, background: 'transparent', textAlign: 'center', fontSize: '1.5rem', fontWeight: 900, color: '#fff', border: 'none', outline: 'none', fontFamily: 'Outfit' }}
                    />
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onMouseDown={() => adjustRoundReps(id, 1)} className="stepper-btn" style={{ width: 34, height: 36, fontSize: '0.9rem' }}>+</button>
                      <button onMouseDown={() => adjustRoundReps(id, 5)} className="stepper-btn" style={{ width: 34, height: 36, fontSize: '0.7rem' }}>+5</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', padding: '12px 16px', background: 'rgba(2,6,23,0.97)', borderTop: '1px solid var(--border-color)', zIndex: 20 }}>
          <button onClick={submitRound} className="btn-primary" style={{ fontSize: '1.05rem', marginBottom: 8 }}>
            COMPLETE ROUND ✓
          </button>
          <button onClick={requestGiveUp} style={{
            width: '100%', border: 'none', background: 'none', padding: '10px',
            fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
            color: giveUpConfirm ? 'var(--accent-red)' : 'var(--text-dim)',
            transition: 'all 0.2s',
          }}>
            {giveUpConfirm ? 'CONFIRM END?' : 'End Challenge'}
          </button>
        </div>
      </div>
    );
  }

  // ============ REST ============
  if (phase === 'REST') {
    const isLastMan = activeExercises.length === 1;
    const maxTime = isLastMan ? 10 : 60;
    const progress = (timeLeft / maxTime) * 100;

    return (
      <div className="animate-in" style={{
        minHeight: 'calc(100vh - 50px)',
        background: isLastMan ? 'linear-gradient(to bottom, #1a0505, var(--bg-primary))' : 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            ROUND <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 800 }}>{round}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-orange)', fontWeight: 800, fontSize: '1.1rem' }}>
            🏆 {score}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
          {isLastMan && <div style={{ position: 'absolute', inset: 0, animation: 'timer-pulse 2s ease-in-out infinite', background: 'rgba(127,29,29,0.15)', pointerEvents: 'none' }} />}

          <div style={{ fontWeight: 900, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 16 }}>
            {isLastMan ? 'LAST MAN STANDING' : 'REST'}
          </div>

          {/* Circular timer */}
          <div style={{ position: 'relative', width: 192, height: 192, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
            <svg style={{ position: 'absolute', width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="96" cy="96" r="86" fill="none" stroke="var(--border-color)" strokeWidth="6" />
              <circle cx="96" cy="96" r="86" fill="none"
                stroke={isLastMan ? 'var(--accent-red)' : 'var(--accent-orange)'}
                strokeWidth="6" strokeDasharray="540"
                strokeDashoffset={540 - (540 * progress) / 100}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, fontFamily: 'monospace', zIndex: 1 }}>{timeLeft}</div>
          </div>

          {/* Up next */}
          <div className="section-card" style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Up Next</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Round {round + 1}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {activeExercises.length} Exercises Remaining
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32, width: '100%', maxWidth: 340 }}>
            <button onClick={() => setTimeLeft(0)} className="btn-secondary" style={{ width: '100%', padding: 14, fontWeight: 700 }}>
              Skip Rest
            </button>
            <button onClick={requestGiveUp} style={{
              width: '100%', border: 'none', background: 'none', padding: 10,
              fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
              color: giveUpConfirm ? 'var(--accent-red)' : 'var(--text-dim)',
            }}>
              {giveUpConfirm ? 'CONFIRM END?' : 'End Challenge'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ RESULTS ============
  if (phase === 'RESULTS') {
    const rank = getRank(score);
    return (
      <div className="animate-in" style={{ minHeight: 'calc(100vh - 50px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, fontStyle: 'italic', color: 'var(--text-dim)', marginBottom: 4 }}>GAME OVER</h1>
          <p style={{ color: 'var(--text-muted)' }}>All exercises X-tinct</p>
        </div>

        {/* Score circle */}
        <div style={{
          width: 220, height: 220, borderRadius: '50%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          border: `4px solid ${rank.color}`, background: 'var(--bg-secondary)',
          marginBottom: 24, boxShadow: `0 0 40px -10px ${rank.color}`,
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Total Score</div>
          <div style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: rank.color, background: 'rgba(255,255,255,0.05)', padding: '2px 12px', borderRadius: 'var(--radius-sm)', marginTop: 4 }}>{rank.title}</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 340, marginBottom: 24 }}>
          <div className="section-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rounds</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{round}</div>
          </div>
          <div className="section-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Eliminated</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-red)' }}>
              {eliminatedList.length}<span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>/4</span>
            </div>
          </div>
        </div>

        {/* Casualty Report */}
        <div className="section-card" style={{ width: '100%', maxWidth: 340, marginBottom: 24, maxHeight: 200, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Casualty Report</h3>
          {eliminatedList.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
              <span style={{ color: 'var(--accent-red)', fontFamily: 'monospace', fontSize: '0.7rem' }}>Round {item.round}</span>
            </div>
          ))}
        </div>

        <button onClick={resetApp} className="btn-secondary" style={{ width: '100%', maxWidth: 340, padding: 14 }}>
          🔄 Play Again
        </button>
      </div>
    );
  }

  return null;
}
