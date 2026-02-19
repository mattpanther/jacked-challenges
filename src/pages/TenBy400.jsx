import { useState, useEffect, useRef, useCallback } from 'react';
import { useChallengeState } from '../firebase.jsx';

// --- Constants ---
const EXERCISE_DEFS = [
  { id: 'thrusters', label: 'DB Thrusters', type: '14-16 RM' },
  { id: 'rows', label: 'DB Renegade Rows', type: '7-8 RM' },
  { id: 'press', label: 'DB Floor Press', type: '14-16 RM' },
  { id: 'highpull', label: 'DB Power High Pull', type: '14-16 RM' },
];

const DEFAULT_STATE = {
  view: 'challenge',
  ignitor: {},
  stations: {
    thrusters: { sets: [], status: 'active' },
    rows: { sets: [], status: 'pending' },
    press: { sets: [], status: 'pending' },
    highpull: { sets: [], status: 'pending' },
  },
  archive: [],
};

// --- Audio ---
let audioCtx = null;
const getAudioCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
};
const playChime = () => {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    [880, 1047, 1319].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  } catch (e) { /* ignore audio errors */ }
};

// --- Confetti ---
const spawnConfetti = (anchorEl) => {
  if (!anchorEl) return;
  const emojis = ['🎉', '🔥', '💪', '⭐', '✨', '🏆'];
  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div');
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;font-size:${16 + Math.random() * 12}px;pointer-events:none;z-index:100;transition:all 0.8s cubic-bezier(0.25,0.46,0.45,0.94);opacity:1;`;
    document.body.appendChild(el);
    const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.5;
    const dist = 50 + Math.random() * 60;
    requestAnimationFrame(() => {
      el.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 30}px) scale(1.3) rotate(${Math.random() * 360}deg)`;
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 1000);
  }
};

export default function TenBy400() {
  const [appState, setAppState, loaded] = useChallengeState('ten-by-400', DEFAULT_STATE);
  const [activeExId, setActiveExId] = useState(null);
  const [selectedReps, setSelectedReps] = useState(null);
  const [view, setView] = useState('challenge');
  const [ignitorOpen, setIgnitorOpen] = useState(false);

  // Timer
  const [timerEndTime, setTimerEndTime] = useState(0);
  const [timerDisplay, setTimerDisplay] = useState('');
  const [timerLabel, setTimerLabel] = useState('Rest');
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef(null);
  const dotRefs = useRef({});

  // Find active exercise ID
  useEffect(() => {
    const active = EXERCISE_DEFS.find(ex => appState.stations[ex.id]?.status === 'active');
    setActiveExId(active ? active.id : null);
  }, [appState.stations]);

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return;
    const tick = () => {
      const remaining = timerEndTime - Date.now();
      if (remaining <= 0) {
        setTimerRunning(false);
        setTimerDisplay('');
        playChime();
      } else {
        const secs = Math.ceil(remaining / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        setTimerDisplay(`${m}:${String(s).padStart(2, '0')}`);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 100);
    return () => clearInterval(timerRef.current);
  }, [timerRunning, timerEndTime]);

  const startTimer = useCallback((seconds, label = 'Rest') => {
    setTimerEndTime(Date.now() + seconds * 1000);
    setTimerLabel(label);
    setTimerRunning(true);
    try { getAudioCtx().resume(); } catch (e) { /* */ }
  }, []);

  const stopTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerDisplay('');
    clearInterval(timerRef.current);
  }, []);

  const timerSeconds = timerRunning ? Math.ceil((timerEndTime - Date.now()) / 1000) : 0;

  // --- Helpers ---
  const getScore = () => {
    let total = 0;
    Object.values(appState.stations).forEach(st => {
      total += (st.sets || []).filter(s => s.reps >= 10).length;
    });
    return total;
  };

  const getStationWeight = (exId) => {
    const sets = appState.stations[exId]?.sets || [];
    if (sets.length > 0) return sets[sets.length - 1].weight;
    return appState.ignitor[exId]?.weight || '';
  };

  const activateNextStation = useCallback((currentExId) => {
    const idx = EXERCISE_DEFS.findIndex(e => e.id === currentExId);
    setAppState(prev => {
      const next = { ...prev, stations: { ...prev.stations } };
      if (idx < EXERCISE_DEFS.length - 1) {
        const nextId = EXERCISE_DEFS[idx + 1].id;
        next.stations[nextId] = { ...next.stations[nextId], status: 'active' };
      }
      return next;
    });
    if (idx < EXERCISE_DEFS.length - 1) {
      startTimer(300, 'Next Exercise');
    } else {
      stopTimer();
    }
  }, [setAppState, startTimer, stopTimer]);

  // --- Log a set ---
  const handleLogSet = useCallback((weightVal) => {
    if (!activeExId || selectedReps === null) return;
    const weight = parseFloat(weightVal) || 0;
    const reps = selectedReps;
    const isSuccess = reps >= 10;

    setAppState(prev => {
      const next = { ...prev, stations: { ...prev.stations } };
      const station = { ...next.stations[activeExId] };
      const sets = [...(station.sets || [])];

      const lastSet = sets.length > 0 ? sets[sets.length - 1] : null;
      const isRetryAttempt = lastSet && lastSet.reps < 10 && !lastSet.retryAttempt;

      sets.push({ weight, reps, retryAttempt: isRetryAttempt });
      station.sets = sets;

      const newSuccessCount = sets.filter(s => s.reps >= 10).length;

      if (isSuccess) {
        if (newSuccessCount >= 10) {
          station.status = 'completed';
          const idx = EXERCISE_DEFS.findIndex(e => e.id === activeExId);
          if (idx < EXERCISE_DEFS.length - 1) {
            const nextId = EXERCISE_DEFS[idx + 1].id;
            next.stations[nextId] = { ...next.stations[nextId], status: 'active' };
          }
        }
      } else if (isRetryAttempt) {
        station.status = 'failed';
        const idx = EXERCISE_DEFS.findIndex(e => e.id === activeExId);
        if (idx < EXERCISE_DEFS.length - 1) {
          const nextId = EXERCISE_DEFS[idx + 1].id;
          next.stations[nextId] = { ...next.stations[nextId], status: 'active' };
        }
      }

      next.stations[activeExId] = station;
      return next;
    });

    // Timer
    if (isSuccess) {
      const afterSets = [...(appState.stations[activeExId]?.sets || []), { weight, reps }];
      const newSuccessCount = afterSets.filter(s => s.reps >= 10).length;
      if (newSuccessCount >= 10) {
        const idx = EXERCISE_DEFS.findIndex(e => e.id === activeExId);
        if (idx < EXERCISE_DEFS.length - 1) startTimer(300, 'Next Exercise');
        else stopTimer();
      } else {
        startTimer(60, 'Rest');
      }
      // Animate dot
      setTimeout(() => {
        const dotEl = dotRefs.current[`${activeExId}-${newSuccessCount - 1}`];
        if (dotEl) {
          dotEl.classList.add('swell');
          if (newSuccessCount === 5 || newSuccessCount === 10) spawnConfetti(dotEl);
        }
      }, 50);
    } else {
      const lastSet = appState.stations[activeExId]?.sets?.slice(-1)[0];
      const isRetry = lastSet && lastSet.reps < 10 && !lastSet.retryAttempt;
      if (isRetry) {
        const idx = EXERCISE_DEFS.findIndex(e => e.id === activeExId);
        if (idx < EXERCISE_DEFS.length - 1) startTimer(300, 'Next Exercise');
        else stopTimer();
      } else {
        startTimer(90, 'Retry Rest');
      }
    }
    setSelectedReps(null);
  }, [activeExId, selectedReps, appState, setAppState, startTimer, stopTimer]);

  // --- Archive ---
  const archiveWorkout = useCallback(() => {
    const score = getScore();
    setAppState(prev => {
      const entry = {
        date: Date.now(),
        score,
        ignitor: JSON.parse(JSON.stringify(prev.ignitor)),
        stations: JSON.parse(JSON.stringify(prev.stations)),
      };
      return {
        ...prev,
        stations: DEFAULT_STATE.stations,
        archive: [entry, ...(prev.archive || [])],
      };
    });
    stopTimer();
    setView('archive');
  }, [setAppState, stopTimer]);

  const resetWorkout = useCallback(() => {
    if (!window.confirm('Reset all current workout data?')) return;
    setAppState(prev => ({ ...prev, stations: { ...DEFAULT_STATE.stations } }));
    stopTimer();
  }, [setAppState, stopTimer]);

  const score = getScore();

  // --- RENDER ---
  if (!loaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ maxWidth: 680, margin: '0 auto', padding: '12px 12px 240px' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
          <span style={{ color: 'var(--accent-red)' }}>"10 BY"</span> 400 CHALLENGE
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setView('challenge')}
          style={{
            padding: '10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid',
            borderColor: view === 'challenge' ? 'var(--accent-red)' : 'var(--text-dim)',
            background: view === 'challenge' ? 'var(--accent-red)' : 'var(--bg-card)',
            color: view === 'challenge' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          ACTIVE CHALLENGE
        </button>
        <button
          onClick={() => setView('archive')}
          style={{
            padding: '10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid',
            borderColor: view === 'archive' ? 'var(--accent-red)' : 'var(--text-dim)',
            background: view === 'archive' ? 'var(--accent-red)' : 'var(--bg-card)',
            color: view === 'archive' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          ARCHIVE
        </button>
      </div>

      {view === 'challenge' && (
        <>
          {/* Scoreboard */}
          <div className="scoreboard">
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-red)' }}>
                  {score}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/40</span>
                </div>
              </div>
              {activeExId && (
                <>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Now</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                      {EXERCISE_DEFS.find(e => e.id === activeExId)?.label.replace('DB ', '')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Set</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      {(() => {
                        const sets = appState.stations[activeExId]?.sets || [];
                        const last = sets[sets.length - 1];
                        const isRetry = last && last.reps < 10 && !last.retryAttempt;
                        const successCount = sets.filter(s => s.reps >= 10).length;
                        if (successCount >= 10) return 'Done!';
                        return isRetry ? 'Retry' : sets.length + 1;
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Ignitor */}
          <div className="section-card">
            <button
              onClick={() => setIgnitorOpen(!ignitorOpen)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 0 }}
            >
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Part 1: Ignitor Sets</h2>
              <span style={{ color: 'var(--accent-blue)', fontSize: '0.8rem' }}>{ignitorOpen ? 'Hide' : 'Show'}</span>
            </button>
            {ignitorOpen && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 10 }}>1 set to failure — determine your working weight.</p>
                {EXERCISE_DEFS.map(ex => {
                  const data = appState.ignitor[ex.id] || { weight: '', reps: '' };
                  const lastArchive = appState.archive?.[0];
                  const prev = lastArchive?.ignitor?.[ex.id];
                  return (
                    <div key={ex.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{ex.label}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{ex.type}</div>
                        {prev && (prev.weight || prev.reps) && (
                          <button
                            onClick={() => setAppState(p => ({
                              ...p,
                              ignitor: {
                                ...p.ignitor,
                                [ex.id]: { weight: prev.weight || '', reps: prev.reps || '' }
                              }
                            }))}
                            style={{ fontSize: '0.6rem', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}
                          >
                            Last: {prev.weight || '-'}lbs × {prev.reps || '-'}
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Lbs"
                        inputMode="decimal"
                        value={data.weight}
                        onChange={e => setAppState(p => ({
                          ...p,
                          ignitor: { ...p.ignitor, [ex.id]: { ...(p.ignitor[ex.id] || {}), weight: e.target.value } }
                        }))}
                        style={{ textAlign: 'center', fontSize: '0.9rem' }}
                      />
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Reps"
                        inputMode="numeric"
                        value={data.reps}
                        onChange={e => setAppState(p => ({
                          ...p,
                          ignitor: { ...p.ignitor, [ex.id]: { ...(p.ignitor[ex.id] || {}), reps: e.target.value } }
                        }))}
                        style={{ textAlign: 'center', fontSize: '0.9rem' }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stations */}
          {EXERCISE_DEFS.map(ex => {
            const station = appState.stations[ex.id];
            const sets = station?.sets || [];
            const successCount = sets.filter(s => s.reps >= 10).length;
            const isActive = station?.status === 'active';

            if (!isActive) {
              // Chip
              const icon = station?.status === 'completed' ? '✓' : station?.status === 'failed' ? '✗' : '○';
              const color = station?.status === 'completed' ? 'var(--accent-green)' : station?.status === 'failed' ? 'var(--accent-red)' : 'var(--text-muted)';
              return (
                <div key={ex.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  background: 'var(--bg-card)', border: `1px solid ${station?.status === 'completed' ? 'var(--accent-green)' : station?.status === 'failed' ? 'var(--accent-red)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', marginRight: 8, marginBottom: 8,
                }}>
                  <span style={{ color, fontWeight: 700 }}>{icon}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{ex.label}</span>
                  {station?.status !== 'pending' && <span style={{ color, fontWeight: 700, marginLeft: 8 }}>{successCount}/10</span>}
                </div>
              );
            }

            // Active station card
            const lastSet = sets[sets.length - 1];
            const isRetry = lastSet && lastSet.reps < 10 && !lastSet.retryAttempt;
            const showInput = successCount < 10;

            return (
              <div key={ex.id} className="section-card" style={{ border: '1px solid var(--accent-blue)', boxShadow: '0 0 20px rgba(56,189,248,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Exercise</div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{ex.label}</h3>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{ex.type}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-blue)' }}>
                      {successCount}<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/10</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>sets done</div>
                  </div>
                </div>

                {/* Progress dots */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 }}>
                  {Array.from({ length: 10 }).map((_, i) => {
                    const s = sets.filter(s => s.reps >= 10)[i];
                    return (
                      <div
                        key={i}
                        ref={el => { dotRefs.current[`${ex.id}-${i}`] = el; }}
                        className={`progress-dot ${s ? 'success' : ''}`}
                        title={s ? `${s.weight}lbs × ${s.reps}` : `Set ${i + 1}`}
                      />
                    );
                  })}
                  {sets.filter(s => s.reps < 10).map((s, i) => (
                    <div key={`f${i}`} className={`progress-dot ${s.retryAttempt ? 'fail' : 'retry'}`}
                      title={`${s.weight}lbs × ${s.reps}`} />
                  ))}
                </div>

                {/* Inline timer */}
                {timerRunning && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>{timerLabel}</div>
                    <div className={`timer-display ${timerSeconds <= 10 ? 'urgent' : ''} ${timerSeconds <= 5 ? 'pulsing' : ''}`}>{timerDisplay}</div>
                    <button onClick={stopTimer} className="btn-secondary" style={{ marginTop: 8, fontSize: '0.7rem', padding: '6px 16px' }}>Skip</button>
                  </div>
                )}

                {/* Recent sets */}
                {sets.slice(-2).map((s, i) => {
                  const actualIdx = sets.length - 2 + i;
                  if (actualIdx < 0) return null;
                  const ok = s.reps >= 10;
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Set {actualIdx + 1}{s.retryAttempt ? ' (Retry)' : ''}</span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{s.weight}lbs × {s.reps}</span>
                      <span style={{ color: ok ? 'var(--accent-green)' : s.retryAttempt ? 'var(--accent-red)' : 'var(--accent-yellow)', fontWeight: 700 }}>
                        {ok ? '✓' : s.retryAttempt ? '✗' : '↻'}
                      </span>
                    </div>
                  );
                })}

                {!showInput && (
                  <button onClick={() => {
                    setAppState(p => {
                      const next = { ...p, stations: { ...p.stations } };
                      next.stations[ex.id] = { ...next.stations[ex.id], status: 'completed' };
                      const idx = EXERCISE_DEFS.findIndex(e => e.id === ex.id);
                      if (idx < EXERCISE_DEFS.length - 1) {
                        const nextId = EXERCISE_DEFS[idx + 1].id;
                        next.stations[nextId] = { ...next.stations[nextId], status: 'active' };
                      }
                      return next;
                    });
                    if (EXERCISE_DEFS.findIndex(e => e.id === ex.id) < EXERCISE_DEFS.length - 1) {
                      startTimer(300, 'Next Exercise');
                    } else {
                      stopTimer();
                    }
                  }} className="btn-primary" style={{ marginTop: 12, background: 'var(--accent-green)' }}>
                    Move to Next Exercise →
                  </button>
                )}
              </div>
            );
          })}

          {/* Sticky input bar */}
          {activeExId && (() => {
            const station = appState.stations[activeExId];
            const sets = station?.sets || [];
            const successCount = sets.filter(s => s.reps >= 10).length;
            if (successCount >= 10 || station?.status !== 'active') return null;

            const lastSet = sets[sets.length - 1];
            const isRetry = lastSet && lastSet.reps < 10 && !lastSet.retryAttempt;
            const defaultWeight = getStationWeight(activeExId);

            return (
              <StickyBar
                setNum={isRetry ? 'RETRY' : sets.length + 1}
                isRetry={isRetry}
                defaultWeight={defaultWeight}
                selectedReps={selectedReps}
                onSelectReps={setSelectedReps}
                onLog={handleLogSet}
                lastReps={lastSet?.reps}
              />
            );
          })()}

          {/* Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <button onClick={archiveWorkout} className="btn-primary" style={{ background: 'var(--accent-green)', fontSize: '0.85rem' }}>
              Finish & Archive
            </button>
            <button onClick={resetWorkout} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
              Reset Data
            </button>
          </div>
        </>
      )}

      {/* Archive view */}
      {view === 'archive' && (
        <div className="section-card">
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Workout Archive</h2>
          {(!appState.archive || appState.archive.length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No archives yet.</p>
          ) : (
            appState.archive.map((entry, idx) => (
              <details key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginBottom: 8, overflow: 'hidden' }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, cursor: 'pointer', listStyle: 'none' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {new Date(entry.date).toLocaleDateString()} {new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-red)', fontSize: '1.1rem' }}>
                    {entry.score}<span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/40</span>
                  </span>
                </summary>
                <div style={{ padding: 12, borderTop: '1px solid var(--border-color)' }}>
                  {entry.stations && EXERCISE_DEFS.map(def => {
                    const st = entry.stations[def.id];
                    if (!st) return null;
                    const success = (st.sets || []).filter(s => s.reps >= 10).length;
                    return (
                      <div key={def.id} style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 'var(--radius-sm)', marginBottom: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700 }}>{def.label}</span>
                          <span style={{ fontWeight: 700, color: st.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {st.status?.toUpperCase()} ({success}/10)
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: '0.6rem' }}>
                          {(st.sets || []).map((s, i) => (
                            <span key={i} style={{ color: s.reps >= 10 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              S{i + 1}:{s.weight}×{s.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this archive entry?')) {
                        setAppState(prev => ({
                          ...prev,
                          archive: prev.archive.filter((_, i) => i !== idx)
                        }));
                      }
                    }}
                    style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8, textDecoration: 'underline' }}
                  >
                    Delete
                  </button>
                </div>
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// --- Sticky Input Bar Component ---
function StickyBar({ setNum, isRetry, defaultWeight, selectedReps, onSelectReps, onLog, lastReps }) {
  const [weight, setWeight] = useState(defaultWeight || '');
  const repValues = [6, 7, 8, 9, 10, 11, 12];

  useEffect(() => {
    setWeight(defaultWeight || '');
  }, [defaultWeight]);

  // Pre-select reps from last set
  useEffect(() => {
    if (lastReps >= 6 && lastReps <= 12) {
      onSelectReps(lastReps);
    }
  }, [lastReps]);

  return (
    <div className="sticky-bar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isRetry ? 'var(--accent-red)' : 'var(--text-primary)' }}>
          {isRetry ? '⚠ RETRY Attempt' : `Set ${setNum}`}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Goal: 10 reps</span>
      </div>

      {/* Weight */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="stepper-btn" onClick={() => setWeight(w => Math.max(0, (parseFloat(w) || 0) - 5))}>−</button>
        <input
          type="number"
          className="form-input"
          placeholder="lbs"
          inputMode="decimal"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          style={{ flex: 1, textAlign: 'center', fontSize: '1.1rem', fontWeight: 700 }}
        />
        <button className="stepper-btn" onClick={() => setWeight(w => (parseFloat(w) || 0) + 5)}>+</button>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 24 }}>lbs</span>
      </div>

      {/* Rep buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {repValues.map(rep => (
          <button
            key={rep}
            className={`rep-btn ${rep >= 10 ? 'success-rep' : ''} ${selectedReps === rep ? 'selected' : ''}`}
            onClick={() => onSelectReps(rep)}
          >
            {rep}
          </button>
        ))}
      </div>

      {/* Log button */}
      <button
        onClick={() => onLog(weight)}
        className="btn-primary"
        style={{ background: 'var(--accent-blue)', fontSize: '1.1rem', letterSpacing: '0.05em' }}
      >
        LOG SET
      </button>
    </div>
  );
}
