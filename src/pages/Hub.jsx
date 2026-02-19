import { useNavigate } from 'react-router-dom';

export default function Hub() {
  const navigate = useNavigate();

  return (
    <div className="animate-in" style={{ maxWidth: 520, margin: '0 auto', padding: '40px 16px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.03em', color: 'var(--accent-orange)', marginBottom: 4 }}>
          JACKED
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '1rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Challenge Tracker
        </p>
      </div>

      {/* Challenge Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 10×400 Card */}
        <div
          className="challenge-card"
          style={{ '--card-accent': '#ef4444' }}
          onClick={() => navigate('/10x400')}
        >
          <div className="title" style={{ color: 'var(--text-primary)' }}>
            <span style={{ color: '#ef4444' }}>"10 BY"</span> 400
          </div>
          <div className="subtitle">
            10 sets × 10 reps across 4 exercises. Hit 40 to dominate.
          </div>
          <div className="arrow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>

        {/* Classic Card */}
        <div
          className="challenge-card"
          style={{ '--card-accent': '#f97316' }}
          onClick={() => navigate('/classic')}
        >
          <div className="title" style={{ color: 'var(--text-primary)' }}>
            JACKED <span style={{ color: '#f97316' }}>CLASSIC</span>
          </div>
          <div className="subtitle">
            Last Man Standing elimination. Survive as many rounds as you can.
          </div>
          <div className="arrow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: 48 }}>
        Sign in to sync your progress across devices
      </p>
    </div>
  );
}
