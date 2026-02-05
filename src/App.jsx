import React, { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { line, curveMonotoneX, arc } from 'd3-shape';
import { axisBottom, axisLeft } from 'd3-axis';
import 'd3-transition'; // extends selection with .transition()

// Edit Mode Context
const EditModeContext = createContext({ isEditMode: false });

// Design theme: Primary (neutrals + soft accents) + Secondary (blues, pink; no neon)
const colors = {
  bg: '#ffffff',
  surface: '#f8f8f8',
  surfaceHover: '#f0f0f0',
  border: '#e0e0e0',
  borderLight: '#e8e8e8',
  text: '#000000',
  textSecondary: '#333333',
  textMuted: '#5c5c5c',
  primary: '#000000',
  accent: '#6b9fc7',
  accentLight: '#c8dcec',
  accentHover: '#5a8fb5',
  success: '#6b9b7a',
  successLight: '#9bc4a8',
  warning: '#d4a574',
  danger: '#c97a7a',
  info: '#6ba3c7',
  purple: '#b8a5c9',
  pink: '#f5c4d8',
  orange: '#e8b890',
  gray50: '#f8f8f8',
  gray100: '#f0f0f0',
  gray200: '#e0e0e0',
  gray300: '#d0d0d0',
  gray400: '#9a9a9a',
  gray500: '#737373',
  gray600: '#525252',
  gray700: '#3d3d3d',
  gray800: '#2d2d2d',
  gray900: '#1a1a1a',
};

// SA Leadership: four-pillar framework used across the playbook
const SA_LEADERSHIP_FRAMEWORK = [
  { label: 'Identify', short: 'What to spot' },
  { label: 'Action', short: 'What to do' },
  { label: 'Scale', short: 'How to scale' },
  { label: 'Share', short: 'Share' }
];

// Default "From experience to SA Leadership" — sub-bullets under Stronger West SA Strat Team
const DEFAULT_SA_LEADERSHIP_LENS = `• IC Rigor: Take what I've learned as an IC on the Strat West team and leader in the Partnerships org and create ways to train muscles for good engagements and process to enforce.
• Cross-team alignment: Having built close working relationships with teams across sales, product and post-sales, leverage those relationships to make sure changes and processes going into place align.
• CSC, standards, and ownership: Building out CSC, the security ROE, Partner standards for SAs and owning the Adobe/Salesforce partner relationship. Allow SAs to find their "extracurricular" on the team so they can also do what is meaningful for them.`;

// Local Storage Helper Functions
const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

const loadFromStorage = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item);
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return defaultValue;
  }
};

// Debounce delay for localStorage writes (reduces writes during rapid edits)
const STORAGE_DEBOUNCE_MS = 400;

// useLocalStorage Hook
const useLocalStorage = (key, initialValue) => {
  const saveTimeoutRef = useRef(null);

  const [storedValue, setStoredValue] = useState(() => {
    const stored = loadFromStorage(key, initialValue);

    // For overviewContent: push condensed overview to all users (override localStorage)
    if (key === 'leadershipPlaybook_overviewContent' && stored && initialValue) {
      const storedVersion = stored._version || 0;
      const currentVersion = 13; // 13 = SA leadership sub-bullets spacing (single newlines, tighter)

      if (storedVersion < currentVersion) {
        const updated = { ...initialValue, _version: currentVersion };
        saveToStorage(key, updated);
        return updated;
      }
    }

    // Migrate sections: First 100 Days -> first30, or update first30 title to 30-60-90
    if (key === 'leadershipPlaybook_sections' && Array.isArray(stored)) {
      if (stored.some((s) => s.id === 'first100')) {
        const migrated = stored.map((s) =>
          s.id === 'first100'
            ? { ...s, id: 'first30', label: '30-60-90', title: '30-60-90', subtitle: 'First 30 days: actions & plans; Days 31-60: scale & refine; Days 61-90: broaden & embed' }
            : s
        );
        saveToStorage(key, migrated);
        return migrated;
      }
      if (stored.some((s) => s.id === 'first30' && (s.title === 'First 30 Days' || s.label === 'First 30 Days'))) {
        const migrated = stored.map((s) =>
          s.id === 'first30' ? { ...s, label: '30-60-90', title: '30-60-90', subtitle: 'First 30 days: actions & plans; Days 31-60: scale & refine; Days 61-90: broaden & embed' } : s
        );
        saveToStorage(key, migrated);
        return migrated;
      }
    }

    // One-time migration: Feedback I've Received (Leadership Principles) to new five bullets
    if (key === 'leadershipPlaybook_feedback' && Array.isArray(stored) && stored.length === 4 && stored.some((s) => s && typeof s === 'string' && s.includes('Maureen'))) {
      const migrated = [
        'Strong collaboration skills and technical depth',
        'Able to turn complex to composed and simplified',
        'Doesn\'t shy away from feedback for himself or others he\'s coaching',
        'Direct with action, gives feedback with steps to improve',
        'Plays and coaches'
      ];
      saveToStorage(key, migrated);
      return migrated;
    }

    return stored;
  });

  const setValue = useCallback((value) => {
    try {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          saveToStorage(key, valueToStore);
          saveTimeoutRef.current = null;
        }, STORAGE_DEBOUNCE_MS);
        return valueToStore;
      });
    } catch (error) {
      console.error('Error setting localStorage value:', error);
    }
  }, [key]);

  return [storedValue, setValue];
};

// Editable Text Component
const EditableText = ({ value, onChange, style = {}, multiline = false, placeholder = 'Click to edit...' }) => {
  const { isEditMode } = useContext(EditModeContext);
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (onChange && text !== value) {
      onChange(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setText(value);
      setIsEditing(false);
    }
  };

  if (!isEditMode) {
    return <span style={style}>{value}</span>;
  }

  if (isEditing) {
    const inputStyle = {
      ...style,
      border: 'none',
      outline: 'none',
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      borderRadius: '4px',
      padding: '2px 6px',
      margin: '-2px -6px',
      width: 'calc(100% + 12px)',
      fontFamily: 'inherit',
      resize: multiline ? 'vertical' : 'none',
      color: style.color || colors.text,
    };

    if (multiline) {
      return (
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{ ...inputStyle, minHeight: '60px' }}
          placeholder={placeholder}
        />
      );
    }

    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={inputStyle}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      style={{
        ...style,
        cursor: 'pointer',
        borderBottom: '2px dashed rgba(99, 102, 241, 0.4)',
        transition: 'all 0.2s',
      }}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
};

// Editable List Item Component
const EditableListItem = ({ value, onChange, onDelete, color, style = {} }) => {
  const { isEditMode } = useContext(EditModeContext);
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', ...style }}>
      <div style={{ 
        width: '6px', 
        height: '6px', 
        borderRadius: '50%', 
        backgroundColor: color,
        marginTop: '6px',
        flexShrink: 0
      }} />
      <EditableText 
        value={value} 
        onChange={onChange}
        style={{ fontSize: '14px', color: colors.textSecondary, flex: 1 }}
      />
      {isEditMode && onDelete && (
        <button
          onClick={onDelete}
          style={{
            background: 'none',
            border: 'none',
            color: colors.danger,
            cursor: 'pointer',
            padding: '0 4px',
            fontSize: '16px',
            opacity: 0.6,
          }}
          title="Delete item"
        >
          ×
        </button>
      )}
    </div>
  );
};

// Add Item Button Component
const AddItemButton = ({ onClick, label = 'Add item' }) => {
  const { isEditMode } = useContext(EditModeContext);
  
  if (!isEditMode) return null;
  
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '8px 12px',
        backgroundColor: 'transparent',
        border: `1px dashed ${colors.accent}`,
        borderRadius: '6px',
        color: colors.accent,
        fontSize: '13px',
        cursor: 'pointer',
        marginTop: '8px',
        transition: 'all 0.2s',
      }}
    >
      <span>+</span> {label}
    </button>
  );
};

// Animated number counter
const AnimatedCounter = ({ value, suffix = '', duration = 1500 }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const observed = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !observed.current) {
        observed.current = true;
        let start = 0;
        const increment = value / (duration / 16);
        const timer = setInterval(() => {
          start += increment;
          if (start >= value) {
            setCount(value);
            clearInterval(timer);
          } else {
            setCount(Math.floor(start));
          }
        }, 16);
      }
    }, { threshold: 0.5 });
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
};

// Section summary content: tangible first-line-manager steps + support (one-slide exec summary; "Double Click" opens full analysis)
const SECTION_SUMMARIES = {
  leadership: {
    headline: 'What I would do to make the team a well-oiled machine',
    summary: 'Coaching for outcomes, ruthless prioritization (technical leverage over qualification rigor), culture under volatility, hiring for ambiguity—using Identification → Action → Scale → Protect SA time so everyone gets the support they need.',
    bullets: [
      'Identification: Spot where SAs are activity-heavy but outcome-unclear; where technical validation could be stronger before commercial momentum; where tension or ambiguity is draining time.',
      'What action to take: Outcome check-ins (blockers, not status); quarterly "stop doing" list; monthly "state of the team" sessions—no spin; name tension when I sense it.',
      'How to scale: Post-deal retros to build "How the best SAs work" playbook; technical stage gates (Stage 0–5 artifacts, stakeholder mapping, validation criteria); pair developing SAs with thriving ones via deal co-ownership.',
      'How to protect SA time: Coach toward 70%+ time on top 3 accounts; deprioritize what doesn\'t pass the technical-leverage bar; 90-day trust checkpoint for new SAs; preserve 40-hour max.'
    ]
  },
  hiring: {
    headline: 'Hiring & Team Design',
    summary: 'The SA I hire: Technical depth in AI/ML and process design, GTM credibility from running POCs and translating tech to business value, and the consultative low-ego presence that wins executive trust. How I develop them: Two tracks (technical mastery vs executive presence), structured onboarding beyond "shadow and figure it out," and systematic coaching tied to real deals. How I scale without losing culture: Document what great looks like, share content and learnings continuously, and protect the collaborative pace that makes top SAs want to stay.',
    bullets: [
      'Profile: Technical Depth, GTM Experience, Business Acumen and Persona for Success—balance across all three.',
      'Internal vs External: Internal progression and coaching tracks; external backfill and net-new tied to planning.',
      'Maintaining Culture: Current team, scaling culture, onboarding, and team values—replication and sustainable pace.'
    ]
  },
  gtm: {
    headline: 'What I would do to drive impact pre- and post-sale',
    summary: 'Technical validation before commercial momentum; structured POCs and stage gates; adoption and handoffs that stick. Framework: Identification → Action → Scale → Protect SA time.',
    bullets: [
      'Identification: Spot where POCs are generic or technical validation could be stronger before stage gates; where handoffs could be clearer ("information exists but isn\'t accessible"); where SAs are doing hidden lift (absorbing technical complexity).',
      'What action to take: Pre-sale—structured POCs, technical artifacts and validation criteria at Stage 0–5; Objection Handling Playbook with real deal language. Post-sale—enablement on Rules >50%, MCPS >40%, Composer >30%; standardized handoffs.',
      'How to scale: Partner SA rules (RACI, Scorecard, Tier 1 = 2 joint intros/month, monthly PBRs); competitive matrix and "Why Writer Wins" narratives; Agent Builder sunset → Applications focus.',
      'How to protect SA time: Clear stage gates so SAs don\'t chase unvalidated deals; capacity dashboard and deal assignment rules; partner guardrails so SAs aren\'t pulled into fishing expeditions.'
    ]
  },
  operating: {
    headline: 'What I would do to give the team rhythm and support',
    summary: 'Leading and lagging metrics, fixed cadences, and a coaching model so every SA knows what success looks like and gets targeted support. Framework: Identification → Action → Scale → Protect SA time.',
    bullets: [
      'Identification: Spot capacity overload (yellow 18+ deals / red 21+); where SAs are activity-heavy but outcome-unclear; where technical validation could be stronger before commercial push.',
      'What action to take: Leading metrics—POC conversion, 3+ check-ins per trial, feature adoption, capacity dashboard; lagging—win rate, expansion, 90-day retention. Cadences: weekly team call (deal reviews, blockers), weekly 1:1s, forecast review, QBR quarterly.',
      'How to scale: New SAs—10 post-mortems per quarter, shadow calls with 15-min debrief, CS/sales enablement. Tenured—Executive presence, "Win Story of the Week," master deck, path-to-Lead doc.',
      'How to protect SA time: Capacity dashboard and flex-capacity protocol; deprioritize activities that don\'t pass the technical-leverage bar; protect 1:1 and career conversations as non-negotiable.'
    ]
  },
  first30: {
    headline: 'First 30 days: 10 / 20 / 30',
    summary: 'What I would aim to have in place in the first 30 days: Discovery & baseline (1–10), pilot design & build (11–20), operationalize & rhythm (21–30)—with General SA key activities running in parallel.',
    bullets: [],
    timeline: [
      {
        phase: 'Days 1–10',
        label: 'Discovery & Baseline',
        color: colors.accent,
        items: [
          'Partner SA: Audit partner-sourced deals; interview 3–5 regional SAs on friction; document "telephone game" workflow; pull partner vs. direct velocity',
          'Partner Accountability: Create Partner Engagement Scorecard; define Tier 1/2/3 (e.g. Tier 1: 2 joint intros/month, quarterly pipeline target)',
          'Differentiation: 5 competitive-learning interviews ("just use ChatGPT"); audit collateral; competitive matrix Writer vs. ChatGPT Enterprise vs. Claude vs. Gemini',
          'Capacity: SA Capacity Dashboard—deal count, weighted pipeline; yellow 18+ deals or 120% pipeline, red 21+ or 140%',
          'Retention: Confidential 1:1s with each West Coast SA—stay 2 years? Energizes vs. drains? Retention focus; career aspirations',
          'General SA: Shadow top SAs; win/loss + deal-velocity data; document 3–5 repeatable patterns; draft "how the best SAs work"'
        ]
      },
      {
        phase: 'Days 11–20',
        label: 'Pilot Design & Build',
        color: colors.purple,
        items: [
          'Partner SA: West Coast 60-day pilot; Partner Specialist overlay in pod; shared Slack/deal rooms; RACI—Partner Specialist owns partner relationship, Regional SA owns solution + customer',
          'Partner Accountability: Partner Pitch Kits for top 5 use cases (2-min pitch, proof points, discovery questions, demo script); "Why Writer vs. DIY" one-pager',
          'Differentiation: Objection Handling Playbook ("just use ChatGPT," "we\'ll build ourselves," "Gemini free"); 3 vertical "Why Writer Wins"; TCO/time-to-value',
          'Capacity: Audit SA-to-AE mappings; rebalancing by geo/vertical/velocity; Deal Assignment Rules + escalation when capacity constrained',
          'Retention: Lighthouse Deal—2–3 strategic accounts/quarter, exec touchpoints; SA Innovation Sprint (2-day net-new, present to leadership); Executive Shadow',
          'General SA: Key activities → templates/playbooks (discovery, demo, exit gates, handoffs); replication cadence; pilot with 1–2 SAs'
        ]
      },
      {
        phase: 'Days 21–30',
        label: 'Operationalize & Rhythm',
        color: colors.warning,
        items: [
          'Partner SA: Launch pilot with success metrics (deal velocity, satisfaction, utilization); weekly retro; business case for broader rollout',
          'Partner Accountability: Monthly Partner Business Reviews + scorecard; Joint Account Planning for Tier 1 (named accounts, owner, next action, commit); escalation path—2 months below minimums → exec-to-exec',
          'Differentiation: 90-min SA enablement on Objection Playbook; "Win Story of the Week" in Slack; Seismic/Highspot competitive collection; quarterly intel refresh',
          'Capacity: Weekly 15-min capacity check-in in standup (dashboard, flag imbalances); flex-capacity protocol when SA hits red (redistribution, AE communication); strategic-deal criteria',
          'Retention: Monthly Impact Spotlight (SA presents to team + leadership); path-to-Lead doc (deals, enablement, lighthouse); quarterly career conversations (separate from performance)',
          'General SA: Playbook in use; replication cadence + feedback loop; "key activities of value" as standing team topic'
        ]
      }
    ]
  },
  field: {
    headline: 'What I would do with field feedback',
    summary: 'Turn SA/AE alignment opportunities, sales process focus areas, and Writer Agent positioning into concrete actions—pod structures, handoffs, and messaging. Framework: Identification → Action → Scale → Protect SA time.',
    bullets: [
      'Identification: Spot SA/AE alignment opportunities (round-robin vs. consistent pairings); where "information exists but isn\'t accessible"; where SAs do hidden lift (technical complexity) that could be systematized.',
      'What action to take: Move to consistent SA/AE pairings and pod structures; standardized handoffs and exit gates; POC templates and clear criteria; Writer Agent as complement, not replacement.',
      'How to scale: Pre-to-post handoff protocol; differentiation story in every enablement; make feedback actionable—"reactive siloed work" → proactive partnership.',
      'How to protect SA time: Define when to engage SAs so they\'re not over-pulled; improve demo loading/performance so SAs can focus on high-value work.'
    ]
  },
  anecdotes: {
    headline: 'What I would do with recognition and feedback',
    summary: 'Surface and celebrate what colleagues say—reinforce what good looks like and ensure the team feels seen and supported.',
    bullets: [
      'Identification: Spot high performers and hidden lift (SAs absorbing technical complexity); behaviors we want to scale—collaboration, technical depth, executive presence.',
      'What action to take: Share peer and stakeholder feedback in team settings (Win Story of the Week, Impact Spotlight); tie anecdotes to explicit culture.',
      'How to scale: Use recognition in 1:1s and career conversations so growth is grounded in real examples.',
      'How to protect SA time: Ensure the team feels seen and supported so morale and retention protect capacity.'
    ]
  }
};

// Summary card: one-slide exec style (eye-catching); "Double Click" opens full analysis
const SectionSummaryCard = ({ sectionNumber, title, subtitle, headline, summary, bullets, timeline, onShowDetail, sectionColor = colors.accent }) => (
  <div
    onDoubleClick={onShowDetail}
    style={{
      maxWidth: timeline ? '100%' : '800px',
      margin: '0 auto',
      padding: 0,
      backgroundColor: colors.bg,
      borderRadius: '20px',
      border: `2px solid ${colors.border}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
      cursor: 'pointer',
      overflow: 'hidden'
    }}
  >
    {/* Accent strip + section label */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '24px 32px',
      background: `linear-gradient(135deg, ${sectionColor}18 0%, ${sectionColor}08 100%)`,
      borderBottom: `3px solid ${sectionColor}`
    }}>
      <span style={{
        fontSize: '14px',
        fontWeight: '700',
        color: sectionColor,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: "'Inter', sans-serif"
      }}>
        {sectionNumber}
      </span>
      <h2 style={{
        fontSize: '32px',
        fontWeight: '800',
        color: colors.text,
        margin: 0,
        letterSpacing: '-0.03em',
        lineHeight: 1.15,
        fontFamily: "'Inter', sans-serif"
      }}>
        {title}
      </h2>
    </div>

    <div style={{ padding: '28px 32px 32px' }}>
      {headline && (
        <p style={{
          fontSize: '15px',
          fontWeight: '700',
          color: sectionColor,
          margin: '0 0 12px',
          letterSpacing: '-0.01em',
          lineHeight: 1.4
        }}>
          {headline}
        </p>
      )}
      <p style={{
        fontSize: '16px',
        color: colors.text,
        lineHeight: 1.6,
        marginBottom: timeline ? '24px' : '20px',
        fontWeight: '500'
      }}>
        {summary}
      </p>

      {timeline && timeline.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '28px'
        }}>
          {timeline.map((t, idx) => (
            <div
              key={idx}
              style={{
                borderRadius: '12px',
                border: `2px solid ${t.color}30`,
                backgroundColor: t.color + '08',
                overflow: 'hidden',
                minWidth: 0
              }}
            >
              <div style={{
                padding: '12px 14px',
                backgroundColor: t.color + '18',
                borderBottom: `2px solid ${t.color}`,
                fontSize: '12px',
                fontWeight: '700',
                color: t.color,
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}>
                {t.phase}
              </div>
              <div style={{
                padding: '10px 14px 12px',
                fontSize: '13px',
                fontWeight: '600',
                color: colors.text,
                lineHeight: 1.3
              }}>
                {t.label}
              </div>
              <ul style={{
                margin: 0,
                padding: '0 14px 14px 28px',
                fontSize: '12px',
                color: colors.textSecondary,
                lineHeight: 1.55,
                fontWeight: '500'
              }}>
                {t.items.map((item, i) => (
                  <li key={i} style={{ marginBottom: '8px' }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul style={{
          margin: '0 0 28px',
          paddingLeft: '22px',
          fontSize: '15px',
          color: colors.textSecondary,
          lineHeight: 1.7,
          fontWeight: '500'
        }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: '10px' }}>{b}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onShowDetail(); }}
        onDoubleClick={(e) => { e.stopPropagation(); onShowDetail(); }}
        style={{
          padding: '14px 28px',
          borderRadius: '10px',
          border: 'none',
          backgroundColor: sectionColor,
          color: '#fff',
          fontSize: '15px',
          fontWeight: '700',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: `0 4px 12px ${sectionColor}40`
        }}
      >
        Double Click
      </button>
    </div>
  </div>
);

// Card Component - Writer.com style
const Card = ({ children, style = {} }) => (
  <div style={{ 
    backgroundColor: '#ffffff', 
    borderRadius: '12px', 
    padding: '20px',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    transition: 'all 0.2s ease',
    ...style 
  }}>
    {children}
  </div>
);

// Four principles: D3 pie in center; cards in corners (blue top-left, purple top-right, green bottom-right, yellow bottom-left). No rotation so text stays readable.
const PrinciplesRadialView = ({ principles, updatePrinciple, isEditMode, setModalPrincipleIndex }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const cx = dims.width / 2;
  const cy = dims.height / 2;
  const innerR = 40;
  const cardW = 280;
  const cardH = 140;
  const gap = -8;
  const outerR = Math.min(dims.width, dims.height) * 0.2;
  const cardRadius = outerR + gap;

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setDims({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    const t = setTimeout(update, 100);
    return () => { clearTimeout(t); if (ro) ro.disconnect(); };
  }, []);

  // D3 arc: 0 = 12 o'clock (top), positive diff = clockwise. Each segment needs start < end so it draws the 90° wedge (not the 270° arc).
  const segmentAngles = [
    { start: 3 * Math.PI / 2, end: 2 * Math.PI },
    { start: 0, end: Math.PI / 2 },
    { start: Math.PI / 2, end: Math.PI },
    { start: Math.PI, end: 3 * Math.PI / 2 }
  ];
  useEffect(() => {
    if (!svgRef.current || dims.width < 10 || principles.length !== 4) return;
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
    principles.forEach((p, i) => {
      const { start, end } = segmentAngles[i];
      const arcGen = arc()
        .innerRadius(innerR)
        .outerRadius(outerR)
        .startAngle(start)
        .endAngle(end);
      g.append('path')
        .attr('d', arcGen())
        .attr('fill', (p.color || colors.accent) + '18')
        .attr('stroke', (p.color || colors.accent) + '50')
        .attr('stroke-width', 2)
        .style('transition', 'fill 0.25s ease');
    });
  }, [dims, cx, cy, innerR, outerR, principles]);

  // Card positions: just outside the pie (cardRadius = outerR + gap). [0] blue top-left, [1] purple top-right, [2] green bottom-right, [3] yellow bottom-left.
  const positions = principles.length === 4 && dims.width >= 10
    ? [
        { x: cx - cardRadius - cardW, y: cy - cardRadius - cardH },
        { x: cx + cardRadius, y: cy - cardRadius - cardH },
        { x: cx + cardRadius, y: cy + cardRadius },
        { x: cx - cardRadius - cardW, y: cy + cardRadius }
      ]
    : [];

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '680px', marginBottom: '24px', minHeight: '560px' }}>
      <svg ref={svgRef} width={dims.width} height={dims.height} style={{ display: 'block', position: 'absolute', left: 0, top: 0 }} />
      {principles.map((principle, i) => (
        <div
          key={i}
          role="button"
          tabIndex={0}
          onClick={() => !isEditMode && setModalPrincipleIndex(i)}
          onKeyDown={(e) => !isEditMode && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setModalPrincipleIndex(i))}
          onMouseEnter={(e) => { if (!isEditMode) { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = `0 12px 28px ${(principle.color || colors.accent)}30`; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          style={{
            position: 'absolute',
            left: positions[i]?.x ?? 0,
            top: positions[i]?.y ?? 0,
            width: cardW,
            minHeight: cardH,
            cursor: isEditMode ? 'default' : 'pointer',
            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            outline: 'none'
          }}
        >
          <Card style={{ borderLeft: `4px solid ${principle.color}`, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', boxShadow: `0 4px 16px ${(principle.color || colors.accent)}20` }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>
              <EditableText value={principle.title} onChange={(v) => updatePrinciple(i, 'title', v)} style={{ fontSize: '15px', fontWeight: '600', color: colors.text }} />
            </h3>
            <p style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px', flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              <EditableText value={principle.description} onChange={(v) => updatePrinciple(i, 'description', v)} style={{ fontSize: '12px', color: colors.textSecondary }} multiline />
            </p>
            <div style={{ padding: '6px 10px', backgroundColor: principle.color + '12', borderRadius: '6px' }}>
              <p style={{ fontSize: '10px', fontWeight: '600', color: principle.color, marginBottom: '2px' }}>Example</p>
              <p style={{ fontSize: '10px', color: colors.textSecondary, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                <EditableText value={principle.example} onChange={(v) => updatePrinciple(i, 'example', v)} style={{ fontSize: '10px', color: colors.textSecondary }} />
              </p>
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
};

// Stat Card (static)
const StatCard = ({ value, label, suffix = '', color = colors.accent }) => (
  <div style={{ 
    textAlign: 'center', 
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    transition: 'all 0.2s ease'
  }}>
    <div style={{ fontSize: '36px', fontWeight: '700', color, marginBottom: '6px', letterSpacing: '-0.02em' }}>
      <AnimatedCounter value={value} suffix={suffix} />
    </div>
    <div style={{ fontSize: '13px', color: colors.textMuted, fontWeight: '500' }}>{label}</div>
  </div>
);

// Section Header - Writer.com style
const SectionHeader = ({ number, title, subtitle }) => (
  <div style={{ marginBottom: '32px' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '12px' }}>
      <span style={{ 
        fontSize: '13px', 
        fontWeight: '600', 
        color: colors.accent, 
        fontFamily: "'Inter', monospace",
        letterSpacing: '0.05em',
        textTransform: 'uppercase'
      }}>{number}</span>
      <h2 style={{ 
        fontSize: '36px', 
        fontWeight: '700', 
        color: colors.text, 
        margin: 0, 
        letterSpacing: '-0.02em',
        lineHeight: '1.2'
      }}>{title}</h2>
    </div>
    {subtitle && <p style={{ 
      fontSize: '18px', 
      color: colors.textSecondary, 
      margin: 0, 
      marginLeft: '48px',
      lineHeight: '1.6',
      fontWeight: '400'
    }}>{subtitle}</p>}
  </div>
);

// Modal content for each Leadership Principle (full detail shown on card click)
const PRINCIPLE_MODAL_CONTENT = [
  {
    title: 'Coaching for Outcomes',
    framework: 'The 3D Coaching Model',
    frameworkSub: 'Define → Develop → Delegate',
    frameworkDesc: 'This framework mirrors how top SAs already operate with customers—clarifying success criteria, building capability, then stepping back. It scales your personal approach by teaching the method, not just the motion.',
    guidelines: [
      'Identification: Spot where SAs are activity-heavy but outcome-unclear; identify blockers and where technical validation could be stronger before commercial push.',
      'What action to take: Co-create an outcome contract with each SA—"What does success look like? How will we measure it?" Replace status updates with 15-minute "outcome check-ins" focused on blockers.',
      'How to scale: Run post-deal retrospectives ("what worked, what would you replicate?") to build your "How the best SAs work" playbook; shadow SAs on complex deals, then have them shadow you.',
      'How to protect SA time: Step back from the how; coach only when asked so SAs own their calendar and don\'t default to status-theater.'
    ],
    examplesInPractice: [
      'Coaching the local West SA team and mentoring on best practices to get ramped up as quickly as possible.',
      'Weekly cadence so they feel like they\'re progressing and building bespoke growth plans so they have a target to always reach—focus on small chunks of goals vs. one large goal that takes time.'
    ]
  },
  {
    title: 'Ruthless Prioritization',
    framework: 'Technical leverage over qualification rigor',
    frameworkSub: 'Technical validation before commercial momentum',
    frameworkDesc: 'For SA leadership the core tension shifts from "qualification rigor" to "technical leverage." Your version of left-shifted scrutiny is ensuring technical validation happens before commercial momentum builds false confidence. ICE (Impact × Confidence × Effort) still gives the team a shared language for tradeoffs; layer in stage gates: define what technical artifacts, stakeholder mapping, and validation criteria must exist before each deal stage (Stage 0–5). Helping hidden lift is a big win: SAs absorbing cross-functional technical complexity so engineers can focus on solution design rather than navigating product gaps or integration unknowns.',
    guidelines: [
      'Identification: Spot where commercial momentum is building without technical validation; identify SAs doing hidden lift (absorbing technical complexity so eng can focus on solution design).',
      'What action to take: Maintain a quarterly "stop doing" list; implement technical stage gates (artifacts, stakeholder mapping, validation criteria) before advancing deals; conduct monthly calendar audits—coach toward 70%+ time on top 3 accounts.',
      'How to scale: Define Stage 0–5 "must haves" for SA—technical artifacts, stakeholder mapping, validation criteria at each gate; have each SA identify their single highest-leverage activity weekly and track patterns.',
      'How to protect SA time: Deprioritize activities that don\'t pass the technical-leverage bar; use capacity dashboard and flex-capacity protocol so SAs aren\'t overloaded by deals that haven\'t cleared validation.'
    ],
    examplesInPractice: [
      'Working across partnerships, normal GTM opportunities, owning tech partnership integrations and builds, coaching/mentoring, and ad hoc engagements such as webinars, conferences, speaking at events and trainings. Ruthless prioritization is a common practice.'
    ]
  },
  {
    title: 'Culture Building Under Volatility',
    framework: 'SCARF Model (David Rock)',
    frameworkSub: 'Status, Certainty, Autonomy, Relatedness, Fairness',
    frameworkDesc: 'SCARF identifies the five domains where people feel most affected during change. By proactively addressing each—especially certainty and status during reorgs—you reduce the cognitive load that impacts performance when things get ambiguous.',
    guidelines: [
      'Identification: Spot where certainty and status are affected (reorgs, strategy shifts); name tension when you sense it—"This feels off. Let\'s talk about why."',
      'What action to take: Share transparent "what I know / what I don\'t know" updates during uncertainty; hold monthly "state of the team" sessions: wins, challenges, what leadership is hearing—no spin.',
      'How to scale: Pair developing SAs with thriving ones through deal co-ownership, not formal mentorship; build psychological safety so hidden lift and technical complexity get surfaced.',
      'How to protect SA time: Reduce cognitive load so SAs aren\'t drained by ambiguity; protect 1:1 and career conversations as non-negotiable.'
    ],
    examplesInPractice: [
      'Building trust and respect among peers and having them vouch for me being their manager to continue building that trust and push for what\'s best for the West SA team in terms of objective and subjective growth.'
    ]
  },
  {
    title: 'Hiring for Ambiguity',
    framework: 'Structured Behavioral Interviewing for Adaptability',
    frameworkSub: 'Past behavior → Situational judgment → Values alignment',
    frameworkDesc: 'Traditional interviews reward polish and preparation. This structure specifically surfaces how candidates behave when the path isn\'t clear—which is the actual job. Past ambiguity navigation predicts future ambiguity navigation better than hypotheticals.',
    guidelines: [
      'Identification: Spot candidates who thrive in technical ambiguity (product gaps, integration unknowns) and who can absorb cross-functional complexity so eng can focus on solution design.',
      'What action to take: Use a "messy case study" interview with an intentionally incomplete brief—evaluate navigation, not correctness; ask references about trajectory: "How much did they grow in months 1-6 vs. 6-12?"',
      'How to scale: Assign new SAs a real deal in week 2, not week 8—observe how they respond to ambiguity early; document "How the best SAs work" so onboarding replicates high-leverage behavior.',
      'How to protect SA time: Conduct a 90-day "trust checkpoint" to calibrate where you\'ve been too hands-on vs. where they need more support; preserve 40-hour max—additional headcount for overages, not burnout.'
    ],
    examplesInPractice: [
      'Have been on the hiring panel for almost 80% of the current SAs; the team has kept our bar of talent top tier.'
    ]
  }
];

// Partner SA rules default (used by Leadership Principles — Partnerships tab)
const defaultPartnerSARules = {
  coreMission: 'Enable partners to pitch Writer and co-sell effectively while driving revenue through "Manage and Operate" motions with GSIs.',
  fourPillars: 'The Partner SA function operates across four key areas: generating validated sales opportunities tied to ROI, building scalable enablement frameworks ("train the trainer" approach), supporting product changes with talk tracks, and providing internal team training.',
  ecosystemStructure: 'Writer\'s ecosystem spans six partner categories: Infrastructure/Technology partnerships (hyperscalers, security, developer platforms), Product Partners (connectors), Service Providers split between G/SIs for advisory versus manage-and-operate work, Data Licensing partnerships, Strategic embed/OEM relationships, and niche SI/AI native partners including MSPs, BPOs, and agencies.',
  tier1: [
    'Active partnerships with revenue commitment, executive sponsorship, and Writer involvement in POC criteria',
    'Advanced training, sandbox access, POC development support, priority Slack support, joint planning, and call support'
  ],
  tier2: [
    'Official agreements with certifications and specific client opportunities identified',
    'Standard training, sandbox access, limited weekly technical consultation, documentation, office hours, and call support'
  ],
  tier3: [
    'Early-stage discussions with use cases identified',
    'Intro workshops, public docs, monthly webinars, and basic demo access'
  ],
  incubationDeliverables: [
    'Market/product/competition enablement',
    'Joint solution builds for reusable assets',
    'Joint GTM solution maps',
    'Quarterly product reviews'
  ],
  cosellDeliverables: [
    'Technical scoping',
    'Technical support for executive meetings',
    'Use case workshops',
    'Joint demo/solution builds',
    'Escalation paths to product and engineering'
  ],
  hyperscalerDeliverables: [
    'Platform enablement',
    'Technical discussions on model integration and compliance',
    'Use case workshops',
    'Quarterly updates'
  ],
  techPartnershipDeliverables: [
    'Demo and enablement',
    'Customer/use case mapping',
    'Integration discovery (MCP, API, OEM, Embed)',
    'Quarterly reviews'
  ],
  partnerSAOwns: [
    'Enablement',
    'Sandbox access, office hours during active opportunities',
    'Solution process mapping',
    'Reusable demo assets',
    'Thought leadership on AI scaling'
  ],
  partnerManagersOwn: [
    'Onboarding',
    'Engagement management',
    'ROI/business case development',
    'Relationship management',
    'Expectation setting',
    'Cross-functional alignment'
  ],
  currentConstraints: [
    'Only two Partner SAs supporting all engagements',
    'Longer sales cycles compared to direct sales',
    'Different engagement patterns across partner types (Data Partners, Hyperscalers, etc.)'
  ],
  guardRails: [
    'Fishing expeditions without specific opportunities',
    'Training without business justification',
    'Support for non-partners',
    'Generic capability presentations',
    'Context-free competitive intelligence requests',
    'Support for non-engaged clients on AI Studio/Agent Builder'
  ]
};

// Ecosystem diagram: Global Partnerships Writer Ecosystem (hierarchical org / process map)
const defaultEcosystemDiagram = {
  rootLabel: 'Global Partnerships Writer Ecosystem',
  branches: [
    {
      label: 'Service Providers',
      children: [
        { label: 'G/SIs (Manage & Operate)', children: [{ label: 'Niche SI/ AI Natives (Manage & Operate)' }, { label: 'MSP / Outsourcers (BPO; Agencies)' }] },
        { label: 'G/SIs (Advisories)' }
      ]
    },
    {
      label: 'Technology Partnerships',
      children: [
        { label: 'Product Partners (Connectors)' },
        { label: 'Data Licensing & Partnerships' },
        { label: 'Strategics (Embed/OEM)' },
        { label: 'Security' }
      ]
    },
    {
      label: 'Infrastructure',
      children: [
        { label: 'Hyperscalers' },
        { label: 'Developer Platforms' },
        { label: 'Hardware (Future)' }
      ]
    }
  ],
  partnerSupport: ['Partner Enablement', 'Partner Program + Incentives', 'Partner Tools (Portal, LMS, SFDC)', 'Partner Marketing', 'Partner Sales']
};

function setInObject(obj, path, value) {
  if (path.length === 1) {
    const key = path[0];
    if (Array.isArray(obj)) {
      const next = [...obj];
      next[key] = value;
      return next;
    }
    return { ...obj, [key]: value };
  }
  const key = path[0];
  const nextObj = obj[key] ?? (typeof path[1] === 'number' ? [] : {});
  return Array.isArray(obj)
    ? obj.map((item, i) => (i === key ? setInObject(item, path.slice(1), value) : item))
    : { ...obj, [key]: setInObject(nextObj, path.slice(1), value) };
}

// Leadership Principles Section
const LeadershipPrinciplesSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [modalPrincipleIndex, setModalPrincipleIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('principles');

  const [partnerSARules, setPartnerSARules] = useLocalStorage('leadershipPlaybook_partnerSARules', defaultPartnerSARules);
  const updatePartnerSARules = (key, value) => setPartnerSARules(prev => ({ ...prev, [key]: value }));
  const updatePartnerSARulesList = (key, index, value) =>
    setPartnerSARules(prev => ({
      ...prev,
      [key]: prev[key].map((item, i) => (i === index ? value : item))
    }));
  const addPartnerSARulesListItem = (key) =>
    setPartnerSARules(prev => ({ ...prev, [key]: [...(prev[key] || []), 'New item - click to edit'] }));
  const deletePartnerSARulesListItem = (key, index) =>
    setPartnerSARules(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));

  const [ecosystemDiagram, setEcosystemDiagram] = useLocalStorage('leadershipPlaybook_ecosystemDiagram', defaultEcosystemDiagram);
  const updateEcosystemDiagram = (path, value) => {
    setEcosystemDiagram(prev => setInObject(prev, path, value));
  };

  const [philosophy, setPhilosophy] = useLocalStorage(
    'leadershipPlaybook_philosophy',
    'Scale individual contributor success into systematic processes. Document "How the best SA\'s work" for team replication. Build trust through coaching for outcomes, not micromanaging.'
  );

  const [principles, setPrinciples] = useLocalStorage('leadershipPlaybook_principles', [
    {
      title: 'Coaching for Outcomes',
      description: 'Focus on results, not process. Give framework and autonomy.',
      example: 'Goldman account: Cross-functional leadership without direct authority',
      color: colors.accent
    },
    {
      title: 'Ruthless Prioritization',
      description: 'Key growth area: Translate personal execution into team coaching.',
      example: 'Successfully handled feedback from Steve—focused on learning to coach rather than defending',
      color: colors.purple
    },
    {
      title: 'Culture Building Under Volatility',
      description: 'Maintain team morale during uncertainty and change.',
      example: 'Demonstrated instinctual management during awkward conversations',
      color: colors.success
    },
    {
      title: 'Hiring for Ambiguity',
      description: 'Seek people who thrive in unclear situations and high trajectory.',
      example: 'IC to leader transition without micromanaging—trust the process',
      color: colors.warning
    }
  ]);

  const [feedback, setFeedback] = useLocalStorage('leadershipPlaybook_feedback', [
    'Strong collaboration skills and technical depth',
    'Able to turn complex to composed and simplified',
    'Doesn\'t shy away from feedback for himself or others he\'s coaching',
    'Direct with action, gives feedback with steps to improve',
    'Plays and coaches'
  ]);

  const updatePrinciple = (index, field, value) => {
    setPrinciples(prev => prev.map((p, i) => 
      i === index ? { ...p, [field]: value } : p
    ));
  };

  const updateFeedback = (index, value) => {
    setFeedback(prev => prev.map((item, i) => i === index ? value : item));
  };

  const addFeedback = () => {
    setFeedback(prev => [...prev, 'New feedback - click to edit']);
  };

  const deleteFeedback = (index) => {
    setFeedback(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div>
      {/* Tabs: Principles | Principles in Action */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('principles')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: `1px solid ${activeTab === 'principles' ? colors.accent : colors.border}`,
            backgroundColor: activeTab === 'principles' ? colors.accent : 'white',
            color: activeTab === 'principles' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: activeTab === 'principles' ? '600' : '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'principles' ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none'
          }}
        >
          Principles
        </button>
        <button
          onClick={() => setActiveTab('partnerships')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: `1px solid ${activeTab === 'partnerships' ? colors.info : colors.border}`,
            backgroundColor: activeTab === 'partnerships' ? colors.info : 'white',
            color: activeTab === 'partnerships' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: activeTab === 'partnerships' ? '600' : '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'partnerships' ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none'
          }}
        >
          Principles in Action
        </button>
      </div>

      {activeTab === 'principles' && (
        <>
      {/* Philosophy */}
      <Card style={{ marginBottom: '24px', backgroundColor: colors.accent + '10', border: `1px solid ${colors.accent}30` }}>
        <p style={{ fontSize: '14px', fontWeight: '600', color: colors.accent, marginBottom: '12px', textTransform: 'uppercase' }}>Leadership Philosophy</p>
        <p style={{ fontSize: '16px', color: colors.text, margin: 0, fontStyle: 'italic', lineHeight: '1.6' }}>
          <EditableText
            value={philosophy}
            onChange={setPhilosophy}
            style={{ fontSize: '16px', color: colors.text, fontStyle: 'italic' }}
            multiline
          />
        </p>
      </Card>

      {/* Principles — D3 radial layout: 4 arc segments, cards in each */}
      <PrinciplesRadialView
        principles={principles}
        updatePrinciple={updatePrinciple}
        isEditMode={isEditMode}
        setModalPrincipleIndex={setModalPrincipleIndex}
      />

      {/* Principle detail modal — centered, blurred backdrop (portal to body so it appears on top) */}
      {modalPrincipleIndex !== null && typeof document !== 'undefined' && (() => {
        const content = PRINCIPLE_MODAL_CONTENT[modalPrincipleIndex];
        const principle = principles[modalPrincipleIndex];
        if (!content || !principle) return null;
        const appFont = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        const modalEl = (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              backgroundColor: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              fontFamily: appFont,
              color: colors.text,
              lineHeight: 1.6,
              fontSize: '14px'
            }}
            onClick={() => setModalPrincipleIndex(null)}
          >
            <div
              style={{
                backgroundColor: colors.bg,
                borderRadius: '12px',
                maxWidth: '560px',
                width: '100%',
                maxHeight: '85vh',
                overflow: 'auto',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 24px 48px rgba(0,0,0,0.15)',
                border: `1px solid ${colors.border}`,
                position: 'relative',
                fontFamily: appFont,
                fontSize: '14px',
                color: colors.text
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <h3 style={{ fontFamily: appFont, fontSize: '18px', fontWeight: '600', color: colors.text, margin: 0, paddingRight: '36px' }}>{content.title}</h3>
                  <button
                    type="button"
                    onClick={() => setModalPrincipleIndex(null)}
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: colors.surface,
                      color: colors.textMuted,
                      fontFamily: appFont,
                      fontSize: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                </div>
                <p style={{ fontFamily: appFont, fontSize: '11px', fontWeight: '600', color: colors.purple, margin: '0 0 12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Apply: Identify → Action → Scale → Share</p>
                <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: principle.color + '12', borderRadius: '10px', borderLeft: `4px solid ${principle.color}` }}>
                  <p style={{ fontFamily: appFont, fontSize: '12px', fontWeight: '600', color: principle.color, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Framework: {content.framework}</p>
                  <p style={{ fontFamily: appFont, fontSize: '14px', fontWeight: '600', color: colors.text, margin: '0 0 8px' }}>{content.frameworkSub}</p>
                  <p style={{ fontFamily: appFont, fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6, margin: 0 }}>{content.frameworkDesc}</p>
                </div>
                {content.examplesInPractice && content.examplesInPractice.length > 0 && (
                  <>
                    <p style={{ fontFamily: appFont, fontSize: '12px', fontWeight: '600', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Examples in practice</p>
                    <ul style={{ margin: '0 0 16px', paddingLeft: '20px', fontFamily: appFont, fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6 }}>
                      {content.examplesInPractice.map((example, j) => (
                        <li key={j} style={{ marginBottom: '8px' }}>{example}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p style={{ fontFamily: appFont, fontSize: '12px', fontWeight: '600', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Principal Guidelines</p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontFamily: appFont, fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6 }}>
                  {content.guidelines.map((guideline, j) => (
                    <li key={j} style={{ marginBottom: '8px' }}>{guideline}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
        return createPortal(modalEl, document.body);
      })()}

      {/* Feedback Received */}
      <Card>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Feedback I've Received</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {feedback.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: colors.info,
                marginTop: '6px',
                flexShrink: 0
              }} />
              <EditableText
                value={item}
                onChange={(v) => updateFeedback(i, v)}
                style={{ fontSize: '14px', color: colors.textSecondary, flex: 1 }}
              />
              {isEditMode && (
                <button
                  onClick={() => deleteFeedback(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.danger,
                    cursor: 'pointer',
                    padding: '0 4px',
                    fontSize: '16px',
                    opacity: 0.6,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <AddItemButton onClick={addFeedback} label="Add feedback" />
      </Card>
        </>
      )}

      {activeTab === 'partnerships' && (
        <PartnershipsContent
          partnerSARules={partnerSARules}
          updatePartnerSARules={updatePartnerSARules}
          updatePartnerSARulesList={updatePartnerSARulesList}
          addPartnerSARulesListItem={addPartnerSARulesListItem}
          deletePartnerSARulesListItem={deletePartnerSARulesListItem}
          ecosystemDiagram={ecosystemDiagram}
          updateEcosystemDiagram={updateEcosystemDiagram}
        />
      )}
    </div>
  );
};

// Oval node for ecosystem diagram (blue oval, grey connecting lines per image)
const connectorGrey = '#9ca3af';
const EcosystemNode = ({ label, onUpdate, compact = false }) => (
  <div
    style={{
      padding: compact ? '6px 10px' : '10px 16px',
      borderRadius: '999px',
      backgroundColor: '#2563eb',
      color: 'white',
      fontSize: compact ? '10px' : '13px',
      fontWeight: '600',
      textAlign: 'center',
      maxWidth: compact ? '140px' : '280px',
      lineHeight: 1.25,
      border: '1px solid rgba(255,255,255,0.25)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
    }}
  >
    {onUpdate ? <EditableText value={label} onChange={onUpdate} style={{ color: 'white', fontSize: 'inherit', fontWeight: 'inherit', wordBreak: 'break-word' }} /> : label}
  </div>
);

// Partnerships tab content (moved from GTM to Leadership Principles)
const PartnershipsContent = ({
  partnerSARules,
  updatePartnerSARules,
  updatePartnerSARulesList,
  addPartnerSARulesListItem,
  deletePartnerSARulesListItem,
  ecosystemDiagram = defaultEcosystemDiagram,
  updateEcosystemDiagram = () => {}
}) => (
  <div>
    {/* V1 - Functional Org: Ecosystem diagram (Global Partnerships Writer Ecosystem) — matches reference image */}
    <Card style={{ marginBottom: '28px', overflow: 'visible', padding: '24px' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}>V1 - Functional Org: Focused on impact</h3>
      <p style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6, marginBottom: '24px', maxWidth: '720px' }}>
        To build an effective team, we must look across the partner types that will help Writer grow both from a product differentiation perspective; deployment & revenue. Our entire ecosystem is dependent on global partner enablement; a clear partner program & partner marketing delivered in scalable ways.
      </p>
      {/* Single dashed border wraps both diagram and Partner Support (per reference image); grid prevents overlap */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px',
          gap: '24px',
          alignItems: 'start',
          padding: '28px 24px 32px',
          borderRadius: '16px',
          border: `2px dashed ${colors.accent}`,
          backgroundColor: colors.bg,
          overflow: 'hidden'
        }}
      >
        {/* Left: Tree (minmax(0,1fr) allows shrink; overflow prevents overlap) */}
        <div style={{ minWidth: 0, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <EcosystemNode
              label={ecosystemDiagram.rootLabel}
              onUpdate={(v) => updateEcosystemDiagram(['rootLabel'], v)}
            />
            <div style={{ width: '2px', height: '24px', backgroundColor: connectorGrey }} />
            <div style={{ width: '100%', maxWidth: '460px', height: '2px', backgroundColor: connectorGrey }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '460px', marginTop: '-2px', paddingLeft: '8px', paddingRight: '8px' }}>
              {(ecosystemDiagram.branches || []).map((_, bi) => (
                <div key={bi} style={{ width: '2px', height: '20px', backgroundColor: connectorGrey }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '500px', gap: '12px', flexWrap: 'wrap', marginTop: '-2px' }}>
              {(ecosystemDiagram.branches || []).map((branch, bi) => (
                <div key={bi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flex: '1 1 120px', minWidth: 100 }}>
                  <EcosystemNode
                    label={branch.label}
                    onUpdate={(v) => updateEcosystemDiagram(['branches', bi, 'label'], v)}
                    compact
                  />
                  {(branch.children || []).length > 0 && (
                    <>
                      <div style={{ width: '2px', height: '14px', backgroundColor: connectorGrey, marginTop: '8px' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        {(branch.children || []).map((child, ci) => (
                          <div key={ci} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                            <div style={{ width: '2px', height: '10px', backgroundColor: connectorGrey }} />
                            <EcosystemNode
                              label={child.label}
                              onUpdate={(v) => updateEcosystemDiagram(['branches', bi, 'children', ci, 'label'], v)}
                              compact
                            />
                            {child.children && child.children.length > 0 && (
                              <>
                                <div style={{ width: '2px', height: '8px', backgroundColor: connectorGrey, marginTop: '6px' }} />
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '-2px' }}>
                                  {child.children.map((grand, gi) => (
                                    <div key={gi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                      <div style={{ width: '2px', height: '8px', backgroundColor: connectorGrey }} />
                                      <EcosystemNode
                                        label={grand.label}
                                        onUpdate={(v) => updateEcosystemDiagram(['branches', bi, 'children', ci, 'children', gi, 'label'], v)}
                                        compact
                                      />
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Right: Partner Support stack — fixed 220px column, no overlap */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(ecosystemDiagram.partnerSupport || []).map((item, i) => {
            const isPink = i >= 3;
            const isPartnerSales = i === 4;
            return (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: `2px ${isPartnerSales ? 'dashed' : 'solid'} ${isPink ? colors.accent : connectorGrey}`,
                  backgroundColor: isPink ? colors.pink + '40' : colors.gray200,
                  fontSize: '13px',
                  fontWeight: '600',
                  color: colors.text
                }}
              >
                <EditableText value={item} onChange={(v) => updateEcosystemDiagram(['partnerSupport', i], v)} style={{ fontSize: '13px', fontWeight: '600' }} />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
    <h3 style={{ fontSize: '20px', fontWeight: '600', color: colors.text, marginBottom: '20px' }}>Partner SA Rules of Engagement</h3>
    <Card style={{ marginBottom: '20px', backgroundColor: colors.info + '10', borderLeft: `4px solid ${colors.info}` }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Mission</h4>
      <EditableText value={partnerSARules.coreMission} onChange={(v) => updatePartnerSARules('coreMission', v)} style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: 1.6 }} multiline />
    </Card>
    <Card style={{ marginBottom: '20px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>Four Strategic Pillars</h4>
      <EditableText value={partnerSARules.fourPillars} onChange={(v) => updatePartnerSARules('fourPillars', v)} style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6 }} multiline />
    </Card>
    <Card style={{ marginBottom: '20px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>Partner Ecosystem Structure</h4>
      <EditableText value={partnerSARules.ecosystemStructure} onChange={(v) => updatePartnerSARules('ecosystemStructure', v)} style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6 }} multiline />
    </Card>
    <h4 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Three-Tier Partner Classification</h4>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
      <Card style={{ borderTop: `4px solid ${colors.accent}` }}>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.accent, marginBottom: '10px' }}>Tier 1 (Strategic)</h5>
        {(partnerSARules.tier1 || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('tier1', i, v)} onDelete={() => deletePartnerSARulesListItem('tier1', i)} color={colors.accent} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('tier1')} label="Add" />
      </Card>
      <Card style={{ borderTop: `4px solid ${colors.success}` }}>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.success, marginBottom: '10px' }}>Tier 2 (Qualified)</h5>
        {(partnerSARules.tier2 || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('tier2', i, v)} onDelete={() => deletePartnerSARulesListItem('tier2', i)} color={colors.success} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('tier2')} label="Add" />
      </Card>
      <Card style={{ borderTop: `4px solid ${colors.warning}` }}>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.warning, marginBottom: '10px' }}>Tier 3 (Evaluation)</h5>
        {(partnerSARules.tier3 || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('tier3', i, v)} onDelete={() => deletePartnerSARulesListItem('tier3', i)} color={colors.warning} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('tier3')} label="Add" />
      </Card>
    </div>
    <h4 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Engagement Options</h4>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
      <Card>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>Incubation</h5>
        {(partnerSARules.incubationDeliverables || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('incubationDeliverables', i, v)} onDelete={() => deletePartnerSARulesListItem('incubationDeliverables', i)} color={colors.info} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('incubationDeliverables')} label="Add" />
      </Card>
      <Card>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>Co-sell</h5>
        {(partnerSARules.cosellDeliverables || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('cosellDeliverables', i, v)} onDelete={() => deletePartnerSARulesListItem('cosellDeliverables', i)} color={colors.info} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('cosellDeliverables')} label="Add" />
      </Card>
      <Card>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>Hyperscaler-specific</h5>
        {(partnerSARules.hyperscalerDeliverables || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('hyperscalerDeliverables', i, v)} onDelete={() => deletePartnerSARulesListItem('hyperscalerDeliverables', i)} color={colors.info} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('hyperscalerDeliverables')} label="Add" />
      </Card>
      <Card>
        <h5 style={{ fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>Tech partnership</h5>
        {(partnerSARules.techPartnershipDeliverables || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('techPartnershipDeliverables', i, v)} onDelete={() => deletePartnerSARulesListItem('techPartnershipDeliverables', i)} color={colors.info} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('techPartnershipDeliverables')} label="Add" />
      </Card>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
      <Card style={{ borderLeft: `4px solid ${colors.success}` }}>
        <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.success, marginBottom: '10px' }}>Partner SA Owns</h5>
        {(partnerSARules.partnerSAOwns || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('partnerSAOwns', i, v)} onDelete={() => deletePartnerSARulesListItem('partnerSAOwns', i)} color={colors.success} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('partnerSAOwns')} label="Add" />
      </Card>
      <Card style={{ borderLeft: `4px solid ${colors.accent}` }}>
        <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.accent, marginBottom: '10px' }}>Partner Managers Own</h5>
        {(partnerSARules.partnerManagersOwn || []).map((item, i) => (
          <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('partnerManagersOwn', i, v)} onDelete={() => deletePartnerSARulesListItem('partnerManagersOwn', i)} color={colors.accent} />
        ))}
        <AddItemButton onClick={() => addPartnerSARulesListItem('partnerManagersOwn')} label="Add" />
      </Card>
    </div>
    <Card style={{ marginBottom: '20px', borderLeft: `4px solid ${colors.warning}` }}>
      <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.warning, marginBottom: '10px' }}>Considerations</h5>
      {(partnerSARules.currentConstraints || []).map((item, i) => (
        <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('currentConstraints', i, v)} onDelete={() => deletePartnerSARulesListItem('currentConstraints', i)} color={colors.warning} />
      ))}
      <AddItemButton onClick={() => addPartnerSARulesListItem('currentConstraints')} label="Add" />
    </Card>
    <Card style={{ borderLeft: `4px solid ${colors.danger}` }}>
      <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '10px' }}>Guard Rails—What SA Won&apos;t Support</h5>
      {(partnerSARules.guardRails || []).map((item, i) => (
        <EditableListItem key={i} value={item} onChange={(v) => updatePartnerSARulesList('guardRails', i, v)} onDelete={() => deletePartnerSARulesListItem('guardRails', i)} color={colors.danger} />
      ))}
      <AddItemButton onClick={() => addPartnerSARulesListItem('guardRails')} label="Add" />
    </Card>
  </div>
);

// Hiring & Team Design Section
const HiringTeamDesignSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [activeTab, setActiveTab] = useState('profile');

  const [saProfile, setSaProfile] = useLocalStorage('leadershipPlaybook_saProfile', {
    technicalDepth: [
      'Knowledge and expertise in AI/ML products and use cases',
      'Process design—ability to map workflows, integrations, and solution architecture',
      'Aptitude for learning technology quickly; less focus on building production software'
    ],
    gtmImpact: [
      'Comfort and credibility in customer-facing technical roles (SE, SA, DevRel)—earns trust with technical and business stakeholders',
      'Drives complex POCs and trials to closure—ownership mindset',
      'Navigates enterprise sales motion—understands how deals move and who to align',
      'Connects technical topics to business objectives—translates for execs and practitioners'
    ],
    growthPotential: [
      'Consultative mindset—diagnoses before prescribing',
      'Low ego, high curiosity—admits mistakes, asks questions',
      'Startup tolerance—thrives in ambiguity',
      'Executive presence and pushback capabilities'
    ]
  });

  const [balance, setBalance] = useLocalStorage(
    'leadershipPlaybook_balance',
    'Technical depth matters where SAs work with developers—they need real credibility with engineering teams and the ability to go deep on architecture, integrations, and implementation. Business acumen matters where SAs work with executives and non-technical stakeholders—they need to translate technical value into business outcomes, ROI, and strategy. The balancing act is hiring and developing people who can hold their own in both worlds: deep enough technically to earn developer trust, and fluent enough in business to influence decisions and close with leadership.'
  );

  const [internalVsExternal, setInternalVsExternal] = useLocalStorage('leadershipPlaybook_internalVsExternal', {
    internal: [
      'Current team: 4 SAs (Burton transitioning to engineering)',
      'Two coaching categories: Technical skills vs Executive presence',
      'Internal progression requires systematic development',
      'Need better onboarding for new SA hires'
    ],
    external: [
      'Backfill and net-new headcount tied to planning and budgeting',
      'Net new headcount impacts forecasting and resourcing',
      'Employee acquisition costs plus tax burden factor into planning',
      'West Coast SA leader role in scope—prioritized with backfill'
    ]
  });

  const [maintainingCulture, setMaintainingCulture] = useLocalStorage('leadershipPlaybook_maintainingCulture', {
    currentTeam: [
      'Document "How the best SA\'s work" for team replication—systematic processes vs ad-hoc execution',
      'Preserve collaborative working style: the best SAs can run deals soup-to-nuts',
      'Maintain individual working styles: some SAs are technical builders, others more business-forward',
      'Values sustainable pace—additional headcount for overages, not burnout'
    ],
    scalingCulture: [
      'Systematic content sharing: demo highlights by industry',
      'Develop skills that differentiate from AEs: product knowledge, buyer personas, competitive landscape',
      'Foster continuous learning: attend CS/sales enablement sessions, follow with team check-ins',
      'Build muscle memory for successful deal closure: document exit gates and tactics, make them accessible'
    ],
    onboarding: [
      'Onboarding that moves new SAs beyond "tech support" into full ownership',
      'Enable business acumen alongside technical skills from the start',
      'Shadow calls with structured debriefs to accelerate learning',
      'Regular post-mortems with real-time feedback on actual deals'
    ],
    teamValues: [
      'Maintain low ego, high curiosity culture—admits mistakes, asks questions',
      'Preserve consultative mindset: diagnoses before prescribing',
      'Keep startup tolerance—thrives in ambiguity and product-market fit volatility',
      'Sustain collaborative account approach vs "You do X, I do Y" mentality'
    ]
  });

  const updateSaProfile = (category, index, value) => {
    setSaProfile(prev => ({
      ...prev,
      [category]: prev[category].map((item, i) => i === index ? value : item)
    }));
  };

  const addSaProfileItem = (category) => {
    setSaProfile(prev => ({
      ...prev,
      [category]: [...prev[category], 'New item - click to edit']
    }));
  };

  const deleteSaProfileItem = (category, index) => {
    setSaProfile(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const updateMaintainingCulture = (category, index, value) => {
    setMaintainingCulture(prev => ({
      ...prev,
      [category]: prev[category].map((item, i) => i === index ? value : item)
    }));
  };

  const addMaintainingCultureItem = (category) => {
    setMaintainingCulture(prev => ({
      ...prev,
      [category]: [...prev[category], 'New item - click to edit']
    }));
  };

  const deleteMaintainingCultureItem = (category, index) => {
    setMaintainingCulture(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const updateInternalVsExternal = (category, index, value) => {
    setInternalVsExternal(prev => ({
      ...prev,
      [category]: prev[category].map((item, i) => i === index ? value : item)
    }));
  };

  const addInternalVsExternalItem = (category) => {
    setInternalVsExternal(prev => ({
      ...prev,
      [category]: [...prev[category], 'New item - click to edit']
    }));
  };

  const deleteInternalVsExternalItem = (category, index) => {
    setInternalVsExternal(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const defaultHireFastSteps = [
    { title: 'Identify the right candidate', description: 'Define who you need (profile, skills, culture). Source from network, referrals, and targeted outreach—prioritize people who already run POCs and translate tech to business.' },
    { title: 'Open the conversation', description: 'First touch: make it about them. Share why the role matters, what the team is building, and leave space for their questions. No spray-and-pray.' },
    { title: 'Learn what they want', description: 'Discovery before pitch. What are they optimizing for? Growth, ownership, team, mission? Listen more than you talk so you can align and test fit.' },
    { title: 'Test for fit', description: 'See them in motion: messy case study, real scenario, or paired exercise with a future teammate. Assess technical depth, GTM instincts, and how they show up under ambiguity.' },
    { title: 'Close and bring them in', description: 'Move fast when it\'s a yes. Clear offer, explicit expectations, and structured onboarding so day one feels intentional—not "shadow and figure it out."' }
  ];
  const [hireFastSteps, setHireFastSteps] = useLocalStorage('leadershipPlaybook_hireFastSteps', defaultHireFastSteps);
  const updateHireFastStep = (index, field, value) => {
    setHireFastSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('profile')}
          style={{
            padding: '10px 20px',
            borderRadius: '100px',
            border: `2px solid ${activeTab === 'profile' ? colors.accent : colors.border}`,
            backgroundColor: activeTab === 'profile' ? colors.accent : 'white',
            color: activeTab === 'profile' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          SA Profile
        </button>
        <button
          onClick={() => setActiveTab('hireFast')}
          style={{
            padding: '10px 20px',
            borderRadius: '100px',
            border: `2px solid ${activeTab === 'hireFast' ? colors.info : colors.border}`,
            backgroundColor: activeTab === 'hireFast' ? colors.info : 'white',
            color: activeTab === 'hireFast' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          How to Hire Fast
        </button>
        <button
          onClick={() => setActiveTab('balance')}
          style={{
            padding: '10px 20px',
            borderRadius: '100px',
            border: `2px solid ${activeTab === 'balance' ? colors.purple : colors.border}`,
            backgroundColor: activeTab === 'balance' ? colors.purple : 'white',
            color: activeTab === 'balance' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Balancing Act
        </button>
        <button
          onClick={() => setActiveTab('hiring')}
          style={{
            padding: '10px 20px',
            borderRadius: '100px',
            border: `2px solid ${activeTab === 'hiring' ? colors.success : colors.border}`,
            backgroundColor: activeTab === 'hiring' ? colors.success : 'white',
            color: activeTab === 'hiring' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Internal vs External
        </button>
        <button
          onClick={() => setActiveTab('culture')}
          style={{
            padding: '10px 20px',
            borderRadius: '100px',
            border: `2px solid ${activeTab === 'culture' ? colors.warning : colors.border}`,
            backgroundColor: activeTab === 'culture' ? colors.warning : 'white',
            color: activeTab === 'culture' ? 'white' : colors.text,
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Maintaining Culture
        </button>
      </div>

      {activeTab === 'profile' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {Object.entries(saProfile).map(([key, items], idx) => {
              const colors_map = [colors.accent, colors.purple, colors.success];
              const cardTitle = key === 'growthPotential' ? 'Business Acumen and Persona for Success' : key === 'gtmImpact' ? 'GTM Experience' : key.replace(/([A-Z])/g, ' $1').trim();
              return (
                <Card key={key} style={{ borderTop: `3px solid ${colors_map[idx]}` }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px', textTransform: (key === 'growthPotential' || key === 'gtmImpact') ? 'none' : 'capitalize' }}>
                    {cardTitle}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ 
                          width: '5px', 
                          height: '5px', 
                          borderRadius: '50%', 
                          backgroundColor: colors_map[idx],
                          marginTop: '6px',
                          flexShrink: 0
                        }} />
                        <EditableText
                          value={item}
                          onChange={(v) => updateSaProfile(key, i, v)}
                          style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                        />
                        {isEditMode && (
                          <button
                            onClick={() => deleteSaProfileItem(key, i)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: colors.danger,
                              cursor: 'pointer',
                              padding: '0 2px',
                              fontSize: '14px',
                              opacity: 0.6,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <AddItemButton onClick={() => addSaProfileItem(key)} label="Add item" />
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'hireFast' && (
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}>How to Hire Fast</h3>
          <p style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '24px', lineHeight: 1.5 }}>A repeatable process to identify, engage, and close the right SA—without losing speed or culture fit.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {(hireFastSteps || defaultHireFastSteps).map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: '0', marginBottom: i < (hireFastSteps || defaultHireFastSteps).length - 1 ? '0' : '0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: colors.info,
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: `3px solid ${colors.bg}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}>
                    {i + 1}
                  </div>
                  {i < (hireFastSteps || defaultHireFastSteps).length - 1 && (
                    <div style={{ width: '2px', flex: 1, minHeight: '24px', backgroundColor: colors.info, opacity: 0.4, marginTop: '8px' }} />
                  )}
                </div>
                <div style={{ flex: 1, marginLeft: '20px', paddingBottom: i < (hireFastSteps || defaultHireFastSteps).length - 1 ? '28px' : '0' }}>
                  <Card style={{ borderLeft: `4px solid ${colors.info}`, padding: '16px 20px' }}>
                    <EditableText
                      value={step.title}
                      onChange={(v) => updateHireFastStep(i, 'title', v)}
                      style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '8px', display: 'block' }}
                    />
                    <EditableText
                      value={step.description}
                      onChange={(v) => updateHireFastStep(i, 'description', v)}
                      style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6 }}
                      multiline
                    />
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'balance' && (
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>How I Balance Technical Depth, GTM Experience & Business Acumen and Persona for Success</h3>
          <p style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: '1.7', margin: 0 }}>
            <EditableText
              value={balance}
              onChange={setBalance}
              style={{ fontSize: '15px', color: colors.textSecondary }}
              multiline
            />
          </p>
        </Card>
      )}

      {activeTab === 'hiring' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Card style={{ borderLeft: `4px solid ${colors.info}` }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Internal Progression</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {internalVsExternal.internal.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ 
                    width: '5px', 
                    height: '5px', 
                    borderRadius: '50%', 
                    backgroundColor: colors.info,
                    marginTop: '6px',
                    flexShrink: 0
                  }} />
                  <EditableText
                    value={item}
                    onChange={(v) => updateInternalVsExternal('internal', i, v)}
                    style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                  />
                  {isEditMode && (
                    <button
                      onClick={() => deleteInternalVsExternalItem('internal', i)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.danger,
                        cursor: 'pointer',
                        padding: '0 4px',
                        fontSize: '16px',
                        opacity: 0.6,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {isEditMode && (
                <button
                  onClick={() => addInternalVsExternalItem('internal')}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    border: `1px dashed ${colors.info}`,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: colors.info,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.info + '10';
                    e.currentTarget.style.borderStyle = 'solid';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderStyle = 'dashed';
                  }}
                >
                  + Add item
                </button>
              )}
            </div>
          </Card>
          <Card style={{ borderLeft: `4px solid ${colors.warning}` }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>External Hiring</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {internalVsExternal.external.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ 
                    width: '5px', 
                    height: '5px', 
                    borderRadius: '50%', 
                    backgroundColor: colors.warning,
                    marginTop: '6px',
                    flexShrink: 0
                  }} />
                  <EditableText
                    value={item}
                    onChange={(v) => updateInternalVsExternal('external', i, v)}
                    style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                  />
                  {isEditMode && (
                    <button
                      onClick={() => deleteInternalVsExternalItem('external', i)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.danger,
                        cursor: 'pointer',
                        padding: '0 4px',
                        fontSize: '16px',
                        opacity: 0.6,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {isEditMode && (
                <button
                  onClick={() => addInternalVsExternalItem('external')}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    border: `1px dashed ${colors.warning}`,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: colors.warning,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.warning + '10';
                    e.currentTarget.style.borderStyle = 'solid';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderStyle = 'dashed';
                  }}
                >
                  + Add item
                </button>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'culture' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {Object.entries(maintainingCulture).map(([key, items], idx) => {
            const colorMap = [colors.warning, colors.success, colors.accent, colors.purple];
            const titleMap = {
              currentTeam: 'Current Team',
              scalingCulture: 'Scaling Culture',
              onboarding: 'Onboarding',
              teamValues: 'Team Values'
            };
            return (
              <Card key={key} style={{ borderLeft: `4px solid ${colorMap[idx]}` }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>
                  {titleMap[key]}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ 
                        width: '5px', 
                        height: '5px', 
                        borderRadius: '50%', 
                        backgroundColor: colorMap[idx],
                        marginTop: '6px',
                        flexShrink: 0
                      }} />
                      <EditableText
                        value={item}
                        onChange={(v) => updateMaintainingCulture(key, i, v)}
                        style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                      />
                      {isEditMode && (
                        <button
                          onClick={() => deleteMaintainingCultureItem(key, i)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: colors.danger,
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: '16px',
                            opacity: 0.6,
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {isEditMode && (
                    <button
                      onClick={() => addMaintainingCultureItem(key)}
                      style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        border: `1px dashed ${colorMap[idx]}`,
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        color: colorMap[idx],
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = colorMap[idx] + '10';
                        e.currentTarget.style.borderStyle = 'solid';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderStyle = 'dashed';
                      }}
                    >
                      + Add item
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// GTM & Impact Model Section
const GTMImpactSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [activeTab, setActiveTab] = useState('presale');

  const [presaleIntro, setPresaleIntro] = useLocalStorage('leadershipPlaybook_presaleIntro',
    'Pre-sale impact hinges on turning technical proof into commercial conviction. The opportunities below focus on where SAs can drive more tangible outcomes: higher-converting POCs, stronger AE partnership, and credibility with technical buyers.'
  );
  const [presaleImpact, setPresaleImpact] = useLocalStorage('leadershipPlaybook_presaleImpact', [
    'Enable users to get hands on but guided and controlled with use cases aligned to what works best in platform.',
    'Build out business narrative for each use case so there is tangible ROI for stakeholders.',
    'Identify exit criteria for success.',
    'Depth of engagement so going into implementation, there\'s less of a gap.',
    'Build joint story tied around ROI for use cases and what outcomes were necessary to prove success.',
    'Train each other so that both partners are learning from each other, make it so it\'s not a sliding scale of work that lands in SA or AE but rather enable each other to do aspects of both.',
    'Build relationships and understanding on how to own the deal together.',
    'Own the technical relationship and build trust for the platform.',
    'Educate technical stakeholders on how to cut through the noise of the AI space today.',
    'Be the strategy and value consultant of the platform on how it implements and scales.'
  ]);

  const [postsaleIntro, setPostsaleIntro] = useLocalStorage('leadershipPlaybook_postsaleIntro',
    'Post-sale impact is about adoption, engagement, and expansion. The opportunities below target where SAs can create measurable value: feature rollout, ongoing customer success, and discovery that fuels growth.'
  );
  const [postsaleImpact, setPostsaleImpact] = useLocalStorage('leadershipPlaybook_postsaleImpact', [
    'Enable feature adoption to create stickiness (WA, AI Studio, Connectors, KG etc)',
    'Work with team on how to enable aspects of the platform. Even if in post-sales, if there\'s an active opportunity, get hands on to know how the customer is using it',
    'Provide pre-built components that are great starting points to build and learn from',
    'Proactive customer engagements on post sales opportunities for expansion',
    'More discovery and relationship building with the current team',
    'Have quick check-ins on accounts that don\'t have an opportunity tied to it',
    'Continuous engagement beyond pre-sales',
    'Cadence with post-sales to build out further relationships but also to understand how implementation is going',
    'Think outside the box, you have context and that context can mean more use cases to learn and share'
  ]);

  const [adaptationIntro, setAdaptationIntro] = useLocalStorage('leadershipPlaybook_adaptationIntro',
    'Strategy shifts create both risk and opportunity. These areas capture how we adapt—product and motion changes, hands-on validation, and product roadmap alignment—so the team can stay aligned and drive impact as the business evolves.'
  );

  const [strategyAdaptation, setStrategyAdaptation] = useLocalStorage('leadershipPlaybook_strategyAdaptation', {
    agentFirst: [
      'Writer Agent is now the focus, let\'s learn the patterns people are using it for and how it can scale',
      'Broader access to tools and connectors, so what is the story when interoperability is involved and how do we keep users in Writer Agent',
      'Tech users need a place to live, as the product develops SAs can drive the Codeful usage of the platform'
    ],
    handsOnValidation: [
      'Enablement sessions, workshops, and hackathons are valuable more than ever, but we need an agenda, understanding of why and the right people in the room',
      'Be security minded, agents with access means more data that could be sensitive is involved, we need to get ahead of these conversations',
      'Learn the "vibe" when users are hands on, what gaps are in the product'
    ],
    productShifts: [
      'Regular cadence with product on updates and roadmaps, we need a narrative proactively, not reactively',
      'MCP, A2A and our perspective there',
      'Internal extracurriculars can stress test the capabilities of the platform outside of demos'
    ]
  });

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'presale', label: 'Pre-Sale Impact', color: colors.accent },
          { id: 'postsale', label: 'Post-Sale Impact', color: colors.success },
          { id: 'adaptation', label: 'Strategy Adaptation', color: colors.purple }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: `1px solid ${activeTab === tab.id ? tab.color : colors.border}`,
              backgroundColor: activeTab === tab.id ? tab.color : 'white',
              color: activeTab === tab.id ? 'white' : colors.text,
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: activeTab === tab.id ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'presale' && (
        <>
          <Card style={{ marginBottom: '24px', backgroundColor: colors.accent + '08', borderLeft: `4px solid ${colors.accent}` }}>
            <p style={{ fontSize: '14px', color: colors.textSecondary, margin: 0, lineHeight: 1.6 }}>
              <EditableText value={presaleIntro} onChange={setPresaleIntro} style={{ fontSize: '14px', color: colors.textSecondary }} multiline />
            </p>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <Card style={{ borderTop: `4px solid ${colors.accent}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.accent, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>POC & conversion</h4>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: Turn technical proof into won deals.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(presaleImpact.slice(0, 4)).map((item, j) => {
                  const i = j;
                  return (
                    <EditableListItem key={i} value={item} onChange={(v) => { const n = [...presaleImpact]; n[i] = v; setPresaleImpact(n); }} onDelete={() => setPresaleImpact(presaleImpact.filter((_, idx) => idx !== i))} color={colors.accent} />
                  );
                })}
              </div>
            </Card>
            <Card style={{ borderTop: `4px solid ${colors.purple}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.purple, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AE partnership & storytelling</h4>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: Align technical narrative with commercial motion.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(presaleImpact.slice(4, 7)).map((item, j) => {
                  const i = j + 4;
                  return (
                    <EditableListItem key={i} value={item} onChange={(v) => { const n = [...presaleImpact]; n[i] = v; setPresaleImpact(n); }} onDelete={() => setPresaleImpact(presaleImpact.filter((_, idx) => idx !== i))} color={colors.purple} />
                  );
                })}
              </div>
            </Card>
            <Card style={{ borderTop: `4px solid ${colors.success}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.success, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Technical credibility & scope</h4>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: Own technical trust and scoping without bottleneck.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(presaleImpact.slice(7)).map((item, j) => {
                  const i = j + 7;
                  return (
                    <EditableListItem key={i} value={item} onChange={(v) => { const n = [...presaleImpact]; n[i] = v; setPresaleImpact(n); }} onDelete={() => setPresaleImpact(presaleImpact.filter((_, idx) => idx !== i))} color={colors.success} />
                  );
                })}
              </div>
            </Card>
          </div>
          <div style={{ marginTop: '16px' }}>
            <AddItemButton onClick={() => setPresaleImpact([...presaleImpact, 'New item - click to edit'])} label="Add impact" />
          </div>
        </>
      )}

      {activeTab === 'postsale' && (
        <>
          <Card style={{ marginBottom: '24px', backgroundColor: colors.success + '08', borderLeft: `4px solid ${colors.success}` }}>
            <p style={{ fontSize: '14px', color: colors.textSecondary, margin: 0, lineHeight: 1.6 }}>
              <EditableText value={postsaleIntro} onChange={setPostsaleIntro} style={{ fontSize: '14px', color: colors.textSecondary }} multiline />
            </p>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <Card style={{ borderTop: `4px solid ${colors.success}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.success, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Feature adoption</h4>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: Move the needle on the product and adoption.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(postsaleImpact.slice(0, 3)).map((item, j) => {
                  const i = j;
                  return (
                    <EditableListItem key={i} value={item} onChange={(v) => { const n = [...postsaleImpact]; n[i] = v; setPostsaleImpact(n); }} onDelete={() => setPostsaleImpact(postsaleImpact.filter((_, idx) => idx !== i))} color={colors.success} />
                  );
                })}
              </div>
            </Card>
            <Card style={{ borderTop: `4px solid ${colors.purple}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.purple, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Proactive engagement</h4>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: Champion building and ongoing success beyond handoff.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(postsaleImpact.slice(3, 6)).map((item, j) => {
                  const i = j + 3;
                  return (
                    <EditableListItem key={i} value={item} onChange={(v) => { const n = [...postsaleImpact]; n[i] = v; setPostsaleImpact(n); }} onDelete={() => setPostsaleImpact(postsaleImpact.filter((_, idx) => idx !== i))} color={colors.purple} />
                  );
                })}
              </div>
            </Card>
            <Card style={{ borderTop: `4px solid ${colors.accent}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.accent, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expansion & discovery</h4>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: Continuous engagement and discovery that fuels growth.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(postsaleImpact.slice(6)).map((item, j) => {
                  const i = j + 6;
                  return (
                    <EditableListItem key={i} value={item} onChange={(v) => { const n = [...postsaleImpact]; n[i] = v; setPostsaleImpact(n); }} onDelete={() => setPostsaleImpact(postsaleImpact.filter((_, idx) => idx !== i))} color={colors.accent} />
                  );
                })}
              </div>
            </Card>
          </div>
          <div style={{ marginTop: '16px' }}>
            <AddItemButton onClick={() => setPostsaleImpact([...postsaleImpact, 'New item - click to edit'])} label="Add impact" />
          </div>
        </>
      )}

      {activeTab === 'adaptation' && (
        <div>
          <Card style={{ marginBottom: '24px', backgroundColor: colors.purple + '08', borderLeft: `4px solid ${colors.purple}` }}>
            <p style={{ fontSize: '14px', color: colors.textSecondary, margin: 0, lineHeight: 1.6 }}>
              <EditableText value={adaptationIntro} onChange={setAdaptationIntro} style={{ fontSize: '14px', color: colors.textSecondary }} multiline />
            </p>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {Object.entries(strategyAdaptation).map(([key, items], idx) => {
              const colors_map = [colors.accent, colors.purple, colors.warning];
              const opportunityLabels = {
                agentFirst: 'Product and motion shifts (e.g. Agent Builder → Applications)',
                handsOnValidation: 'Hands-on validation and enablement (security, engagement)',
                productShifts: 'Product roadmap and orchestration alignment'
              };
              const opportunity = opportunityLabels[key] || key.replace(/([A-Z])/g, ' $1').trim();
              return (
                <Card key={key} style={{ borderLeft: `4px solid ${colors_map[idx]}` }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors_map[idx], marginBottom: '6px', textTransform: 'capitalize' }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </h4>
                  <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>Opportunity: {opportunity}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ 
                          width: '5px', 
                          height: '5px', 
                          borderRadius: '50%', 
                          backgroundColor: colors_map[idx],
                          marginTop: '6px',
                          flexShrink: 0
                        }} />
                        <EditableText
                          value={item}
                          onChange={(v) => {
                            const newItems = [...items];
                            newItems[i] = v;
                            setStrategyAdaptation({ ...strategyAdaptation, [key]: newItems });
                          }}
                          style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                        />
                        {isEditMode && (
                          <button
                            onClick={() => {
                              const newItems = items.filter((_, idx) => idx !== i);
                              setStrategyAdaptation({ ...strategyAdaptation, [key]: newItems });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: colors.danger,
                              cursor: 'pointer',
                              padding: '0 4px',
                              fontSize: '16px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isEditMode && (
                    <button
                      onClick={() => {
                        setStrategyAdaptation({ ...strategyAdaptation, [key]: [...items, 'New item - click to edit'] });
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        border: `1px dashed ${colors_map[idx]}`,
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        color: colors_map[idx],
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = colors_map[idx] + '10';
                        e.currentTarget.style.borderStyle = 'solid';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderStyle = 'dashed';
                      }}
                    >
                      + Add item
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

// Operating & Coaching Model Section
const OperatingCoachingSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [activeTab, setActiveTab] = useState('metrics');

  const [metrics, setMetrics] = useLocalStorage('leadershipPlaybook_metrics', {
    leading: [
      { name: 'POC conversion rate', target: 'TBD baseline, then +X%', status: 'unknown' },
      { name: 'Check-ins per trial', target: '3+', status: 'bad', note: '4 months ago: zero check-ins' },
      { name: 'Feature adoption rates', target: 'Writer Agent, Guardrails, AI Studio, Knowledge Graph etc', status: 'bad' },
      { name: 'SA utilization / capacity', target: 'Quantify the 50+ trials scope', status: 'unknown' }
    ],
    lagging: [
      { name: 'Deal win rate with SA involvement', target: 'TBD', status: 'unknown' },
      { name: 'Customer expansion revenue', target: 'Increase', status: 'unknown' },
      { name: 'Time to value for new customers', target: 'Reduce', status: 'unknown' },
      { name: '90-day retention', target: '> 90%', status: 'good' }
    ]
  });

  const [cadences, setCadences] = useLocalStorage('leadershipPlaybook_cadences', [
    { type: 'Weekly Team Call', frequency: 'Every Monday', focus: 'Deal reviews, blockers, quick wins' },
    { type: '1:1s', frequency: 'Weekly with each SA', focus: 'Coaching, development, career growth' },
    { type: 'Forecast Review', frequency: 'Weekly with Sales leadership', focus: 'Pipeline health, SA capacity' },
    { type: 'QBR', frequency: 'Quarterly', focus: 'Team performance, strategic planning' },
    { type: 'Deal Reviews', frequency: 'As needed for key opportunities', focus: 'Strategic partnership with AEs' }
  ]);

  const [coachingModel, setCoachingModel] = useLocalStorage('leadershipPlaybook_coachingModel', {
    newSAs: [
      'Better onboarding—not thrown into role as "tech support"',
      '10 post-mortems per quarter with real-time feedback',
      'Shadow calls with 15-minute debrief sessions',
      'Attend all CS/sales enablement sessions, follow with team check-ins',
      'Focus on 3 core competencies: product knowledge, buyer personas, competitive landscape'
    ],
    tenuredSAs: [
      'Develop special skills that differentiate from AEs',
      'Executive presence/strategic business understanding development',
      'Sales rep showcases of successful deal closes',
      'Weekly focus communication to team',
      'Master deck as single source of truth'
    ],
    continuousLearning: [
      'Systematic content sharing—weekly demo highlights by industry',
      'Marketing/enablement to provide weekly industry-specific content',
      'Document/plan team asks constantly'
    ]
  });

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'metrics', label: 'Metrics', color: colors.accent },
          { id: 'cadences', label: 'Team Cadences', color: colors.purple },
          { id: 'coaching', label: 'Coaching Model', color: colors.success }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: `1px solid ${activeTab === tab.id ? tab.color : colors.border}`,
              backgroundColor: activeTab === tab.id ? tab.color : 'white',
              color: activeTab === tab.id ? 'white' : colors.text,
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: activeTab === tab.id ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'metrics' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <Card>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Leading Indicators</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {metrics.leading.map((m, i) => (
                  <div key={i} style={{ 
                    padding: '12px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                      <EditableText
                        value={m.name}
                        onChange={(v) => {
                          const newMetrics = [...metrics.leading];
                          newMetrics[i] = { ...m, name: v };
                          setMetrics({ ...metrics, leading: newMetrics });
                        }}
                        style={{ fontSize: '14px', fontWeight: '500', color: colors.text, flex: 1 }}
                      />
                      <span style={{ 
                        fontSize: '11px', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        backgroundColor: m.status === 'good' ? colors.success + '15' : m.status === 'bad' ? colors.danger + '15' : colors.textMuted + '15',
                        color: m.status === 'good' ? colors.success : m.status === 'bad' ? colors.danger : colors.textMuted
                      }}>
                        {m.status}
                      </span>
                      {isEditMode && (
                        <button
                          onClick={() => {
                            const newMetrics = metrics.leading.filter((_, idx) => idx !== i);
                            setMetrics({ ...metrics, leading: newMetrics });
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: colors.danger,
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: '16px',
                            opacity: 0.6,
                            marginLeft: '8px'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', color: colors.textMuted }}>Target: </span>
                      <EditableText
                        value={m.target}
                        onChange={(v) => {
                          const newMetrics = [...metrics.leading];
                          newMetrics[i] = { ...m, target: v };
                          setMetrics({ ...metrics, leading: newMetrics });
                        }}
                        style={{ fontSize: '12px', color: colors.textMuted }}
                      />
                    </div>
                    {m.note && (
                      <div style={{ marginTop: '4px' }}>
                        <EditableText
                          value={m.note}
                          onChange={(v) => {
                            const newMetrics = [...metrics.leading];
                            newMetrics[i] = { ...m, note: v };
                            setMetrics({ ...metrics, leading: newMetrics });
                          }}
                          style={{ fontSize: '11px', color: colors.textMuted, fontStyle: 'italic' }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {isEditMode && (
                <button
                  onClick={() => {
                    setMetrics({ ...metrics, leading: [...metrics.leading, { name: 'New metric', target: 'TBD', status: 'unknown' }] });
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    border: `1px dashed ${colors.accent}`,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: colors.accent,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  + Add metric
                </button>
              )}
            </Card>
            <Card>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Lagging Indicators</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {metrics.lagging.map((m, i) => (
                  <div key={i} style={{ 
                    padding: '12px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                      <EditableText
                        value={m.name}
                        onChange={(v) => {
                          const newMetrics = [...metrics.lagging];
                          newMetrics[i] = { ...m, name: v };
                          setMetrics({ ...metrics, lagging: newMetrics });
                        }}
                        style={{ fontSize: '14px', fontWeight: '500', color: colors.text, flex: 1 }}
                      />
                      <span style={{ 
                        fontSize: '11px', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        backgroundColor: m.status === 'good' ? colors.success + '15' : colors.textMuted + '15',
                        color: m.status === 'good' ? colors.success : colors.textMuted
                      }}>
                        {m.status}
                      </span>
                      {isEditMode && (
                        <button
                          onClick={() => {
                            const newMetrics = metrics.lagging.filter((_, idx) => idx !== i);
                            setMetrics({ ...metrics, lagging: newMetrics });
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: colors.danger,
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: '16px',
                            opacity: 0.6,
                            marginLeft: '8px'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', color: colors.textMuted }}>Target: </span>
                      <EditableText
                        value={m.target}
                        onChange={(v) => {
                          const newMetrics = [...metrics.lagging];
                          newMetrics[i] = { ...m, target: v };
                          setMetrics({ ...metrics, lagging: newMetrics });
                        }}
                        style={{ fontSize: '12px', color: colors.textMuted }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {isEditMode && (
                <button
                  onClick={() => {
                    setMetrics({ ...metrics, lagging: [...metrics.lagging, { name: 'New metric', target: 'TBD', status: 'unknown' }] });
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    border: `1px dashed ${colors.accent}`,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: colors.accent,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  + Add metric
                </button>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'cadences' && (
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Team Cadences</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {cadences.map((cadence, i) => (
              <div key={i} style={{ 
                display: 'grid',
                gridTemplateColumns: '200px 150px 1fr auto',
                gap: '16px',
                padding: '12px',
                backgroundColor: i % 2 === 0 ? 'white' : colors.surface,
                borderRadius: '8px',
                alignItems: 'center'
              }}>
                <EditableText
                  value={cadence.type}
                  onChange={(v) => {
                    const newCadences = [...cadences];
                    newCadences[i] = { ...cadence, type: v };
                    setCadences(newCadences);
                  }}
                  style={{ fontSize: '14px', fontWeight: '600', color: colors.text }}
                />
                <EditableText
                  value={cadence.frequency}
                  onChange={(v) => {
                    const newCadences = [...cadences];
                    newCadences[i] = { ...cadence, frequency: v };
                    setCadences(newCadences);
                  }}
                  style={{ fontSize: '13px', color: colors.textMuted }}
                />
                <EditableText
                  value={cadence.focus}
                  onChange={(v) => {
                    const newCadences = [...cadences];
                    newCadences[i] = { ...cadence, focus: v };
                    setCadences(newCadences);
                  }}
                  style={{ fontSize: '13px', color: colors.textSecondary }}
                />
                {isEditMode && (
                  <button
                    onClick={() => setCadences(cadences.filter((_, idx) => idx !== i))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: colors.danger,
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: '16px',
                      opacity: 0.6
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {isEditMode && (
            <button
              onClick={() => setCadences([...cadences, { type: 'New cadence', frequency: 'TBD', focus: 'TBD' }])}
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                border: `1px dashed ${colors.purple}`,
                borderRadius: '8px',
                backgroundColor: 'transparent',
                color: colors.purple,
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              + Add cadence
            </button>
          )}
        </Card>
      )}

      {activeTab === 'coaching' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {Object.entries(coachingModel).map(([key, items], idx) => {
              const colors_map = [colors.accent, colors.purple, colors.success];
              return (
                <Card key={key} style={{ borderLeft: `4px solid ${colors_map[idx]}` }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '12px', textTransform: 'capitalize' }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ 
                          width: '5px', 
                          height: '5px', 
                          borderRadius: '50%', 
                          backgroundColor: colors_map[idx],
                          marginTop: '6px',
                          flexShrink: 0
                        }} />
                        <EditableText
                          value={item}
                          onChange={(v) => {
                            const newItems = [...items];
                            newItems[i] = v;
                            setCoachingModel({ ...coachingModel, [key]: newItems });
                          }}
                          style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                        />
                        {isEditMode && (
                          <button
                            onClick={() => {
                              const newItems = items.filter((_, idx) => idx !== i);
                              setCoachingModel({ ...coachingModel, [key]: newItems });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: colors.danger,
                              cursor: 'pointer',
                              padding: '0 4px',
                              fontSize: '16px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isEditMode && (
                    <button
                      onClick={() => {
                        setCoachingModel({ ...coachingModel, [key]: [...items, 'New item - click to edit'] });
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        border: `1px dashed ${colors_map[idx]}`,
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        color: colors_map[idx],
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = colors_map[idx] + '10';
                        e.currentTarget.style.borderStyle = 'solid';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderStyle = 'dashed';
                      }}
                    >
                      + Add item
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive D3 Timeline Component
// Split phase title into two lines to reduce horizontal overlap (at " & " or near middle)
const splitPhaseTitle = (title) => {
  const atAmp = title.indexOf(' & ');
  if (atAmp > 0) {
    return [title.substring(0, atAmp), title.substring(atAmp + 3)];
  }
  const mid = Math.floor(title.length / 2);
  const spaceIndex = title.lastIndexOf(' ', mid);
  if (spaceIndex > 0) {
    return [title.substring(0, spaceIndex), title.substring(spaceIndex + 1)];
  }
  return [title, ''];
};

// Exponential growth curve: flat at start, steep at end (0 → 100 over 30 days)
const valueAtDay = (day, maxDays = 30) => 100 * (Math.exp(3 * day / maxDays) - 1) / (Math.exp(3) - 1);

const InteractiveTimeline = ({ phases, activePhase, setActivePhase, maxDays = 30 }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const TIMELINE_HEIGHT = 420;
  const [dimensions, setDimensions] = useState({ width: 0, height: TIMELINE_HEIGHT });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setDimensions({ width: w, height: TIMELINE_HEIGHT });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    const t1 = setTimeout(updateDimensions, 0);
    const t2 = setTimeout(updateDimensions, 150);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const isSmallScreen = dimensions.width < 768;
    const margin = {
      top: 24,
      right: isSmallScreen ? 24 : 40,
      bottom: isSmallScreen ? 120 : 100,
      left: isSmallScreen ? 44 : 52
    };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);
    const xScale = scaleLinear().domain([0, maxDays]).range([0, width]);
    const yScale = scaleLinear().domain([0, 100]).range([height, 0]);

    // Curve data: exponential value over days 0–maxDays
    const curveData = [];
    for (let d = 0; d <= maxDays; d += (maxDays <= 30 ? 0.5 : 1)) {
      curveData.push({ day: d, value: valueAtDay(d, maxDays) });
    }

    const lineGen = line()
      .x(d => xScale(d.day))
      .y(d => yScale(d.value))
      .curve(curveMonotoneX);

    // Y-axis: value key as 1x, 2x, 3x, etc. (no numeric count)
    const yTickValues = [20, 40, 60, 80, 100];
    const yAxis = axisLeft(yScale)
      .tickValues(yTickValues)
      .tickFormat((_, i) => `${i + 1}x`)
      .tickSizeInner(-width)
      .tickSizeOuter(0);
    g.append('g')
      .attr('class', 'axis axis-y')
      .call(yAxis)
      .selectAll('.tick line')
      .attr('stroke', colors.borderLight)
      .attr('stroke-opacity', 0.5);
    g.select('.axis-y').selectAll('text').attr('fill', colors.textMuted).attr('font-size', '11px');
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -margin.left + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text('Value');

    // X-axis (Days)
    const xTickValues = maxDays <= 30 ? [0, 5, 10, 15, 20, 25, 30] : [0, 15, 30, 45, 60, 75, 90];
    const xAxis = axisBottom(xScale)
      .ticks(7)
      .tickValues(xTickValues)
      .tickSizeInner(-height)
      .tickSizeOuter(0);
    g.append('g')
      .attr('class', 'axis axis-x')
      .attr('transform', `translate(0, ${height})`)
      .call(xAxis)
      .selectAll('.tick line')
      .attr('stroke', colors.borderLight)
      .attr('stroke-opacity', 0.5);
    g.select('.axis-x').selectAll('text').attr('fill', colors.textMuted).attr('font-size', '11px');
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + margin.bottom - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text('Days');

    // Draw curve in three segments (one per phase) with phase colors
    const segmentRanges = maxDays <= 30
      ? [[0, 10], [10, 20], [20, 30]]
      : [[0, 30], [30, 60], [60, 90]];
    segmentRanges.forEach(([start, end], i) => {
      const segmentData = curveData.filter(d => d.day >= start && d.day <= end);
      if (segmentData.length === 0) return;
      const phase = phases[i];
      const isActive = i === activePhase;
      const isPast = i < activePhase;
      g.append('path')
        .attr('d', lineGen(segmentData))
        .attr('fill', 'none')
        .attr('stroke', phase.color)
        .attr('stroke-width', isActive ? 4 : isPast ? 3 : 2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('opacity', isActive ? 1 : (maxDays > 30 ? 0.9 : (isPast ? 0.85 : 0.5)))
        .style('cursor', 'pointer')
        .style('filter', isActive ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' : 'none')
        .on('click', () => setActivePhase(i));
    });

    // Phase nodes on the curve (mid-phase); ensure we have a day for each phase
    const nodeDays = maxDays <= 30 ? [5, 15, 25] : [15, 45, 75];
    (phases || []).forEach((phase, i) => {
      const day = nodeDays[i] != null ? nodeDays[i] : (i + 0.5) * (maxDays / (phases.length || 1));
      const x = xScale(day);
      const y = yScale(valueAtDay(day, maxDays));
      const isActive = i === activePhase;
      const isPast = i < activePhase;
      const circleRadius = isActive ? 16 : isPast ? 14 : 12;
      const labelY = y - circleRadius - 44;
      const titleY = y - circleRadius - 24;
      const textAnchor = i === 0 ? 'start' : i === phases.length - 1 ? 'end' : 'middle';

      if (isActive || isPast) {
        g.append('circle')
          .attr('cx', x).attr('cy', y).attr('r', 20)
          .attr('fill', 'none').attr('stroke', phase.color).attr('stroke-width', 2).attr('opacity', 0.3)
          .style('filter', 'blur(4px)');
      }
      g.append('circle')
        .attr('cx', x).attr('cy', y)
        .attr('r', circleRadius)
        .attr('fill', isActive ? phase.color : (isPast ? phase.color : (phase.color + '30')))
        .attr('stroke', phase.color)
        .attr('stroke-width', isActive ? 3 : 2)
        .style('cursor', 'pointer')
        .style('transition', 'all 0.3s')
        .on('click', () => setActivePhase(i))
        .on('mouseenter', function() {
          select(this).transition().duration(200).attr('r', isActive ? 18 : 16);
        })
        .on('mouseleave', function() {
          select(this).transition().duration(200).attr('r', circleRadius);
        });
      if (isActive || isPast) {
        g.append('circle')
          .attr('cx', x).attr('cy', y).attr('r', 6).attr('fill', 'white')
          .style('pointer-events', 'none');
      }

      g.append('text')
        .attr('x', x).attr('y', labelY)
        .attr('text-anchor', textAnchor).attr('font-size', '11px')
        .attr('font-weight', isActive ? '700' : '600')
        .attr('fill', isActive ? phase.color : colors.textMuted)
        .text(phase.days)
        .style('cursor', 'pointer')
        .on('click', () => setActivePhase(i));

      const [line1, line2] = splitPhaseTitle(phase.title);
      g.append('text')
        .attr('x', x).attr('y', titleY)
        .attr('text-anchor', textAnchor).attr('font-size', '12px')
        .attr('font-weight', isActive ? '700' : '500')
        .attr('fill', isActive ? colors.text : colors.textMuted)
        .text(line1)
        .style('cursor', 'pointer')
        .on('click', () => setActivePhase(i));
      if (line2) {
        g.append('text')
          .attr('x', x).attr('y', titleY + 16)
          .attr('text-anchor', textAnchor).attr('font-size', '12px')
          .attr('font-weight', isActive ? '700' : '500')
          .attr('fill', isActive ? colors.text : colors.textMuted)
          .text(line2)
          .style('cursor', 'pointer')
          .on('click', () => setActivePhase(i));
      }

      const checkmarkAnchor = i === 0 ? 'start' : i === phases.length - 1 ? 'end' : 'middle';
      if (isPast) {
        g.append('text')
          .attr('x', x)
          .attr('y', labelY - 18)
          .attr('text-anchor', checkmarkAnchor)
          .attr('font-size', '18px')
          .text('✓')
          .attr('fill', phase.color)
          .style('pointer-events', 'none');
      }
    });

  }, [phases, activePhase, dimensions, maxDays]);

  return (
    <div ref={containerRef} style={{ width: '100%', marginBottom: '32px' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
    </div>
  );
};

// First 30 Days Section (10 / 20 / 30 day focus)
const First30DaysSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [activePhase, setActivePhase] = useState(0);
  const [timelineTitle, setTimelineTitle] = useLocalStorage('leadershipPlaybook_timelineTitle', '30-60-90 Timeline');

  const [first30PhaseSummary, setFirst30PhaseSummary] = useLocalStorage('leadershipPlaybook_first30PhaseSummary', {
    days: 'Days 1-30',
    title: 'Discovery, Design & Launch',
    goal: 'Establish baseline for the SA Strat West team, design pilots, and operationalize rhythms so Day 30 outcomes are measurable and repeatable.',
    pillars: [
      'Baseline: Strat West team structure, key activities, capacity, retention',
      'Pilots & prescriptive assets (differentiation, capacity, replication)',
      'Rhythms: accountability and replication in motion'
    ]
  });

  const defaultPhases30 = [
    {
      days: 'Days 1-10',
      title: 'Discovery & Baseline',
      color: colors.accent,
      goal: 'Map current state across Strat West team structure, key activities of value, competitive positioning, capacity, and retention—establish baseline for action',
      priorities: [
        'Deal flow: Audit deal sources and velocity; interview 3–5 Strat West SAs on friction points; document workflow and handoffs; pull deal-velocity data',
        'Accountability: Create Strat West engagement scorecard—discovery calls, pipeline, deals closed; define expectations and success criteria',
        'Differentiation: Conduct 5 competitive-learning interviews (where "just use ChatGPT" influenced outcomes); audit sales collateral; build competitive matrix: Writer vs. ChatGPT Enterprise vs. Claude vs. Gemini',
        'Capacity: Build SA Capacity Dashboard for Strat West—deal count per SA, weighted pipeline, deal stage distribution; set yellow (18+ deals or 120% avg pipeline) and red (21+ or 140%) thresholds',
        'Retention: Confidential 1:1s with each Strat West SA—what would make you stay 2 years? What energizes vs. drains? Map retention focus and career aspirations',
        'Replication: Shadow or interview top-performing Strat West SAs; review win/loss and deal-velocity data; document 3–5 repeatable patterns and draft "how the best SAs work" for playbook'
      ],
      risks: [
        'Trying to address everything at once without baseline clarity',
        'Strat West SAs not surfacing key themes in interviews',
        'Dashboard built on incomplete or stale data',
        'Overpromising timelines before discovery complete'
      ],
      assumptions: [
        'Leadership supports 30-day discovery before major process changes',
        'Sales data available in Salesforce or equivalent',
        'Strat West team willing to participate in 1:1s and interviews',
        'Current structure stable enough to run parallel discovery'
      ],
      keyDeliverables: [
        'Deal flow and workflow documentation',
        'Strat West engagement scorecard and expectations',
        'Competitive matrix and lost-deal summary',
        'SA Capacity Dashboard for Strat West (yellow/red thresholds)',
        'Retention 1:1 summary and retention-focus map',
        'Key activities of value summary; 3–5 repeatable patterns documented'
      ]
    },
    {
      days: 'Days 11-20',
      title: 'Pilot Design & Build',
      color: colors.purple,
      goal: 'Design pilots and prescriptive assets, differentiation playbook, capacity rules, and retention programs—actionable by Day 30',
      priorities: [
        'Pilot: Select region or segment for 60-day pilot; document roles and handoffs (who owns solution, who owns customer relationship); create shared deal rooms and channels',
        'Enablement: Build pitch kits for top 5 use cases—2-min pitch, proof points, discovery questions, demo script; create "Why Writer vs. DIY" one-pager',
        'Differentiation: Develop Objection Handling Playbook—talk tracks for "just use ChatGPT," "we\'ll build ourselves," "Gemini free with Workspace"; create 3 vertical "Why Writer Wins" narratives; document TCO/time-to-value angles',
        'Capacity: Audit SA-to-AE mappings vs. actual deal flow; identify mismatches; propose rebalancing by geography, vertical, deal velocity; draft Deal Assignment Rules and escalation path when capacity constrained',
        'Retention: Define Lighthouse Deal program—2–3 strategic accounts/quarter with executive touchpoints; design SA Innovation Sprint (2-day net-new build, present to leadership); implement Executive Shadow',
        'Replication: Turn key activities into templates or playbooks (discovery, demo, exit gates, handoffs); define replication cadence for Strat West (enablement, coaching, content); pilot with 1–2 SAs and iterate'
      ],
      risks: [
        'Pilot design scope—opportunity to launch in 60 days',
        'Pitch kits—opportunity to tailor for adoption',
        'Objection playbook not grounded in real deal language',
        'Rebalancing triggers political pushback'
      ],
      assumptions: [
        'Pilot region or segment has buy-in',
        'Content/Enablement can support pitch kits and playbook',
        'AE alignment changes can be socialized with Sales leadership',
        'Executive Shadow and Lighthouse criteria are agreed'
      ],
      keyDeliverables: [
        'Pilot plan with roles and shared channels',
        'Pitch kits (top 5 use cases) and Why Writer vs. DIY one-pager',
        'Objection Handling Playbook and vertical narratives',
        'Deal Assignment Rules and rebalancing proposal',
        'Lighthouse Deal and Innovation Sprint program docs',
        'Strat West SA playbook draft (key activities); replication process outline and pilot plan'
      ]
    },
    {
      days: 'Days 21-30',
      title: 'Operationalize & Rhythm',
      color: colors.warning,
      goal: 'Launch pilots and accountability rhythms, enable SAs on differentiation and replication process, operationalize capacity and recognition—so Day 30 outcomes are measurable and repeatable',
      priorities: [
        'Pilot: Launch pilot with success metrics (deal velocity, customer satisfaction, SA utilization); run weekly retro; build business case for broader rollout from pilot data',
        'Accountability: Launch monthly Strat West team business reviews with scorecard; require key account planning (named accounts, owner, next action, commit date); define escalation path when below minimums; build Salesforce dashboard for Strat West engagement visible to leadership',
        'Differentiation: Run 90-minute Strat West SA enablement on Objection Handling Playbook; start "Win Story of the Week" in Slack; create Seismic/Highspot collection for competitive situations; establish quarterly competitive intel refresh',
        'Capacity: Add weekly 15-min capacity check-in to Strat West team standup (dashboard review, flag imbalances); document flex-capacity protocol when SA hits red threshold (redistribution steps, AE communication); define strategic-deal criteria',
        'Retention: Launch monthly Impact Spotlight (Strat West SA presents innovative solution to team + leadership); document path-to-Lead (deals closed, enablement contribution, peer feedback, lighthouse participation); schedule quarterly career development conversations (separate from performance reviews)',
        'Replication: Roll out playbook and replication cadence for Strat West (enablement, coaching checkpoints, content); build feedback loop so wins and gaps continuously update the process; establish "key activities of value" as a standing team topic'
      ],
      risks: [
        'Pilot metrics—opportunity to track and demonstrate value',
        'Reviews—opportunity to build real accountability',
        'Enablement one-and-done—no reinforcement',
        'Capacity protocol not used when pressure hits'
      ],
      assumptions: [
        'Pilot has clear success criteria and owner',
        'Salesforce/Tableau can support engagement and capacity dashboards',
        'Leadership attends Impact Spotlight or equivalent',
        'Career development conversations are protected time'
      ],
      keyDeliverables: [
        'Pilot launched with metrics and weekly retro cadence',
        'Strat West team business review and account planning in motion; engagement dashboard live',
        'Strat West SA differentiation enablement complete; competitive content in Seismic/Highspot',
        'Weekly capacity check-in and flex-capacity protocol documented',
        'Impact Spotlight and path-to-Lead doc live; career conversations scheduled',
        'Playbook in use; replication cadence and feedback loop established for Strat West'
      ]
    }
  ];

  const [phases, setPhases] = useLocalStorage('leadershipPlaybook_phases', defaultPhases30);

  // One-time migration: if saved phases still have old partner-SA-specific goals, update to SA-general goals
  useEffect(() => {
    setPhases(prev => {
      if (!Array.isArray(prev) || prev.length < 3) return prev;
      if (!prev[0]?.goal?.includes('Partner SA integration')) return prev;
      const newGoals = [
        'Map current state across team structure, key activities of value, competitive positioning, capacity, and retention—establish baseline for action',
        'Design pilots and prescriptive assets, differentiation playbook, capacity rules, and retention programs—actionable by Day 30',
        'Launch pilots and accountability rhythms, enable SAs on differentiation and replication process, operationalize capacity and recognition—so Day 30 outcomes are measurable and repeatable'
      ];
      return prev.map((p, i) => ({ ...p, goal: newGoals[i] ?? p.goal }));
    });
  }, []);

  const [keyOutcomesTitle, setKeyOutcomesTitle] = useLocalStorage('leadershipPlaybook_keyOutcomesTitle', 'Key Actions');
  const [keyOutcomes, setKeyOutcomes] = useLocalStorage('leadershipPlaybook_keyOutcomes', [
    'Audit deal flow & Strat West SA capacity; build Capacity Dashboard with yellow/red thresholds',
    'Launch pilot with success metrics; document Strat West engagement and accountability',
    'Deliver Objection Handling Playbook and differentiation enablement; Win Story of the Week',
    'Launch Impact Spotlight and path-to-Lead; schedule career conversations',
    'Document key activities of value and replication playbook for Strat West; establish enablement cadence'
  ]);

  const [generalSADescription, setGeneralSADescription] = useLocalStorage('leadershipPlaybook_generalSADescription',
    'The first 30 days should establish a baseline for the SA Strat West team: identify which activities drive the most value (wins, velocity, customer outcomes) and create repeatable process so the team can scale what works instead of relying on hero effort.'
  );
  const [generalSAIdentifying, setGeneralSAIdentifying] = useLocalStorage('leadershipPlaybook_generalSAIdentifying', [
    'Shadow or interview top Strat West performers to pinpoint what they do that drives wins (discovery, demos, follow-up, handoffs)',
    'Review win/loss and deal-velocity data to tie activities to outcomes',
    'Document 3–5 repeatable patterns (e.g. discovery questions that unlock expansion, demo flows that convert)',
    'Capture "how the best SAs work" in a draft that can become the Strat West playbook'
  ]);
  const [generalSAReplication, setGeneralSAReplication] = useLocalStorage('leadershipPlaybook_generalSAReplication', [
    'Turn key activities into templates or playbooks (discovery, demo, exit gates, handoffs)',
    'Define a replication cadence for Strat West: enablement sessions, coaching checkpoints, content in Seismic/Highspot',
    'Pilot with 1–2 Strat West SAs and iterate before rolling out to the full team',
    'Build feedback loop so wins and gaps continuously update the process'
  ]);

  const defaultPhases60_90 = [
    {
      days: 'Days 31–60',
      title: 'Scale & Refine',
      color: colors.success,
      goal: 'Scale pilot, refine playbooks and capacity, deepen Strat West team accountability and retention.',
      pillars: [
        'Pilot retros and business case for broader rollout',
        'Monthly Strat West business reviews and account planning standard',
        'Capacity and retention rhythms embedded'
      ],
      keyActivities: [
        'Run pilot weekly retros; document learnings and build rollout case',
        'Monthly Strat West team reviews with scorecard; key account planning; escalation path live',
        'Second round Objection Playbook enablement; Win Story of the Week and competitive content',
        'Weekly capacity check-in and flex-capacity protocol; strategic-deal criteria set',
        'Impact Spotlight monthly; path-to-Lead and career conversations in motion'
      ]
    },
    {
      days: 'Days 61–90',
      title: 'Broaden & Embed',
      color: colors.info,
      goal: 'Broaden rollout, embed rhythms and playbooks, lock in Strat West talent and culture.',
      pillars: [
        'Pilot rollout (if validated); Strat West team model refined',
        'Scorecard and reviews embedded; pipeline and accountability visible',
        'Playbooks and retention programs part of Strat West team rhythm'
      ],
      keyActivities: [
        'Broader rollout; shared channels and handoffs consistent; velocity and satisfaction tracked',
        'Strat West engagement scorecard and expectations embedded; reviews and planning standard',
        'Objection Playbook in every deal; Strat West SA confidence on Why Writer Wins',
        'Capacity dashboard and flex protocol standard; rebalancing as needed',
        'Impact Spotlight and path-to-Lead live; career conversations and retention tracked'
      ]
    }
  ];

  const [phases60_90, setPhases60_90] = useLocalStorage('leadershipPlaybook_phases60_90', defaultPhases60_90);

  const updatePhaseByIndex = (phaseIndex, field, value) => {
    setPhases(prev => prev.map((p, i) => i === phaseIndex ? { ...p, [field]: value } : p));
  };
  const updatePhaseListItemByIndex = (phaseIndex, listKey, itemIndex, value) => {
    setPhases(prev => prev.map((p, i) => i === phaseIndex ? { ...p, [listKey]: p[listKey].map((item, idx) => idx === itemIndex ? value : item) } : p));
  };
  const deletePhaseListItemByIndex = (phaseIndex, listKey, itemIndex) => {
    setPhases(prev => prev.map((p, i) => i === phaseIndex ? { ...p, [listKey]: p[listKey].filter((_, idx) => idx !== itemIndex) } : p));
  };
  const addPhaseListItemByIndex = (phaseIndex, listKey) => {
    setPhases(prev => prev.map((p, i) => i === phaseIndex ? { ...p, [listKey]: [...(p[listKey] || []), 'New item - click to edit'] } : p));
  };

  const updatePhase60_90Field = (phaseIndex, field, value) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, [field]: value } : p));
  };
  const updatePhase60_90Activity = (phaseIndex, itemIndex, value) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, keyActivities: p.keyActivities.map((item, idx) => idx === itemIndex ? value : item) } : p));
  };
  const deletePhase60_90Activity = (phaseIndex, itemIndex) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, keyActivities: p.keyActivities.filter((_, idx) => idx !== itemIndex) } : p));
  };
  const addPhase60_90Activity = (phaseIndex) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, keyActivities: [...p.keyActivities, 'New item - click to edit'] } : p));
  };
  const updatePhase60_90Pillar = (phaseIndex, pillarIndex, value) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, pillars: (p.pillars || []).map((pp, j) => j === pillarIndex ? value : pp) } : p));
  };
  const addPhase60_90Pillar = (phaseIndex) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, pillars: [...(p.pillars || []), 'New pillar - click to edit'] } : p));
  };
  const deletePhase60_90Pillar = (phaseIndex, pillarIndex) => {
    setPhases60_90(prev => prev.map((p, i) => i === phaseIndex ? { ...p, pillars: (p.pillars || []).filter((_, j) => j !== pillarIndex) } : p));
  };

  // 30-60-90 timeline phases (for timeline + cards in detail view)
  const timelinePhases306090 = [
    { ...first30PhaseSummary, color: colors.accent },
    phases60_90[0],
    phases60_90[1]
  ];

  const updateFirst30PhaseSummary = (field, value) => setFirst30PhaseSummary(prev => ({ ...prev, [field]: value }));
  const updateFirst30Pillar = (i, v) => setFirst30PhaseSummary(prev => ({ ...prev, pillars: (prev.pillars || []).map((p, j) => j === i ? v : p) }));
  const addFirst30Pillar = () => setFirst30PhaseSummary(prev => ({ ...prev, pillars: [...(prev.pillars || []), 'New pillar - click to edit'] }));
  const deleteFirst30Pillar = (i) => setFirst30PhaseSummary(prev => ({ ...prev, pillars: (prev.pillars || []).filter((_, j) => j !== i) }));

  // Update functions for phase data (kept for any legacy use; primary editing now via updatePhaseByIndex etc.)
  const updatePhaseField = (field, value) => {
    setPhases(prev => prev.map((phase, i) => 
      i === activePhase ? { ...phase, [field]: value } : phase
    ));
  };

  const updatePhaseListItem = (listKey, index, value) => {
    setPhases(prev => prev.map((phase, i) => 
      i === activePhase ? {
        ...phase,
        [listKey]: phase[listKey].map((item, idx) => idx === index ? value : item)
      } : phase
    ));
  };

  const deletePhaseListItem = (listKey, index) => {
    setPhases(prev => prev.map((phase, i) => 
      i === activePhase ? {
        ...phase,
        [listKey]: phase[listKey].filter((_, idx) => idx !== index)
      } : phase
    ));
  };

  const addPhaseListItem = (listKey) => {
    setPhases(prev => prev.map((phase, i) => 
      i === activePhase ? {
        ...phase,
        [listKey]: [...phase[listKey], 'New item - click to edit']
      } : phase
    ));
  };

  return (
    <div>
      {/* 30-60-90 Timeline */}
      <Card style={{ marginBottom: '24px', padding: '24px', backgroundColor: 'white', borderLeft: `4px solid ${colors.accent}` }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <EditableText
            value={timelineTitle}
            onChange={(v) => setTimelineTitle(v)}
            style={{ fontSize: '18px', fontWeight: '600', color: colors.text }}
          />
        </div>
        <InteractiveTimeline
          phases={timelinePhases306090}
          activePhase={activePhase}
          setActivePhase={setActivePhase}
          maxDays={90}
        />
      </Card>

      {/* Detail card for selected segment: Pillars + Key Actions only */}
      {activePhase === 0 && (
        <Card style={{ marginBottom: '24px', padding: '24px', borderLeft: `4px solid ${colors.accent}` }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: colors.accent, letterSpacing: '0.04em', marginBottom: '4px' }}>{first30PhaseSummary.days}</div>
            <EditableText value={first30PhaseSummary.title} onChange={(v) => updateFirst30PhaseSummary('title', v)} style={{ fontSize: '18px', fontWeight: '600', color: colors.text, margin: 0 }} />
            <EditableText value={first30PhaseSummary.goal} onChange={(v) => updateFirst30PhaseSummary('goal', v)} style={{ fontSize: '13px', color: colors.textSecondary, marginTop: '8px', display: 'block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: colors.textMuted, marginBottom: '10px' }}>Key pillars</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(first30PhaseSummary.pillars || []).map((p, i) => (
                  <EditableListItem key={i} value={p} onChange={(v) => updateFirst30Pillar(i, v)} onDelete={() => deleteFirst30Pillar(i)} color={colors.accent} />
                ))}
                <AddItemButton onClick={addFirst30Pillar} label="Add pillar" />
              </div>
            </div>
            <div>
              <EditableText value={keyOutcomesTitle} onChange={(v) => setKeyOutcomesTitle(v)} style={{ fontSize: '13px', fontWeight: '600', color: colors.textMuted, marginBottom: '10px', display: 'block' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {keyOutcomes.map((item, i) => (
                  <EditableListItem key={i} value={item} onChange={(v) => { const n = [...keyOutcomes]; n[i] = v; setKeyOutcomes(n); }} onDelete={() => setKeyOutcomes(keyOutcomes.filter((_, idx) => idx !== i))} color={colors.accent} />
                ))}
                <AddItemButton onClick={() => setKeyOutcomes([...keyOutcomes, 'New action - click to edit'])} label="Add action" />
              </div>
            </div>
          </div>
        </Card>
      )}

      {activePhase === 1 && phases60_90[0] && (
        <Card style={{ marginBottom: '24px', padding: '24px', borderLeft: `4px solid ${phases60_90[0].color}` }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: phases60_90[0].color, letterSpacing: '0.04em', marginBottom: '4px' }}>{phases60_90[0].days}</div>
            <EditableText value={phases60_90[0].title} onChange={(v) => updatePhase60_90Field(0, 'title', v)} style={{ fontSize: '18px', fontWeight: '600', color: colors.text, margin: 0 }} />
            <EditableText value={phases60_90[0].goal} onChange={(v) => updatePhase60_90Field(0, 'goal', v)} style={{ fontSize: '13px', color: colors.textSecondary, marginTop: '8px', display: 'block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: colors.textMuted, marginBottom: '10px' }}>Key pillars</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(phases60_90[0].pillars || []).map((p, i) => (
                  <EditableListItem key={i} value={p} onChange={(v) => updatePhase60_90Pillar(0, i, v)} onDelete={() => deletePhase60_90Pillar(0, i)} color={phases60_90[0].color} />
                ))}
                <AddItemButton onClick={() => addPhase60_90Pillar(0)} label="Add pillar" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: colors.textMuted, marginBottom: '10px' }}>Key actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(phases60_90[0].keyActivities || []).map((item, i) => (
                  <EditableListItem key={i} value={item} onChange={(v) => updatePhase60_90Activity(0, i, v)} onDelete={() => deletePhase60_90Activity(0, i)} color={phases60_90[0].color} />
                ))}
                <AddItemButton onClick={() => addPhase60_90Activity(0)} label="Add action" />
              </div>
            </div>
          </div>
        </Card>
      )}

      {activePhase === 2 && phases60_90[1] && (
        <Card style={{ marginBottom: '24px', padding: '24px', borderLeft: `4px solid ${phases60_90[1].color}` }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: phases60_90[1].color, letterSpacing: '0.04em', marginBottom: '4px' }}>{phases60_90[1].days}</div>
            <EditableText value={phases60_90[1].title} onChange={(v) => updatePhase60_90Field(1, 'title', v)} style={{ fontSize: '18px', fontWeight: '600', color: colors.text, margin: 0 }} />
            <EditableText value={phases60_90[1].goal} onChange={(v) => updatePhase60_90Field(1, 'goal', v)} style={{ fontSize: '13px', color: colors.textSecondary, marginTop: '8px', display: 'block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: colors.textMuted, marginBottom: '10px' }}>Key pillars</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(phases60_90[1].pillars || []).map((p, i) => (
                  <EditableListItem key={i} value={p} onChange={(v) => updatePhase60_90Pillar(1, i, v)} onDelete={() => deletePhase60_90Pillar(1, i)} color={phases60_90[1].color} />
                ))}
                <AddItemButton onClick={() => addPhase60_90Pillar(1)} label="Add pillar" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: colors.textMuted, marginBottom: '10px' }}>Key actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(phases60_90[1].keyActivities || []).map((item, i) => (
                  <EditableListItem key={i} value={item} onChange={(v) => updatePhase60_90Activity(1, i, v)} onDelete={() => deletePhase60_90Activity(1, i)} color={phases60_90[1].color} />
                ))}
                <AddItemButton onClick={() => addPhase60_90Activity(1)} label="Add action" />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* SA Strat West Team: Key Activities of Value & Replication */}
      <Card style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.info}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '4px',
            backgroundColor: colors.info + '20',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px'
          }}>
            🔄
          </div>
          <h5 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, margin: 0 }}>SA Strat West Team: Key Activities of Value & Replication</h5>
        </div>
        <p style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: 1.6, marginBottom: '20px' }}>
          <EditableText
            value={generalSADescription}
            onChange={setGeneralSADescription}
            style={{ fontSize: '14px', color: colors.textSecondary }}
            multiline
          />
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h6 style={{ fontSize: '13px', fontWeight: '600', color: colors.info, marginBottom: '10px' }}>Identifying key activities of value (Strat West)</h6>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {generalSAIdentifying.map((item, i) => (
                <EditableListItem
                  key={i}
                  value={item}
                  onChange={(v) => setGeneralSAIdentifying(prev => prev.map((x, idx) => idx === i ? v : x))}
                  onDelete={() => setGeneralSAIdentifying(prev => prev.filter((_, idx) => idx !== i))}
                  color={colors.info}
                />
              ))}
            </div>
            <AddItemButton
              onClick={() => setGeneralSAIdentifying(prev => [...prev, 'New item - click to edit'])}
              label="Add item"
            />
          </div>
          <div>
            <h6 style={{ fontSize: '13px', fontWeight: '600', color: colors.info, marginBottom: '10px' }}>Creating process to replicate (Strat West)</h6>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {generalSAReplication.map((item, i) => (
                <EditableListItem
                  key={i}
                  value={item}
                  onChange={(v) => setGeneralSAReplication(prev => prev.map((x, idx) => idx === i ? v : x))}
                  onDelete={() => setGeneralSAReplication(prev => prev.filter((_, idx) => idx !== i))}
                  color={colors.info}
                />
              ))}
            </div>
            <AddItemButton
              onClick={() => setGeneralSAReplication(prev => [...prev, 'New item - click to edit'])}
              label="Add item"
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

// Masonry Items Component - Using D3 for proper masonry layout
const MasonryItems = ({ items, columnCount, gap, expandedCards, toggleCard, getCategoryColor, formatDate, isLongContent }) => {
  const containerRef = useRef(null);
  const [positions, setPositions] = useState([]);
  const [containerWidth, setContainerWidth] = useState(1000);
  const itemRefs = useRef({});
  
  // Create variety in card sizes
  const sizeVariation = [240, 280, 300, 320, 260, 290, 310, 270];
  
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    const calculateLayout = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerWidth = container.offsetWidth;
      if (containerWidth === 0) return;
      
      const columnWidth = (containerWidth - (gap * (columnCount - 1))) / columnCount;
      const columnHeights = new Array(columnCount).fill(0);
      const newPositions = [];
      
      items.forEach((item, index) => {
        const itemRef = itemRefs.current[item.id];
        let itemHeight;
        
        if (itemRef) {
          itemHeight = itemRef.offsetHeight || itemRef.getBoundingClientRect().height;
        }
        
        // If ref not ready or height is 0, use estimated height
        if (!itemHeight || itemHeight === 0) {
          const isExpanded = expandedCards.has(item.id);
          const baseHeight = sizeVariation[index % sizeVariation.length];
          itemHeight = isExpanded ? Math.max(350, item.content.length * 0.7) : baseHeight;
        }
        
        const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
        
        newPositions.push({
          left: shortestColumn * (columnWidth + gap),
          top: columnHeights[shortestColumn],
          width: columnWidth
        });
        
        columnHeights[shortestColumn] += itemHeight + gap;
      });
      
      setPositions(newPositions);
      if (containerRef.current) {
        containerRef.current.style.height = `${Math.max(...columnHeights, 400)}px`;
      }
    };
    
    // Calculate immediately with estimated heights
    calculateLayout();
    
    // Recalculate after delays to get actual heights
    const timeoutId = setTimeout(calculateLayout, 100);
    const timeoutId2 = setTimeout(calculateLayout, 300);
    const timeoutId3 = setTimeout(calculateLayout, 500);
    
    window.addEventListener('resize', calculateLayout);
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      window.removeEventListener('resize', calculateLayout);
    };
  }, [items, columnCount, gap, expandedCards, containerWidth]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '400px'
      }}
    >
      {items.map((anecdote, index) => {
        const categoryColor = getCategoryColor(anecdote.category);
        const isExpanded = expandedCards.has(anecdote.id);
        const isLong = isLongContent(anecdote.content);
        const position = positions[index];
        const baseCollapsedHeight = sizeVariation[index % sizeVariation.length];
        
        // Fallback position if not calculated yet - use simple grid for initial render
        const columnWidth = (containerWidth - (gap * (columnCount - 1))) / columnCount;
        const fallbackPosition = {
          left: (index % columnCount) * (columnWidth + gap),
          top: Math.floor(index / columnCount) * 300,
          width: columnWidth
        };
        
        const currentPosition = position || fallbackPosition;
        
        return (
          <div
            key={anecdote.id}
            ref={el => { 
              if (el) itemRefs.current[anecdote.id] = el;
            }}
            style={{
              position: 'absolute',
              left: `${currentPosition.left}px`,
              top: `${currentPosition.top}px`,
              width: `${currentPosition.width}px`,
              backgroundColor: 'white',
              borderRadius: '16px',
              border: `1px solid ${colors.border}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer',
              animation: `fadeIn 0.5s ease-out ${index * 0.05}s both`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              minHeight: isExpanded ? 'auto' : `${baseCollapsedHeight}px`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-6px) scale(1.01)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.15)';
              e.currentTarget.style.zIndex = '10';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
              e.currentTarget.style.zIndex = '1';
            }}
          >
            {/* Header with category color bar */}
            <div style={{
              height: '4px',
              backgroundColor: categoryColor,
              width: '100%'
            }} />
            
            {/* Card Content */}
            <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Sender and Date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: categoryColor + '20',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: categoryColor,
                  flexShrink: 0
                }}>
                  {anecdote.sender.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '600', 
                    color: colors.text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {anecdote.sender}
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>
                    {formatDate(anecdote.date)}
                  </div>
                </div>
              </div>

              {/* Highlight Badge */}
              <div style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '20px',
                backgroundColor: categoryColor + '12',
                color: categoryColor,
                fontSize: '11px',
                fontWeight: '600',
                marginBottom: '14px',
                width: 'fit-content'
              }}>
                {anecdote.highlight}
              </div>

              {/* Content - truncated when collapsed, full when expanded */}
              <div style={{ 
                fontSize: '13px', 
                color: colors.textSecondary, 
                lineHeight: '1.6',
                marginBottom: isLong && !isExpanded ? '12px' : '16px',
                flex: 1,
                ...(isLong && !isExpanded ? {
                  display: '-webkit-box',
                  WebkitLineClamp: Math.floor((baseCollapsedHeight - 180) / 22),
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                } : {})
              }}>
                {anecdote.content}
              </div>

              {/* Expand/Collapse Button for long content */}
              {isLong && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCard(anecdote.id);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    marginBottom: '12px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${categoryColor}`,
                    borderRadius: '20px',
                    color: categoryColor,
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = categoryColor + '15';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {isExpanded ? (
                    <>
                      <span>Show less</span>
                      <span>▲</span>
                    </>
                  ) : (
                    <>
                      <span>Read more</span>
                      <span>▼</span>
                    </>
                  )}
                </button>
              )}

              {/* Reactions Footer */}
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                alignItems: 'center',
                flexWrap: 'wrap',
                paddingTop: '12px',
                borderTop: `1px solid ${colors.borderLight}`,
                marginTop: 'auto'
              }}>
                {Object.entries(anecdote.reactions).slice(0, 4).map(([emoji, count]) => {
                  const emojiMap = {
                    'clap': '👏',
                    'heart': '❤️',
                    'fire': '🔥',
                    'think': '🤔',
                    'beer': '🍺',
                    'mindblown': '🤯',
                    'pray': '🙏',
                    'w': 'W'
                  };
                  return (
                    <div key={emoji} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      backgroundColor: colors.surface,
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      <span>{emojiMap[emoji] || '👍'}</span>
                      <span style={{ color: colors.textMuted, fontWeight: '500' }}>{count}</span>
                    </div>
                  );
                })}
                {Object.keys(anecdote.reactions).length > 4 && (
                  <span style={{ 
                    fontSize: '12px', 
                    color: colors.textMuted,
                    marginLeft: '4px'
                  }}>
                    +{Object.keys(anecdote.reactions).length - 4}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// From the Field Section — three main dropdowns with general summary + cards inside
const FromTheFieldSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [expandedCategories, setExpandedCategories] = useState({ collaboration: false, sales: false, agent: false });
  const toggleCategory = (key) => setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  const isCategoryExpanded = (key) => expandedCategories[key] !== false;

  const [collaborationSummary, setCollaborationSummary] = useLocalStorage('leadershipPlaybook_collaborationSummary',
    'Field feedback points to opportunities for consistent SA/AE pairings, role clarity (demo execution vs. strategic partnership), and pod structures with clearer guidelines on when to engage SAs.'
  );
  const [salesProcessSummary, setSalesProcessSummary] = useLocalStorage('leadershipPlaybook_salesProcessSummary',
    'Feedback highlights opportunities in use case alignment, POC process focus areas, pre-sales/post-sales connection, and standardized handoffs—information exists but isn\'t accessible or followed.'
  );
  const [agentPositioningSummary, setAgentPositioningSummary] = useLocalStorage('leadershipPlaybook_agentPositioningSummary',
    'Internal messaging positions Writer Agent as replacement rather than additional tool; opportunity to highlight interconnectivity and improve demo loading/performance and differentiation story.'
  );

  const [collaborationGaps, setCollaborationGaps] = useLocalStorage('leadershipPlaybook_collaborationGaps', [
    {
      category: 'Opportunity: Structured Partnerships',
      description: 'The West team operates mostly on round-robin assignment rather than consistent SA/AE pairings. Success cases involve sustained multi-deal relationships, and we can systematize this.',
      source: 'Field Observations',
      issues: [
        'West Coast opportunity for pod structures pairing SAs with specific AEs',
        'Historical theme: "pre-sales built custom agents that post-sales team rebuilt from scratch"',
        'Opportunity to reduce duplicate work cycles for customers'
      ],
      recommendations: [
        'Implement pod structures with consistent SA/AE pairings',
        'Systematize multi-deal relationships that have proven successful'
      ]
    },
    {
      category: 'Role Clarity and Perception',
      description: 'SAs need "more strategic partnership vs. demo execution." There\'s an opportunity to close the gap between technical demo work and holistic ROI storytelling.',
      source: 'Natalie/Thomas, Maureen (SVP Partnerships)',
      issues: [
        'Opportunity for SAs to move from reactive to "proactive partnership vs \'demo monkey\' approach"',
        'Opportunity for pod structure—consistent AE/SA pairings support relationship building',
        'Product so easy AEs can demo themselves, creating confusion about when to engage SAs',
        'Gap between technical demo work and holistic ROI storytelling'
      ],
      recommendations: [
        'Develop strategic partnership capabilities beyond demo execution',
        'Create clear guidelines on when AEs should engage SAs',
        'Build ROI storytelling skills alongside technical capabilities'
      ]
    },
    {
      category: 'Partnership Quality Opportunities',
      description: 'Best SA partnerships bring "knowledge, thought leadership, credibility building." Opportunities include coaching for new hires and more proactive SA engagement.',
      source: 'Haley (Strat AE)',
      issues: [
        'New hires "thrown into role as tech support" without coaching—opportunity to add structured onboarding',
        'SAs not "proactive in deal communication/strategy"—opportunity to grow',
        'Bandwidth considerations for strategic partnership',
        'Opportunity for "strategic ownership vs. transactional support"',
        'Opportunity for "continuous account engagement beyond scheduled meetings"'
      ],
      recommendations: [
        'Better onboarding for new SA hires with business acumen alongside technical skills',
        'Develop proactive communication and strategic thinking',
        'Create capacity for strategic partnership vs. transactional support'
      ]
    },
    {
      category: 'Working Style Variations',
      description: 'Individual working styles vary significantly—"some SAs are technical builders, others more business-forward"—requiring different development paths.',
      source: 'Garrett (RVP Central)',
      issues: [
        '"Reactive SA involvement vs strategic inclusion from opportunity start"',
        '"You do X, I do Y" mentality vs collaborative account approach',
        'Different SAs need different development paths based on their strengths'
      ],
      recommendations: [
        'Recognize and develop different SA profiles (technical builders vs. business-forward)',
        'Foster collaborative account approach vs. siloed responsibilities',
        'Include SAs strategically from opportunity start, not reactively'
      ]
    }
  ]);

  const [salesProcessIssues, setSalesProcessIssues] = useLocalStorage('leadershipPlaybook_salesProcessIssues', [
    {
      category: 'Use Case Selection Alignment',
      description: 'AEs "accept any use case for leverage, not necessarily Writer\'s best fit." Opportunity to improve validation success and compelling value story.',
      source: 'Laura (VP of SA)',
      issues: [
        'Horizontal platform messaging—opportunity to clarify differentiation from ChatGPT/Copilot',
        'Use case qualification—opportunity to improve validation success rate',
        'Opportunity to strengthen compelling value story'
      ],
      recommendations: [
        'Develop clearer use case qualification criteria',
        'Improve differentiation messaging vs. ChatGPT/Copilot',
        'Focus on Writer\'s best-fit use cases'
      ]
    },
    {
      category: 'POC Process Opportunities',
      description: 'Technical team "spends significant time on complex POCs." Content supply chain demos are "impressive." Opportunity to improve scalability and implementability.',
      source: 'Laura (VP of SA), Thomas (RVP West)',
      issues: [
        'Opportunity to align POC scope with production use',
        'Content supply chain demos impressive—opportunity to scale and implement',
        'Evaluations: Bangkok Bank (1+ year), Microsoft Copilot Studio—opportunity to clarify urgency',
        'Opportunity for executive sponsor alignment',
        'Opportunity for clear success criteria definition',
        'Opportunity for post-POC path agreement before starting'
      ],
      recommendations: [
        'Require executive sponsor alignment, clear success criteria, and post-POC path agreement before starting evaluations',
        'Create more prescriptive, compartmentalized POC approaches',
        'Focus on scalable, implementable solutions vs. impressive but impractical demos'
      ]
    },
    {
      category: 'Pre-sales/Post-sales Disconnect',
      description: 'CSM team "transitioning from support to driving adoption/implementation" but "professional services underutilized." Recent deals lacking clear post-signature plan.',
      source: 'Thomas (RVP West)',
      issues: [
        'Recent Intel deal—opportunity for clear post-signature plan',
        'Previous deals like Geisinger and Clorox were "wheelhouse use cases"—opportunity for guardrails on what scales in post-sales vs. custom builds',
        'Professional services—opportunity to increase utilization',
        'CSM team transitioning—opportunity to align with pre-sales'
      ],
      recommendations: [
        'Establish guardrails for what scales in post-sales vs. custom builds',
        'Create clear post-signature plans for all deals',
        'Better alignment between pre-sales and post-sales teams',
        'Utilize professional services more effectively'
      ]
    },
    {
      category: 'No Standardized Processes',
      description: '"No standardized handoff processes between AEs and SAs. Information exists but not accessible/followed by reps."',
      source: 'Garrett (RVP Central)',
      issues: [
        'Exit gates and tactics documented—opportunity to make them referenced and accessible',
        'Opportunity to build muscle memory for successful deal closure process',
        'Product-market fit volatility affects go-to-market and product roadmap',
        'Information exists—opportunity to make it accessible and followed by reps'
      ],
      recommendations: [
        'Create standardized handoff processes between AEs and SAs',
        'Make exit gates and tactics easily accessible and referenced',
        'Build muscle memory for successful deal closure process',
        'Develop systematic content sharing (weekly demo highlights by industry/vertical)'
      ]
    }
  ]);

  const [agentPositioning, setAgentPositioning] = useLocalStorage('leadershipPlaybook_agentPositioning', [
    {
      category: 'Internal Messaging Focus Areas',
      description: 'Opportunity to position Writer Agent as additional tool vs. replacement.',
      source: 'Haley (Strat AE)',
      issues: [
        'Opportunity to position as additional tool, not replacement',
        'Opportunity to highlight "interconnectivity between Writer tools"',
        'Opportunity to improve loading/performance during demos',
        'Opportunity for clear differentiation story vs. competitors'
      ],
      recommendations: [
        'Reposition Writer Agent as additional tool, not replacement',
        'Highlight interconnectivity between Writer tools',
        'Improve loading/performance during demos',
        'Develop clear differentiation story vs. competitors'
      ]
    }
  ]);

  const updateGapItem = (index, field, value) => {
    setCollaborationGaps(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const updateGapListItem = (index, listKey, itemIndex, value) => {
    setCollaborationGaps(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: item[listKey].map((listItem, idx) => idx === itemIndex ? value : listItem)
      } : item
    ));
  };

  const deleteGapListItem = (index, listKey, itemIndex) => {
    setCollaborationGaps(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: item[listKey].filter((_, idx) => idx !== itemIndex)
      } : item
    ));
  };

  const addGapListItem = (index, listKey) => {
    setCollaborationGaps(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: [...item[listKey], 'New item - click to edit']
      } : item
    ));
  };

  const addGapItem = () => {
    setCollaborationGaps(prev => [...prev, {
      category: 'New Category',
      description: 'New description',
      source: 'Source',
      issues: [],
      recommendations: []
    }]);
  };

  const deleteGapItem = (index) => {
    setCollaborationGaps(prev => prev.filter((_, i) => i !== index));
  };

  // Similar functions for salesProcessIssues and agentPositioning
  const updateSalesIssueItem = (index, field, value) => {
    setSalesProcessIssues(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const updateSalesIssueListItem = (index, listKey, itemIndex, value) => {
    setSalesProcessIssues(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: item[listKey].map((listItem, idx) => idx === itemIndex ? value : listItem)
      } : item
    ));
  };

  const deleteSalesIssueListItem = (index, listKey, itemIndex) => {
    setSalesProcessIssues(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: item[listKey].filter((_, idx) => idx !== itemIndex)
      } : item
    ));
  };

  const addSalesIssueListItem = (index, listKey) => {
    setSalesProcessIssues(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: [...item[listKey], 'New item - click to edit']
      } : item
    ));
  };

  const addSalesIssueItem = () => {
    setSalesProcessIssues(prev => [...prev, {
      category: 'New Category',
      description: 'New description',
      source: 'Source',
      issues: [],
      recommendations: []
    }]);
  };

  const deleteSalesIssueItem = (index) => {
    setSalesProcessIssues(prev => prev.filter((_, i) => i !== index));
  };

  const updateAgentItem = (index, field, value) => {
    setAgentPositioning(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const updateAgentListItem = (index, listKey, itemIndex, value) => {
    setAgentPositioning(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: item[listKey].map((listItem, idx) => idx === itemIndex ? value : listItem)
      } : item
    ));
  };

  const deleteAgentListItem = (index, listKey, itemIndex) => {
    setAgentPositioning(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: item[listKey].filter((_, idx) => idx !== itemIndex)
      } : item
    ));
  };

  const addAgentListItem = (index, listKey) => {
    setAgentPositioning(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        [listKey]: [...item[listKey], 'New item - click to edit']
      } : item
    ));
  };

  return (
    <div>
      {/* SA/AE Collaboration Gaps — dropdown category */}
      <Card style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.accent}` }}>
        <button
          type="button"
          onClick={() => toggleCategory('collaboration')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '24px', fontWeight: '600', color: colors.text, margin: 0 }}>SA/AE Collaboration Gaps</h3>
            {!isCategoryExpanded('collaboration') && collaborationSummary && (
              <p style={{ fontSize: '14px', color: colors.textSecondary, marginTop: '10px', marginBottom: 0, lineHeight: 1.5 }}>
                {collaborationSummary}
              </p>
            )}
          </div>
          <span style={{ fontSize: '14px', color: colors.textMuted, flexShrink: 0 }}>{isCategoryExpanded('collaboration') ? '▲' : '▼'}</span>
        </button>
        {isEditMode && (
          <div style={{ marginTop: '12px' }}>
            <button
              onClick={addGapItem}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              + Add Category
            </button>
          </div>
        )}
        {isCategoryExpanded('collaboration') && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.borderLight}` }}>
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: colors.gray50, borderRadius: '8px', border: `1px solid ${colors.borderLight}` }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary of sentiment</div>
              <EditableText
                value={collaborationSummary}
                onChange={setCollaborationSummary}
                style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: 1.6 }}
                multiline
              />
            </div>
            {collaborationGaps.map((gap, index) => (
              <Card key={index} style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.accent}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <EditableText
                      value={gap.category}
                      onChange={(v) => updateGapItem(index, 'category', v)}
                      style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}
                    />
                    <EditableText
                      value={gap.description}
                      onChange={(v) => updateGapItem(index, 'description', v)}
                      style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '8px' }}
                      multiline
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: colors.textMuted }}>Source:</span>
                      <EditableText
                        value={gap.source}
                        onChange={(v) => updateGapItem(index, 'source', v)}
                        style={{ fontSize: '12px', color: colors.textMuted, fontStyle: 'italic' }}
                      />
                    </div>
                  </div>
                  {isEditMode && (
                    <button
                      onClick={() => deleteGapItem(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.danger,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        fontSize: '16px'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '12px' }}>Opportunities</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {gap.issues.map((item, i) => (
                        <EditableListItem
                          key={i}
                          value={item}
                          onChange={(v) => updateGapListItem(index, 'issues', i, v)}
                          onDelete={() => deleteGapListItem(index, 'issues', i)}
                          color={colors.danger}
                        />
                      ))}
                    </div>
                    <AddItemButton onClick={() => addGapListItem(index, 'issues')} label="Add opportunity" />
                  </div>
                  <div>
                    <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.success, marginBottom: '12px' }}>Recommendations</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {gap.recommendations.map((item, i) => (
                        <EditableListItem
                          key={i}
                          value={item}
                          onChange={(v) => updateGapListItem(index, 'recommendations', i, v)}
                          onDelete={() => deleteGapListItem(index, 'recommendations', i)}
                          color={colors.success}
                        />
                      ))}
                    </div>
                    <AddItemButton onClick={() => addGapListItem(index, 'recommendations')} label="Add recommendation" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Sales Process Opportunities — dropdown category */}
      <Card style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.warning}` }}>
        <button
          type="button"
          onClick={() => toggleCategory('sales')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '24px', fontWeight: '600', color: colors.text, margin: 0 }}>Sales Process Opportunities</h3>
            {!isCategoryExpanded('sales') && salesProcessSummary && (
              <p style={{ fontSize: '14px', color: colors.textSecondary, marginTop: '10px', marginBottom: 0, lineHeight: 1.5 }}>
                {salesProcessSummary}
              </p>
            )}
          </div>
          <span style={{ fontSize: '14px', color: colors.textMuted, flexShrink: 0 }}>{isCategoryExpanded('sales') ? '▲' : '▼'}</span>
        </button>
        {isEditMode && (
          <div style={{ marginTop: '12px' }}>
            <button
              onClick={addSalesIssueItem}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              + Add Category
            </button>
          </div>
        )}
        {isCategoryExpanded('sales') && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.borderLight}` }}>
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: colors.gray50, borderRadius: '8px', border: `1px solid ${colors.borderLight}` }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary of sentiment</div>
              <EditableText
                value={salesProcessSummary}
                onChange={setSalesProcessSummary}
                style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: 1.6 }}
                multiline
              />
            </div>
            {salesProcessIssues.map((issue, index) => (
              <Card key={index} style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.warning}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <EditableText
                      value={issue.category}
                      onChange={(v) => updateSalesIssueItem(index, 'category', v)}
                      style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}
                    />
                    <EditableText
                      value={issue.description}
                      onChange={(v) => updateSalesIssueItem(index, 'description', v)}
                      style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '8px' }}
                      multiline
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: colors.textMuted }}>Source:</span>
                      <EditableText
                        value={issue.source}
                        onChange={(v) => updateSalesIssueItem(index, 'source', v)}
                        style={{ fontSize: '12px', color: colors.textMuted, fontStyle: 'italic' }}
                      />
                    </div>
                  </div>
                  {isEditMode && (
                    <button
                      onClick={() => deleteSalesIssueItem(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.danger,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        fontSize: '16px'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '12px' }}>Opportunities</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {issue.issues.map((item, i) => (
                        <EditableListItem
                          key={i}
                          value={item}
                          onChange={(v) => updateSalesIssueListItem(index, 'issues', i, v)}
                          onDelete={() => deleteSalesIssueListItem(index, 'issues', i)}
                          color={colors.danger}
                        />
                      ))}
                    </div>
                    <AddItemButton onClick={() => addSalesIssueListItem(index, 'issues')} label="Add opportunity" />
                  </div>
                  <div>
                    <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.success, marginBottom: '12px' }}>Recommendations</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {issue.recommendations.map((item, i) => (
                        <EditableListItem
                          key={i}
                          value={item}
                          onChange={(v) => updateSalesIssueListItem(index, 'recommendations', i, v)}
                          onDelete={() => deleteSalesIssueListItem(index, 'recommendations', i)}
                          color={colors.success}
                        />
                      ))}
                    </div>
                    <AddItemButton onClick={() => addSalesIssueListItem(index, 'recommendations')} label="Add recommendation" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Writer Agent Positioning Challenges — dropdown category */}
      <Card style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.purple}` }}>
        <button
          type="button"
          onClick={() => toggleCategory('agent')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '24px', fontWeight: '600', color: colors.text, margin: 0 }}>Writer Agent Positioning Challenges</h3>
            {!isCategoryExpanded('agent') && agentPositioningSummary && (
              <p style={{ fontSize: '14px', color: colors.textSecondary, marginTop: '10px', marginBottom: 0, lineHeight: 1.5 }}>
                {agentPositioningSummary}
              </p>
            )}
          </div>
          <span style={{ fontSize: '14px', color: colors.textMuted, flexShrink: 0 }}>{isCategoryExpanded('agent') ? '▲' : '▼'}</span>
        </button>
        {isCategoryExpanded('agent') && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.borderLight}` }}>
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: colors.gray50, borderRadius: '8px', border: `1px solid ${colors.borderLight}` }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary of sentiment</div>
              <EditableText
                value={agentPositioningSummary}
                onChange={setAgentPositioningSummary}
                style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: 1.6 }}
                multiline
              />
            </div>
            {agentPositioning.map((item, index) => (
              <Card key={index} style={{ marginBottom: '24px', borderLeft: `4px solid ${colors.purple}` }}>
                <div style={{ marginBottom: '16px' }}>
                  <EditableText
                    value={item.category}
                    onChange={(v) => updateAgentItem(index, 'category', v)}
                    style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}
                  />
                  <EditableText
                    value={item.description}
                    onChange={(v) => updateAgentItem(index, 'description', v)}
                    style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '8px' }}
                    multiline
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: colors.textMuted }}>Source:</span>
                    <EditableText
                      value={item.source}
                      onChange={(v) => updateAgentItem(index, 'source', v)}
                      style={{ fontSize: '12px', color: colors.textMuted, fontStyle: 'italic' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '12px' }}>Opportunities</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {item.issues.map((issueItem, i) => (
                        <EditableListItem
                          key={i}
                          value={issueItem}
                          onChange={(v) => updateAgentListItem(index, 'issues', i, v)}
                          onDelete={() => deleteAgentListItem(index, 'issues', i)}
                          color={colors.danger}
                        />
                      ))}
                    </div>
                    <AddItemButton onClick={() => addAgentListItem(index, 'issues')} label="Add opportunity" />
                  </div>
                  <div>
                    <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.success, marginBottom: '12px' }}>Recommendations</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {item.recommendations.map((recItem, i) => (
                        <EditableListItem
                          key={i}
                          value={recItem}
                          onChange={(v) => updateAgentListItem(index, 'recommendations', i, v)}
                          onDelete={() => deleteAgentListItem(index, 'recommendations', i)}
                          color={colors.success}
                        />
                      ))}
                    </div>
                    <AddItemButton onClick={() => addAgentListItem(index, 'recommendations')} label="Add recommendation" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// Team Anecdotes Section
const TeamAnecdotesSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [filter, setFilter] = useState('all');
  const [expandedCards, setExpandedCards] = useState(new Set());
  const containerRef = useRef(null);
  const [columnCount, setColumnCount] = useState(3);

  const anecdotes = [
    {
      id: 1,
      date: '2025-05-27',
      sender: 'Ho Joon Cha',
      content: 'Shoutout to @thai for all of the things that he takes ownership of on the SA team. He\'s the go-to Partner SA, supports our APJ region, and does this all with a full plate of US-based deals. He took a 3am call this morning to talk through our Adobe partnership due to his expertise on the integration. We\'re so lucky to have you!!',
      reactions: { clap: 15, heart: 8 },
      category: 'leadership',
      highlight: 'Ownership & Dedication'
    },
    {
      id: 2,
      date: '2024-12-13',
      sender: 'Kait Groezinger',
      content: 'SHOUTOUT to @thai and @miller for a really important call today with Ally Bank. After a loooong uphill battle to gain approval with their risk team, we totally nailed a last-minute meeting with risk partner Carlos. Verbal approval for Ally to use our Creative model (and likely 004!). This is BIG - unlocks key use cases and sets us apart in their risk teams eyes where skepticism around AI runs high. Ally\'s risk team said "Writer is the best" and credited our approach for "making their jobs easier." Miller and Thai, you didn\'t just earn trust...you laid the foundation for a deeper partnership with Ally.',
      reactions: { clap: 43, heart: 27, think: 7 },
      category: 'client-success',
      highlight: 'Risk Team Approval & Trust Building'
    },
    {
      id: 3,
      date: '2024-11-19',
      sender: 'Mark Wilkinson',
      content: 'Huge shoutout to @thai and @Chris Wheeler for jumping in late this evening to support a Content Supply Chain blueprint that PwC was scheduled to present to 20+ Conagra executives tomorrow morning at 9am. They resolved multiple agents that needed attention due to some LLM considerations. They both put their heads together and got it done. Thank you both so much - love seeing our SA team in action 🙌',
      reactions: { clap: 12, fire: 8 },
      category: 'problem-solving',
      highlight: 'Critical Issue Resolution'
    },
    {
      id: 4,
      date: '2024-10-14',
      sender: 'Danielle Baeza',
      content: 'Shouting out @thai for spending time with me today (and a couple times before) to help me build no-code apps in AI Studio and show off incredible, relevant examples - I feel ready and eager to share the knowledge w/ our People & Talent team this week at our offsite! You da best Thai!',
      reactions: { heart: 15, fire: 14 },
      category: 'mentorship',
      highlight: 'Enablement & Knowledge Sharing'
    },
    {
      id: 5,
      date: '2024-09-25',
      sender: 'Ted Brookes',
      content: 'Just want to give a huge shoutout to @thai for his work on Capital Group. He\'s been amazing to work with through a demanding POC period. Not only are we supporting the customer with trainings, product, and technical deep dives, but he\'s doing the same with KPMG who are embedded deeply with the customer. 🤠',
      reactions: { clap: 28, beer: 15 },
      category: 'client-success',
      highlight: 'POC Excellence & Partner Support'
    },
    {
      id: 6,
      date: '2024-09-19',
      sender: 'Garrett Schmenk',
      content: 'Shoutout to @thai for waking up at 5a PT to enable some ACN Ops folks on AI Studio / Framework. I also really liked the way he quickly and effectively walked thru the front end for business users, answered a lot of really good questions, etc. This is a good gong to check out (just ignore us as half asleep)! @thai you da truth!',
      reactions: { fire: 25, mindblown: 9 },
      category: 'enablement',
      highlight: 'Early Morning Enablement'
    },
    {
      id: 7,
      date: '2024-09-19',
      sender: 'Darragh Fitzpatrick',
      content: 'It\'s a busy week for @thai as he also deserves a big shout out for his patience and partnership in working with ACN to get a pitch in front of Volvo. He\'s gone over and above to try get the demo to a point the team is happy with. Thank you',
      reactions: { heart: 5 },
      category: 'client-success',
      highlight: 'Patience & Partnership'
    },
    {
      id: 8,
      date: '2024-08-22',
      sender: 'Diego Lomanto',
      content: 'Special shoutout to @thai for running the demos and awesome Q&A.',
      reactions: { clap: 8 },
      category: 'enablement',
      highlight: 'Webinar Excellence'
    },
    {
      id: 9,
      date: '2024-08-19',
      sender: 'Sunny Patel',
      content: 'Shoutout to @thai! Thai has been the SA on complex deals and has been crushing it. Most recently, we had a full day onsite with the Founder/CEO/CTO/CPO of Vanilla (very complex estate planning solution). Thai had very little to work off of, came into the meeting with a custom app built, and ran the entire day like a boss. True example of someone that cares not only about his success, but mine and the overall business. Absolute pleasure to collab/work with. I owe you big time bud 🙌',
      reactions: { clap: 12 },
      category: 'client-success',
      highlight: 'Complex Deal Execution'
    },
    {
      id: 10,
      date: '2024-05-13',
      sender: 'Garrett Schmenk',
      content: 'Neeeeed to give a shoutout to some freakin\' badass CS/implementation teams working on big (and by big I mean #5, #6 and #55 on Fortune500), hairy accounts that have A LOT of moving pieces and a lot of requirements... and lets be honest, are just damn needy. @thai thanks for all your help building out apps for IR team and media, and @Yaseen as of late. We are meeting with their PWM and asset management executives on Thurs. ELA is on the horizon!',
      reactions: { fire: 18 },
      category: 'client-success',
      highlight: 'Fortune 500 Account Support'
    },
    {
      id: 11,
      date: '2024-05-01',
      sender: 'Jillian Freidus',
      content: 'Amazing @Harry Liu excited to learn more. And I imagine @thai has been an awesome coach.',
      reactions: { heart: 1 },
      category: 'mentorship',
      highlight: 'Coaching Recognition'
    },
    {
      id: 12,
      date: '2024-04-28',
      sender: 'Nick Opderbeck',
      content: 'Big shoutout to @Paul Giudice and @Tom Pokorney for leading a packed NVIDIA crew for their Digital Marketing offsite. Over 50 people in person and 100+ online. @thai guest appearance resulted in some great discussion. NVIDIA crew was engaged the entire time and will even be demonstrating some Writer-built apps during their internal hackathon. These guys are primed for big expansion this year.',
      reactions: { clap: 10 },
      category: 'enablement',
      highlight: 'Large-Scale Enablement'
    },
    {
      id: 13,
      date: '2024-04-08',
      sender: 'Lauren Gil',
      content: 'wanted to give a HUGE shoutout to the incredible duo @Ugo @thai for all their hard work on our agentic launch this Thursday. They\'ve been hustling on our launch demos (beyond normal day-to-day work) and when I asked them for their help, they probably had *no idea* what they were *really* signing up for 😄 all of their work will be critical in showing the world that we have *real* agents for mission critical use cases! here\'s a peek behind the scenes! 🎬',
      reactions: { clap: 15 },
      category: 'product',
      highlight: 'Product Launch Support'
    },
    {
      id: 14,
      date: '2024-03-14',
      sender: 'Jillian Freidus',
      content: 'When Uber told us they were moving forward with us for the expansion opportunity (vs the alternative solutions they were exploring), the first reason they stated was their desire for a true *partner* as they navigate their genAI journey, and the Writer team demonstrated that throughout the evaluation process. @thai was at the center of this, working closely with Uber (and ACN on top of it) to iterate, actively listen to Uber to understand their objectives and concerns that needed to be addressed, and showing them the art of the possible to help expand their thinking. He was one with their team and they felt it! Way to go.',
      reactions: { pray: 1 },
      category: 'client-success',
      highlight: 'True Partnership & Expansion'
    },
    {
      id: 15,
      date: '2024-03-14',
      sender: 'Jillian Freidus',
      content: 'Shoutout to **@thai** who\'s quickly become invaluable to the partner sales convos/process and (in the team\'s words) is an excellent seller to top it off 😉. We\'re grateful to be working with you, **@thai**.',
      reactions: { fire: 30, w: 16 },
      category: 'sales',
      highlight: 'Partner Sales Excellence'
    },
    {
      id: 16,
      date: '2024-02-01',
      sender: 'Kevin Wei',
      content: 'Shout out to @thai who is on his 9th (single digits???) day as a Solutions Architect. In this short time, Thai has built + demoed 8 custom apps to both Uber and Goldman Sachs today. All unique use cases: canned replies for Uber support agents, GS media summaries, etc. Well received with rave reviews. The speed at which he\'s onboarded and executed is absolutely incredible. Already had a massive impact on some of our most important deals. So happy to have you join the team and excited for what you\'ll do next. P.S. i don\'t think any of these apps were hardcoded either 😉',
      reactions: { fire: 20, clap: 15 },
      category: 'onboarding',
      highlight: 'Rapid Onboarding & Impact'
    },
    {
      id: 17,
      date: '2025-01-27',
      sender: 'Cameron Becker',
      content: 'Thank you for all the hard work over the past 2 weeks in preparation for the meeting with Aman this morning. The feedback from the meeting was overwhelmingly positive. @thai, @Anant, @Kevin, @Yusuf, and @Andy Wong did an incredible job iterating on the custom apps (architected by the incomparable @DZY). Aman appreciated how deeply we understood the State Street business drivers and customized a solution to "fill the gap."',
      reactions: { clap: 12 },
      category: 'client-success',
      highlight: 'Custom Solution Development'
    },
    {
      id: 18,
      date: '2025-09-25',
      sender: 'Maureen Little',
      content: 'Massive shoutout to our brand new Partner Enablement team for building and delivering our first ever Technical Enablement program to Perficient. None of this would be possible without all of the sharing of content and support from our CSM team, our SAs (@thai @Steve Hwang @Kevin and more) and the amazing CAs that are helping in the sessions and with content 💪',
      reactions: { clap: 25, heart: 15 },
      category: 'enablement',
      highlight: 'Partner Enablement Program'
    }
  ];

  const categories = [
    { id: 'all', label: 'All Feedback', icon: '💬' },
    { id: 'leadership', label: 'Leadership', icon: '👔' },
    { id: 'client-success', label: 'Client Success', icon: '🎯' },
    { id: 'mentorship', label: 'Mentorship', icon: '🤝' },
    { id: 'enablement', label: 'Enablement', icon: '📚' },
    { id: 'problem-solving', label: 'Problem Solving', icon: '🔧' },
    { id: 'sales', label: 'Sales', icon: '💼' },
    { id: 'product', label: 'Product', icon: '🚀' },
    { id: 'onboarding', label: 'Onboarding', icon: '🌟' }
  ];

  const filteredAnecdotes = anecdotes.filter(anecdote => {
    return filter === 'all' || anecdote.category === filter;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getCategoryColor = (category) => {
    const colorMap = {
      'leadership': colors.accent,
      'client-success': colors.success,
      'mentorship': colors.purple,
      'enablement': colors.info,
      'problem-solving': colors.warning,
      'sales': colors.orange,
      'product': colors.pink,
      'onboarding': colors.success
    };
    return colorMap[category] || colors.textMuted;
  };

  const totalReactions = (reactions) => {
    return Object.values(reactions).reduce((sum, count) => sum + count, 0);
  };

  const toggleCard = (cardId) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const isLongContent = (content) => {
    return content.length > 300;
  };

  // Calculate column count based on container width
  useEffect(() => {
    const updateColumnCount = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        if (width >= 1200) setColumnCount(4);
        else if (width >= 900) setColumnCount(3);
        else if (width >= 600) setColumnCount(2);
        else setColumnCount(1);
      }
    };
    
    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);


  return (
    <div>
      {/* Category Filters */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${filter === cat.id ? getCategoryColor(cat.id === 'all' ? 'leadership' : cat.id) : colors.border}`,
                backgroundColor: filter === cat.id ? getCategoryColor(cat.id === 'all' ? 'leadership' : cat.id) + '15' : 'white',
                color: filter === cat.id ? getCategoryColor(cat.id === 'all' ? 'leadership' : cat.id) : colors.text,
                fontSize: '13px',
                fontWeight: filter === cat.id ? '600' : '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                boxShadow: filter === cat.id ? '0 2px 4px rgba(0, 0, 0, 0.08)' : 'none'
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              {filter === cat.id && cat.id !== 'all' && (
                <span style={{ 
                  fontSize: '11px', 
                  backgroundColor: getCategoryColor(cat.id) + '20',
                  color: getCategoryColor(cat.id),
                  padding: '2px 6px',
                  borderRadius: '10px',
                  marginLeft: '4px',
                  fontWeight: '600'
                }}>
                  {anecdotes.filter(a => a.category === cat.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* True Masonry Layout */}
      <div 
        ref={containerRef}
        style={{ 
          marginBottom: '32px',
          position: 'relative',
          minHeight: '400px'
        }}
      >
        {filteredAnecdotes.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
            <p style={{ fontSize: '16px', color: colors.textMuted }}>No feedback found in this category.</p>
          </Card>
        ) : (
          <MasonryItems 
            items={filteredAnecdotes}
            columnCount={columnCount}
            gap={24}
            expandedCards={expandedCards}
            toggleCard={toggleCard}
            getCategoryColor={getCategoryColor}
            formatDate={formatDate}
            isLongContent={isLongContent}
          />
        )}
      </div>
    </div>
  );
};

// Navigation
const Navigation = ({ activeSection, setActiveSection, sections, setSections }) => {
  const { isEditMode } = useContext(EditModeContext);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.target.style.opacity = '0.5';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const newSections = [...sections];
    const draggedSection = newSections[draggedIndex];
    newSections.splice(draggedIndex, 1);
    newSections.splice(dropIndex, 0, draggedSection);
    setSections(newSections);
    setDraggedIndex(null);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <nav style={{ 
      position: 'sticky', 
      top: 0, 
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderBottom: `1px solid ${colors.border}`, 
      zIndex: 100, 
      width: '100%',
      overflow: 'hidden',
      boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        width: '100%',
        margin: '0 auto',
        padding: '0 32px',
        boxSizing: 'border-box'
      }}>
        <div style={{ 
          display: 'flex', 
          gap: '4px', 
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
          WebkitOverflowScrolling: 'touch'
        }}>
          <style>{`
            nav div div::-webkit-scrollbar {
              display: none; /* Chrome, Safari, Opera */
            }
          `}</style>
          {sections.map((s, index) => (
            <div 
              key={s.id} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px', 
                position: 'relative',
                opacity: draggedIndex === index ? 0.5 : 1,
                transform: dragOverIndex === index && draggedIndex !== index ? 'translateX(4px)' : 'translateX(0)',
                transition: 'all 0.2s ease'
              }}
              draggable={isEditMode}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {isEditMode && (
                <div 
                  style={{ 
                    width: '6px',
                    height: '24px',
                    backgroundColor: draggedIndex === index ? colors.accent : colors.border,
                    borderRadius: '3px',
                    cursor: 'grab',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  title="Drag to reorder"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div style={{
                    width: '2px',
                    height: '12px',
                    backgroundColor: draggedIndex === index ? 'white' : colors.textMuted,
                    borderRadius: '1px',
                    opacity: 0.6
                  }} />
                </div>
              )}
              <button
                onClick={() => !isEditMode && setActiveSection(s.id)}
                style={{
                  padding: '16px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  borderBottom: activeSection === s.id ? `2px solid ${colors.accent}` : '2px solid transparent',
                  marginBottom: '-1px',
                  fontSize: '14px',
                  fontWeight: activeSection === s.id ? '600' : '400',
                  color: activeSection === s.id ? colors.text : colors.textMuted,
                  cursor: isEditMode ? 'grab' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                  letterSpacing: '-0.01em',
                  borderLeft: dragOverIndex === index && draggedIndex !== index ? `2px solid ${colors.accent}` : 'none',
                  paddingLeft: dragOverIndex === index && draggedIndex !== index ? '14px' : '16px'
                }}
              >
                <EditableText
                  value={s.label}
                  onChange={(v) => {
                    const newSections = [...sections];
                    newSections[index].label = v;
                    setSections(newSections);
                  }}
                  style={{
                    fontSize: '14px',
                    fontWeight: activeSection === s.id ? '600' : '400',
                    color: activeSection === s.id ? colors.text : colors.textMuted
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
};

// Mode Toggle Component
const ModeToggle = ({ isEditMode, setIsEditMode }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: isHovered ? '8px 16px' : '8px 12px',
        backgroundColor: isHovered ? 'white' : 'rgba(255,255,255,0.9)',
        borderRadius: '12px',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.1)',
        border: `1px solid ${isHovered ? colors.border : colors.border}`,
        transition: 'all 0.3s ease',
        opacity: isHovered ? 1 : 0.5,
        transform: isHovered ? 'scale(1)' : 'scale(0.9)',
      }}>
      {isHovered && (
        <span style={{ 
          fontSize: '12px', 
          fontWeight: '500',
          color: !isEditMode ? colors.text : colors.textMuted 
        }}>
          {isEditMode ? 'Edit' : 'View'}
        </span>
      )}
      <button
        onClick={() => setIsEditMode(!isEditMode)}
        style={{
          position: 'relative',
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          border: 'none',
          backgroundColor: isEditMode ? colors.accent : colors.border,
          cursor: 'pointer',
          transition: 'all 0.3s',
          padding: 0,
        }}
      >
        <div style={{
          position: 'absolute',
          top: '2px',
          left: isEditMode ? '18px' : '2px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: 'white',
          transition: 'all 0.3s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
      {isHovered && (
        <span style={{ 
          fontSize: '11px', 
          color: colors.textMuted 
        }}>
          {isEditMode ? '✏️' : '👁️'}
        </span>
      )}
    </div>
  );
};

// Edit Mode Banner
const EditModeBanner = ({ isEditMode }) => {
  if (!isEditMode) return null;
  
  return (
    <div style={{
      backgroundColor: colors.accent,
      color: 'white',
      padding: '12px 32px',
      fontSize: '13px',
      fontWeight: '500',
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      position: 'sticky',
      top: 0,
      zIndex: 101,
      borderBottom: `1px solid ${colors.accent}30`
    }}>
      ✏️ Edit Mode Active — Click any text with a dashed underline to edit. Changes are saved automatically.
    </div>
  );
};

// Main App
export default function App() {
  const [activeSection, setActiveSection] = useState('overview');
  const [isEditMode, setIsEditMode] = useState(false);
  const [detailViewSections, setDetailViewSections] = useState({
    overview: false,
    leadership: false,
    hiring: false,
    gtm: false,
    operating: false,
    first30: false,
    field: false,
    anecdotes: false
  });
  const [sections, setSections] = useLocalStorage('leadershipPlaybook_sections', [
    { id: 'overview', label: 'Overview', title: 'Overview', subtitle: '' },
    { id: 'leadership', label: 'Leadership Principles', title: 'Leadership Principles', subtitle: 'My leadership philosophy and how it shows up day to day' },
    { id: 'field', label: 'From the Field', title: 'From the Field', subtitle: 'What we\'re hearing as working or not working in sales engagements and SA/AE partnerships' },
    { id: 'gtm', label: 'GTM & Impact', title: 'GTM & Impact Model', subtitle: 'How SAs drive impact pre- and post-sale, and adapt to strategy shifts' },
    { id: 'first30', label: '30-60-90', title: '30-60-90', subtitle: 'First 30 days: actions & plans; Days 31-60: scale & refine; Days 61-90: broaden & embed' },
    { id: 'hiring', label: 'Hiring & Team Design', title: 'Hiring & Team Design', subtitle: 'The SA profile, balancing act, internal vs external hiring, and maintaining culture' },
    { id: 'operating', label: 'Operating & Coaching', title: 'Operating & Coaching Model', subtitle: 'Key metrics, team cadences, and how I uplevel SAs' },
    { id: 'anecdotes', label: 'Team Anecdotes', title: 'Team Anecdotes', subtitle: 'Feedback and recognition from colleagues at Writer' },
  ]);

  // Editable content state for Overview (condensed, direct)
  const defaultOverviewContent = {
    subtitle: 'West Coast SA Manager | Leadership Panel',
    title: 'My Leadership Playbook',
    description: 'High-performing West Coast SA team at Writer.',
    context: [
      'Backfill + headcount clarity for West Strat; maintain 3:1 AE:SA ratio.',
      'Product Vision Changes: Agent Builder sunset; enable team on Writer Agent and platform changes.',
      'Solutions Architecture scaffolding; reduce silos, create consistency.',
      'Writer Agent = New POC Playbook and figuring out what scales and lands'
    ],
    strategicBets: [
      'Pods over round-robin: consistent SA/AE pairings, deeper account knowledge.',
      'Process before scale: handoffs, POC templates, exit gates so information is accessible.',
      'Coaching as infrastructure: onboarding, post-mortems, shadow programs—repeatable excellence.',
      'Leading metrics: dashboard to validate before scaling.'
    ],
    strategicPriorities: [
      'SAs as strategic partners: ROI storytelling, seat at the table in deal strategy and pipeline.',
      'Consistent SA/AE pairings; early engagement, inclusion in forecast and account planning.',
      'Technical voice of the deal: clear handoffs, shared exit criteria, joint ownership of validation.',
      'Writer Agent: complement, not replacement; SAs lead technical narrative.',
      'Guardrails for post-sales vs. custom builds; SAs focus on high-leverage work.'
    ],
    saLeadershipLens: DEFAULT_SA_LEADERSHIP_LENS
  };

  const [overviewContent, setOverviewContent] = useLocalStorage('leadershipPlaybook_overviewContent', defaultOverviewContent);

  const updateOverviewContent = useCallback((key, value) => {
    setOverviewContent(prev => ({ ...prev, [key]: value }));
  }, [setOverviewContent]);

  const updateOverviewListItem = useCallback((listKey, index, value) => {
    setOverviewContent(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((item, i) => i === index ? value : item)
    }));
  }, [setOverviewContent]);

  const deleteOverviewListItem = useCallback((listKey, index) => {
    setOverviewContent(prev => {
      const updated = {
        ...prev,
        [listKey]: prev[listKey].filter((_, i) => i !== index)
      };
      saveToStorage('leadershipPlaybook_overviewContent', updated);
      return updated;
    });
  }, [setOverviewContent]);

  const addOverviewListItem = useCallback((listKey) => {
    setOverviewContent(prev => ({
      ...prev,
      [listKey]: [...prev[listKey], 'New item - click to edit']
    }));
  }, [setOverviewContent]);

  return (
    <EditModeContext.Provider value={{ isEditMode }}>
      <div style={{ 
        backgroundColor: '#ffffff', 
        minHeight: '100vh', 
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        width: '100%',
        overflowX: 'hidden',
        position: 'relative'
      }}>
        <EditModeBanner isEditMode={isEditMode} />
        <Navigation activeSection={activeSection} setActiveSection={setActiveSection} sections={sections} setSections={setSections} />
        
        <main style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '40px 32px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          
          {sections.map((section, sectionIndex) => {
            if (section.id !== activeSection) return null;
            
            const sectionNumber = String(sectionIndex + 1).padStart(2, '0');
            
            if (section.id === 'overview') {
              return (
                <div key={section.id}>
                  {/* Hero Section */}
                  <div style={{ marginBottom: '32px' }}>
                <p style={{ 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  color: colors.accent, 
                  marginBottom: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <EditableText 
                    value={overviewContent.subtitle}
                    onChange={(v) => updateOverviewContent('subtitle', v)}
                    style={{ fontSize: '12px', fontWeight: '600', color: colors.accent, textTransform: 'uppercase', letterSpacing: '2px' }}
                  />
                </p>
                <h1 style={{ 
                  fontSize: '56px', 
                  fontWeight: '700', 
                  color: colors.text, 
                  marginBottom: '12px', 
                  letterSpacing: '-0.02em', 
                  lineHeight: '1.1',
                  fontFamily: "'Inter', sans-serif"
                }}>
                  <EditableText 
                    value={overviewContent.title}
                    onChange={(v) => updateOverviewContent('title', v)}
                    style={{ fontSize: '48px', fontWeight: '700', color: colors.text }}
                  />
                </h1>
                <p style={{ fontSize: '20px', color: colors.textSecondary, lineHeight: '1.7', marginBottom: '24px', fontWeight: '400' }}>
                  <EditableText 
                    value={overviewContent.description}
                    onChange={(v) => updateOverviewContent('description', v)}
                    style={{ fontSize: '18px', color: colors.textSecondary }}
                    multiline
                  />
                </p>
              </div>

              {/* Current State, Strategic Bets, Upleveling SAs — main overview components */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                {/* Current State */}
                <div style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: `2px solid ${colors.info}30`,
                  backgroundColor: colors.bg,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '280px'
                }}>
                  <div style={{
                    padding: '20px 24px',
                    background: `linear-gradient(135deg, ${colors.info}18 0%, ${colors.info}08 100%)`,
                    borderBottom: `3px solid ${colors.info}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: colors.info,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      boxShadow: `0 4px 12px ${colors.info}40`
                    }}>
                      📋
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: colors.info, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px' }}>Where we are</div>
                      <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: colors.text, letterSpacing: '-0.02em' }}>Current State</h3>
                    </div>
                  </div>
                  <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(overviewContent.context || []).map((p, i) => (
                      <EditableListItem
                        key={i}
                        value={p}
                        onChange={(v) => updateOverviewListItem('context', i, v)}
                        onDelete={() => deleteOverviewListItem('context', i)}
                        color={colors.info}
                      />
                    ))}
                    <AddItemButton onClick={() => addOverviewListItem('context')} label="Add item" />
                  </div>
                </div>

                {/* Upleveling SAs */}
                <div style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: `2px solid ${colors.accent}30`,
                  backgroundColor: colors.bg,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '280px'
                }}>
                  <div style={{
                    padding: '20px 24px',
                    background: `linear-gradient(135deg, ${colors.accent}18 0%, ${colors.accent}08 100%)`,
                    borderBottom: `3px solid ${colors.accent}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: colors.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      boxShadow: `0 4px 12px ${colors.accent}40`
                    }}>
                      🧭
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: colors.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px' }}>Where we're focused</div>
                      <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: colors.text, letterSpacing: '-0.02em' }}>Upleveling SAs</h3>
                    </div>
                  </div>
                  <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(overviewContent.strategicPriorities || []).map((p, i) => (
                      <EditableListItem
                        key={i}
                        value={p}
                        onChange={(v) => updateOverviewListItem('strategicPriorities', i, v)}
                        onDelete={() => deleteOverviewListItem('strategicPriorities', i)}
                        color={colors.accent}
                      />
                    ))}
                    <AddItemButton onClick={() => addOverviewListItem('strategicPriorities')} label="Add item" />
                  </div>
                </div>

                {/* Strategic Bets */}
                <div style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: `2px solid ${colors.success}30`,
                  backgroundColor: colors.bg,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '280px'
                }}>
                  <div style={{
                    padding: '20px 24px',
                    background: `linear-gradient(135deg, ${colors.success}18 0%, ${colors.success}08 100%)`,
                    borderBottom: `3px solid ${colors.success}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: colors.success,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      boxShadow: `0 4px 12px ${colors.success}40`
                    }}>
                      🎯
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: colors.success, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px' }}>Where we're betting</div>
                      <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: colors.text, letterSpacing: '-0.02em' }}>Strategic Bets</h3>
                    </div>
                  </div>
                  <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(overviewContent.strategicBets || []).map((p, i) => (
                      <EditableListItem
                        key={i}
                        value={p}
                        onChange={(v) => updateOverviewListItem('strategicBets', i, v)}
                        onDelete={() => deleteOverviewListItem('strategicBets', i)}
                        color={colors.success}
                      />
                    ))}
                    <AddItemButton onClick={() => addOverviewListItem('strategicBets')} label="Add strategic bet" />
                  </div>
                </div>
              </div>

              {/* SA Leadership Lens: Stronger West SA Strat Team → Identify, Action, Scale, Share */}
              <Card style={{ marginTop: '24px', borderLeft: `4px solid ${colors.purple}`, backgroundColor: colors.purple + '06', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${colors.purple}30 0%, ${colors.purple}15 100%)`,
                    border: `1px solid ${colors.purple}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    boxShadow: `0 2px 8px ${colors.purple}20`
                  }}>
                    🔬
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: colors.text, letterSpacing: '-0.02em' }}>From experience to SA Leadership</h3>
                </div>
                <div style={{
                  marginBottom: '16px',
                  padding: '20px 24px',
                  borderRadius: '16px',
                  border: `2px solid ${colors.purple}35`,
                  background: `linear-gradient(145deg, ${colors.purple}14 0%, ${colors.purple}08 100%)`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  boxShadow: `0 4px 16px ${colors.purple}12`
                }}>
                  <p style={{ fontSize: '11px', fontWeight: '800', color: colors.purple, margin: 0, marginBottom: '16px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Stronger West SA Strat Team</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr', width: '100%', maxWidth: '600px', margin: '0 auto', gap: '8px', alignItems: 'stretch' }}>
                    {SA_LEADERSHIP_FRAMEWORK.flatMap((pillar, i) => [
                      <div
                        key={`pillar-${i}`}
                        style={{
                          padding: '18px 16px',
                          borderRadius: '12px',
                          border: `2px solid ${colors.purple}45`,
                          background: `linear-gradient(180deg, ${colors.purple}22 0%, ${colors.purple}12 100%)`,
                          fontSize: '14px',
                          fontWeight: '700',
                          color: colors.text,
                          letterSpacing: '-0.01em',
                          boxShadow: `0 2px 8px ${colors.purple}15`,
                          minHeight: '56px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {pillar.label}
                      </div>,
                      ...(i < SA_LEADERSHIP_FRAMEWORK.length - 1 ? [<span key={`arrow-${i}`} style={{ color: colors.purple, fontWeight: '700', fontSize: '16px', opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>→</span>] : [])
                    ])}
                  </div>
                </div>
                <div style={{ width: '100%', paddingTop: '2px' }}>
                  <p style={{
                    fontSize: '14px',
                    color: colors.textSecondary,
                    lineHeight: 1.5,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    maxWidth: '100%'
                  }}>
                    <EditableText
                      value={overviewContent.saLeadershipLens ?? DEFAULT_SA_LEADERSHIP_LENS}
                      onChange={(v) => updateOverviewContent('saLeadershipLens', v)}
                      style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: 1.5 }}
                      multiline
                    />
                  </p>
                </div>
              </Card>
            </div>
              );
            }
            
            const updateSectionTitle = (field, value) => {
              const newSections = [...sections];
              newSections[sectionIndex] = { ...newSections[sectionIndex], [field]: value };
              setSections(newSections);
            };
            
            // For non-overview sections: summary first, or full content after "Double Click" (anecdotes has no summary)
            // Sections in SECTIONS_WITHOUT_SUMMARY skip the summary card and always show full content
            const SECTIONS_WITHOUT_SUMMARY = ['field', 'leadership', 'gtm', 'hiring', 'operating', 'first30'];
            if (section.id !== 'overview') {
              const sectionSummary = SECTION_SUMMARIES[section.id];
              const skipSummaryForSection = SECTIONS_WITHOUT_SUMMARY.includes(section.id);
              const showSummary = !skipSummaryForSection && section.id !== 'anecdotes' && !detailViewSections[section.id] && sectionSummary;
              if (showSummary) {
                return (
                  <div key={section.id}>
                    <SectionSummaryCard
                      sectionNumber={sectionNumber}
                      title={section.title || section.label}
                      subtitle={section.subtitle}
                      headline={sectionSummary.headline}
                      summary={sectionSummary.summary}
                      bullets={sectionSummary.bullets || []}
                      timeline={sectionSummary.timeline}
                      onShowDetail={() => setDetailViewSections(prev => ({ ...prev, [section.id]: true }))}
                      sectionColor={section.color || colors.accent}
                    />
                  </div>
                );
              }
              return (
                <div key={section.id}>
                  {section.id !== 'anecdotes' && !skipSummaryForSection && (
                    <div style={{ marginBottom: '16px' }}>
                      <button
                        type="button"
                        onClick={() => setDetailViewSections(prev => ({ ...prev, [section.id]: false }))}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.textMuted,
                          fontSize: '13px',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        ← Back to summary
                      </button>
                    </div>
                  )}
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '12px' }}>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        color: colors.accent, 
                        fontFamily: "'Inter', monospace",
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                      }}>{sectionNumber}</span>
                      <EditableText
                        value={section.title || section.label}
                        onChange={(v) => updateSectionTitle('title', v)}
                        style={{ 
                          fontSize: '36px', 
                          fontWeight: '700', 
                          color: colors.text, 
                          margin: 0, 
                          letterSpacing: '-0.02em',
                          lineHeight: '1.2'
                        }}
                      />
                    </div>
                    {section.subtitle && (
                      <EditableText
                        value={section.subtitle}
                        onChange={(v) => updateSectionTitle('subtitle', v)}
                        style={{ 
                          fontSize: '18px', 
                          color: colors.textSecondary, 
                          margin: 0, 
                          marginLeft: '48px',
                          lineHeight: '1.6',
                          fontWeight: '400'
                        }}
                        multiline
                      />
                    )}
                  </div>
                  {section.id === 'leadership' && <LeadershipPrinciplesSection />}
                  {section.id === 'hiring' && <HiringTeamDesignSection />}
                  {section.id === 'gtm' && <GTMImpactSection />}
                  {section.id === 'operating' && <OperatingCoachingSection />}
                  {(section.id === 'first30' || section.id === 'first100') && <First30DaysSection />}
                  {section.id === 'field' && <FromTheFieldSection />}
                  {section.id === 'anecdotes' && <TeamAnecdotesSection />}
                </div>
              );
            }
            
            return null;
          })}
        </main>

        <footer style={{ 
          borderTop: `1px solid ${colors.border}`, 
          padding: '32px', 
          textAlign: 'center',
          marginTop: '48px',
          backgroundColor: colors.gray50
        }}>
          <p style={{ fontSize: '13px', color: colors.textMuted, margin: 0, fontWeight: '400' }}>SA Manager Leadership Panel • Writer • 2026</p>
        </footer>

        <ModeToggle isEditMode={isEditMode} setIsEditMode={setIsEditMode} />
      </div>
    </EditModeContext.Provider>
  );
}
