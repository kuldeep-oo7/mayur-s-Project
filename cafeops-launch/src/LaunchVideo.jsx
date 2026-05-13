import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';

// ─── Shared helpers ──────────────────────────────────────────────────────────
const ease = Easing.bezier(0.22, 1, 0.36, 1);

function fadeUp(frame, from, range = 18) {
  const t = interpolate(frame, [from, from + range], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  return { opacity: t, transform: `translateY(${(1 - t) * 28}px)` };
}

function scaleIn(frame, from, fps, range = 22) {
  const s = spring({ frame: frame - from, fps, config: { damping: 18, mass: 0.6, stiffness: 140 } });
  const op = interpolate(frame, [from, from + range], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { transform: `scale(${0.5 + 0.5 * s})`, opacity: op };
}

// ─── Colour tokens ────────────────────────────────────────────────────────────
const NAVY   = '#0A1628';
const BLUE   = '#2563EB';
const CYAN   = '#06B6D4';
const AMBER  = '#F59E0B';
const GREEN  = '#22C55E';
const WHITE  = '#FFFFFF';

// ─── Scene 1 (0–60): Dramatic logo reveal ────────────────────────────────────
function SceneLogo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bgOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  const ring1 = spring({ frame, fps, config: { damping: 14, stiffness: 100, mass: 0.7 } });
  const ring2 = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 80, mass: 0.8 } });

  const textStyle = fadeUp(frame, 28);
  const tagStyle  = fadeUp(frame, 42);
  const dotStyle  = { ...scaleIn(frame, 10, fps), display: 'inline-block' };

  return (
    <AbsoluteFill style={{ background: NAVY, opacity: bgOpacity }}>
      {/* Radial glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 600, height: 600, borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${BLUE}33 0%, transparent 70%)`,
        opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }),
      }} />

      {/* Outer ring */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 220 * ring1, height: 220 * ring1, borderRadius: '50%',
        border: `2.5px solid ${CYAN}66`,
        transform: 'translate(-50%, -50%)',
        opacity: ring1,
      }} />
      {/* Inner ring */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 150 * ring2, height: 150 * ring2, borderRadius: '50%',
        border: `2px solid ${BLUE}99`,
        transform: 'translate(-50%, -50%)',
        opacity: ring2,
      }} />

      {/* Logo pill */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: `translate(-50%, -58%) scale(${0.5 + 0.5 * ring2})`,
        background: `linear-gradient(135deg, ${BLUE}, ${CYAN})`,
        borderRadius: 18, padding: '10px 32px',
        opacity: ring2,
        boxShadow: `0 0 40px ${CYAN}55`,
      }}>
        <span style={{ color: WHITE, fontSize: 42, fontWeight: 900, fontFamily: 'sans-serif', letterSpacing: 2 }}>
          Café<span style={{ color: CYAN }}>Ops</span>
        </span>
      </div>

      {/* Tagline */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, 20px)',
        textAlign: 'center', ...textStyle
      }}>
        <p style={{ color: WHITE, fontSize: 20, fontFamily: 'sans-serif', fontWeight: 600, margin: 0 }}>
          Smart Canteen Management Platform
        </p>
      </div>

      {/* Sub tagline */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, 58px)',
        textAlign: 'center', ...tagStyle
      }}>
        <p style={{ color: CYAN, fontSize: 13, fontFamily: 'sans-serif', letterSpacing: 3, margin: 0 }}>
          BUILT FOR INDIA • POWERED BY DATA
        </p>
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 2 (60–140): Feature flyout cards ──────────────────────────────────
const FEATURES = [
  { icon: '📊', title: 'Real-Time\nSpend Analytics',  color: BLUE,  delay: 0  },
  { icon: '🏷️', title: 'Price Spike\nAlerts',         color: AMBER, delay: 10 },
  { icon: '💰', title: 'Budget vs\nActual Tracking',  color: GREEN, delay: 20 },
  { icon: '🧾', title: 'Invoice\nScanner',            color: CYAN,  delay: 30 },
  { icon: '📦', title: 'Vendor &\nItem Master',       color: '#A855F7', delay: 40 },
  { icon: '📤', title: 'Excel / Tally\nExport',       color: '#F43F5E', delay: 50 },
];

function FeatureCard({ icon, title, color, frame, delay }) {
  const style = fadeUp(frame, delay);
  return (
    <div style={{
      width: 160, background: '#0D1F3C', borderRadius: 16,
      padding: '18px 14px', textAlign: 'center',
      border: `1.5px solid ${color}44`,
      boxShadow: `0 4px 20px ${color}22`,
      ...style
    }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <div style={{
        color: WHITE, fontSize: 13, fontFamily: 'sans-serif',
        fontWeight: 700, lineHeight: 1.4, whiteSpace: 'pre-line'
      }}>{title}</div>
      <div style={{ width: 30, height: 3, background: color, borderRadius: 2, margin: '10px auto 0' }} />
    </div>
  );
}

function SceneFeatures() {
  const frame = useCurrentFrame();
  const bgFade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: NAVY, opacity: bgFade }}>
      {/* Top label */}
      <div style={{ ...fadeUp(frame, 0), position: 'absolute', top: 44, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{
          color: CYAN, fontSize: 11, fontFamily: 'sans-serif',
          letterSpacing: 4, fontWeight: 700
        }}>PLATFORM CAPABILITIES</span>
      </div>

      {/* Cards grid */}
      <div style={{
        position: 'absolute', top: 90, left: 0, right: 0,
        display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', gap: 18, padding: '0 60px'
      }}>
        {FEATURES.map((f, i) => (
          <FeatureCard key={i} {...f} frame={frame} />
        ))}
      </div>

      {/* Bottom tagline */}
      <div style={{ ...fadeUp(frame, 58), position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ color: WHITE, fontSize: 15, fontFamily: 'sans-serif', fontWeight: 600 }}>
          One dashboard. Complete canteen control.
        </span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 3 (140–200): Event & Sponsorship section ──────────────────────────
const EVENTS = [
  { icon: '🏆', name: 'Vendor Innovation Summit', date: 'Sep 2026', color: BLUE  },
  { icon: '📊', name: 'Cost Intelligence Forum',  date: 'Nov 2026', color: CYAN  },
  { icon: '🤝', name: 'Canteen Leaders Conclave', date: 'Jan 2027', color: AMBER },
];

function SceneEvents() {
  const frame = useCurrentFrame();
  const bgFade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#060E1D', opacity: bgFade }}>
      {/* Glow strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg, ${BLUE}, ${CYAN}, ${AMBER})`,
      }} />

      <div style={{ ...fadeUp(frame, 4), position: 'absolute', top: 34, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ color: CYAN, fontSize: 11, fontFamily: 'sans-serif', letterSpacing: 4, fontWeight: 700 }}>
          UPCOMING EVENTS — PARTNER & SPONSOR
        </span>
      </div>

      {/* Event cards row */}
      <div style={{
        position: 'absolute', top: 88, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 28
      }}>
        {EVENTS.map((ev, i) => {
          const s = fadeUp(frame, 14 + i * 12);
          return (
            <div key={i} style={{
              width: 200, background: '#0A1628', borderRadius: 16,
              border: `1.5px solid ${ev.color}55`,
              padding: '20px 16px', textAlign: 'center',
              boxShadow: `0 8px 30px ${ev.color}22`,
              ...s
            }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>{ev.icon}</div>
              <div style={{
                width: '100%', height: 3,
                background: ev.color, borderRadius: 2, marginBottom: 12
              }} />
              <div style={{
                color: WHITE, fontSize: 13, fontWeight: 700,
                fontFamily: 'sans-serif', lineHeight: 1.4, marginBottom: 10
              }}>{ev.name}</div>
              <div style={{
                display: 'inline-block', background: `${ev.color}22`,
                border: `1px solid ${ev.color}66`, borderRadius: 8,
                padding: '3px 12px', color: ev.color,
                fontSize: 11, fontFamily: 'sans-serif', fontWeight: 600
              }}>{ev.date}</div>
            </div>
          );
        })}
      </div>

      {/* Sponsorship tiers */}
      {['TITLE ₹25L', 'GOLD ₹15L', 'SILVER ₹8L', 'DIGITAL ₹3L'].map((t, i) => {
        const colors = [AMBER, '#EAB308', '#94A3B8', CYAN];
        const s = fadeUp(frame, 40 + i * 5);
        return (
          <div key={i} style={{
            position: 'absolute',
            bottom: 62, left: 60 + i * 195,
            background: '#0D1F3C', borderRadius: 10,
            border: `1px solid ${colors[i]}55`, padding: '8px 18px',
            ...s
          }}>
            <span style={{
              color: colors[i], fontSize: 12, fontWeight: 700, fontFamily: 'sans-serif'
            }}>{t}</span>
          </div>
        );
      })}

      <div style={{ ...fadeUp(frame, 52), position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ color: '#4A6FA5', fontSize: 10, fontFamily: 'sans-serif', letterSpacing: 2 }}>
          partnerships@cafeops.in  •  cafeops.in/events
        </span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 4 (200–240): CTA outro ────────────────────────────────────────────
function SceneCTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bgFade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const pulse = Math.sin(frame * 0.12) * 0.04 + 1;

  const ring = spring({ frame, fps, config: { damping: 12, stiffness: 90, mass: 0.8 } });

  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at center, #0F2744 0%, ${NAVY} 70%)`,
      opacity: bgFade
    }}>
      {/* Animated rings */}
      {[300, 420, 540].map((size, i) => (
        <div key={i} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: size * ring, height: size * ring, borderRadius: '50%',
          border: `1px solid ${CYAN}${['33', '22', '11'][i]}`,
          transform: 'translate(-50%, -50%)',
          opacity: ring * 0.6,
        }} />
      ))}

      {/* Logo (small, top) */}
      <div style={{
        ...fadeUp(frame, 6),
        position: 'absolute', top: 42, left: 0, right: 0, textAlign: 'center'
      }}>
        <span style={{ color: WHITE, fontSize: 16, fontFamily: 'sans-serif', fontWeight: 900, letterSpacing: 1 }}>
          Café<span style={{ color: CYAN }}>Ops</span>
        </span>
      </div>

      {/* Headline */}
      <div style={{
        ...fadeUp(frame, 12),
        position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center'
      }}>
        <p style={{
          color: WHITE, fontSize: 32, fontFamily: 'sans-serif',
          fontWeight: 900, margin: 0, lineHeight: 1.2
        }}>
          Ready to Sponsor an Event?
        </p>
        <p style={{ color: '#7A9BC0', fontSize: 15, fontFamily: 'sans-serif', margin: '12px 0 0' }}>
          Reach 500+ corporate canteen decision-makers across India
        </p>
      </div>

      {/* CTA button */}
      <div style={{
        ...fadeUp(frame, 24),
        position: 'absolute', top: '63%', left: '50%',
        transform: `translateX(-50%) scale(${pulse})`,
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${BLUE}, ${CYAN})`,
          borderRadius: 50, padding: '16px 48px',
          boxShadow: `0 0 40px ${CYAN}55`,
        }}>
          <span style={{ color: WHITE, fontSize: 16, fontFamily: 'sans-serif', fontWeight: 800 }}>
            Book a Sponsor Meeting →
          </span>
        </div>
      </div>

      {/* Bottom contact */}
      <div style={{ ...fadeUp(frame, 32), position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ color: '#2D4A6A', fontSize: 11, fontFamily: 'sans-serif', letterSpacing: 2 }}>
          partnerships@cafeops.in  |  +91 98765 43210  |  © 2026 CaféOps Technologies Pvt. Ltd.
        </span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Root composition ─────────────────────────────────────────────────────────
export const LaunchVideo = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0}   durationInFrames={65}>  <SceneLogo />     </Sequence>
      <Sequence from={60}  durationInFrames={85}>  <SceneFeatures /> </Sequence>
      <Sequence from={140} durationInFrames={65}>  <SceneEvents />   </Sequence>
      <Sequence from={200} durationInFrames={40}>  <SceneCTA />      </Sequence>
    </AbsoluteFill>
  );
};
