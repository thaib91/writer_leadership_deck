import React, { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';
import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
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

    // For overviewContent, update context and opportunity arrays with new defaults
    // Check version to force update when defaults change
    if (key === 'leadershipPlaybook_overviewContent' && stored && initialValue) {
      const storedVersion = stored._version || 0;
      const currentVersion = 3; // Increment this when updating defaults (3 = 10/20/30 day opportunity bullets)

      if (storedVersion < currentVersion) {
        const updated = { ...stored };
        // Replace context and opportunity with new defaults
        if (Array.isArray(initialValue.context)) {
          updated.context = initialValue.context;
        }
        if (Array.isArray(initialValue.opportunity)) {
          updated.opportunity = initialValue.opportunity;
        }
        updated._version = currentVersion;
        saveToStorage(key, updated);
        return updated;
      }
    }

    // Migrate sections: First 100 Days -> First 30 Days (10/20/30 focus)
    if (key === 'leadershipPlaybook_sections' && Array.isArray(stored) && stored.some((s) => s.id === 'first100')) {
      const migrated = stored.map((s) =>
        s.id === 'first100'
          ? { ...s, id: 'first30', label: 'First 30 Days', title: 'First 30 Days', subtitle: 'What I would aim to have in place (10 / 20 / 30 day focus), key priorities, risks and assumptions' }
          : s
      );
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

// Stat Card
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

// Leadership Principles Section
const LeadershipPrinciplesSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  
  const [philosophy, setPhilosophy] = useLocalStorage(
    'leadershipPlaybook_philosophy',
    'Scale individual contributor success into systematic processes. Document "how Thai does work" for team replication. Build trust through coaching for outcomes, not micromanaging.'
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
    'Strong collaboration skills and technical depth (Maureen)',
    'Key growth area: Ruthless prioritization needed for management role',
    'Can execute work personally but needs to develop team translation/coaching abilities',
    'Successfully handled direct feedback—didn\'t defend, focused on learning'
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

      {/* Principles Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {principles.map((principle, i) => (
          <Card key={i} style={{ borderLeft: `4px solid ${principle.color}` }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}>
              <EditableText
                value={principle.title}
                onChange={(v) => updatePrinciple(i, 'title', v)}
                style={{ fontSize: '18px', fontWeight: '600', color: colors.text }}
              />
            </h3>
            <p style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '12px' }}>
              <EditableText
                value={principle.description}
                onChange={(v) => updatePrinciple(i, 'description', v)}
                style={{ fontSize: '14px', color: colors.textSecondary }}
                multiline
              />
            </p>
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: principle.color + '10', 
              borderRadius: '6px',
              marginTop: '12px'
            }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: principle.color, marginBottom: '4px' }}>Example:</p>
              <p style={{ fontSize: '12px', color: colors.textSecondary, margin: 0 }}>
                <EditableText
                  value={principle.example}
                  onChange={(v) => updatePrinciple(i, 'example', v)}
                  style={{ fontSize: '12px', color: colors.textSecondary }}
                />
              </p>
            </div>
          </Card>
        ))}
      </div>

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
    </div>
  );
};

// Hiring & Team Design Section
const HiringTeamDesignSection = () => {
  const { isEditMode } = useContext(EditModeContext);
  const [activeTab, setActiveTab] = useState('profile');

  const [saProfile, setSaProfile] = useLocalStorage('leadershipPlaybook_saProfile', {
    technicalDepth: [
      'Has shipped production software or built complex solutions',
      'Can code or whiteboard system design',
      'Experience with AI/ML, enterprise software, or content generation tools',
      'Security certification or willingness to pursue (Q1 program)'
    ],
    gtmImpact: [
      '3+ years customer-facing technical role (SE, SA, DevRel)',
      'Track record driving complex POCs and trials',
      'Experience in enterprise sales motion',
      'Can connect technical issues to business objectives'
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
    'Technical depth is non-negotiable—SAs must have credibility with developers. GTM impact comes from connecting tech to business outcomes. Growth potential ensures we can develop SAs beyond initial hire, especially for security conversations and consultative approach.'
  );

  const [internalVsExternal, setInternalVsExternal] = useLocalStorage('leadershipPlaybook_internalVsExternal', {
    internal: [
      'Current team: 4 SAs (Burton transitioning to engineering)',
      'Two coaching categories: Technical skills vs Executive presence',
      'Internal progression requires systematic development',
      'Need better onboarding for new SA hires'
    ],
    external: [
      'Backfill positions (Harry, Hojoon replacements) tied to financial year planning',
      'Net new headcount impacts forecasting/budgeting',
      'Employee acquisition costs plus 20% tax burden factor',
      'Target February timeline for West Coast SA leader position'
    ]
  });

  const [maintainingCulture, setMaintainingCulture] = useLocalStorage('leadershipPlaybook_maintainingCulture', {
    currentTeam: [
      'Document "how Thai does work" for team replication—systematic processes vs ad-hoc execution',
      'Preserve collaborative working style: Thai, Nick, Burton can run deals soup-to-nuts',
      'Maintain individual working styles: some SAs are technical builders, others more business-forward',
      'Keep 40-hour work week maximum—additional headcount for overages, not burnout'
    ],
    scalingCulture: [
      'Create systematic content sharing: weekly demo highlights by industry (Greta leading)',
      'Develop special skills that differentiate from AEs: product knowledge, buyer personas, competitive landscape',
      'Foster continuous learning: attend all CS/sales enablement sessions, follow with team check-ins',
      'Build muscle memory for successful deal closure: document exit gates and tactics, make them accessible'
    ],
    onboarding: [
      'Better onboarding for new SA hires—move beyond "tech support" role',
      'Enable business acumen alongside technical skills from day one',
      'Shadow calls with 15-minute debrief sessions to accelerate learning',
      '10 post-mortems per quarter with real-time feedback on actual deals'
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

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
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
              return (
                <Card key={key} style={{ borderTop: `3px solid ${colors_map[idx]}` }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px', textTransform: 'capitalize' }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
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

      {activeTab === 'balance' && (
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>How I Balance Technical Depth, GTM Impact & Growth Potential</h3>
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

  const [presaleImpact, setPresaleImpact] = useLocalStorage('leadershipPlaybook_presaleImpact', [
    'Drive structured, high-quality POCs that convert (current POCs are generic)',
    'Help AEs connect technical pain points to business objectives',
    'Provide technical storytelling AEs currently lack',
    'Build trust with developers who are highly skeptical of "sales"',
    'Pricing scoping estimates (no EM involvement in presales)'
  ]);

  const [postsaleImpact, setPostsaleImpact] = useLocalStorage('leadershipPlaybook_postsaleImpact', [
    'Enable feature adoption in existing customers (Rules 20%, MCPS 15%, Composer 7-8%)',
    'FE-led enablement for existing customers',
    'Proactive customer engagement and champion building',
    'Increased discovery work alongside sales',
    'Continuous account engagement beyond scheduled meetings'
  ]);

  const [strategyAdaptation, setStrategyAdaptation] = useLocalStorage('leadershipPlaybook_strategyAdaptation', {
    agentFirst: [
      'Agent Builder being sunset—transition plan for existing implementations',
      'Applications focus replacing Agent Builder work',
      'Codeful experience within IDEs prioritized',
      'Medical writing application example—80% pre-built for customers'
    ],
    handsOnValidation: [
      'Hour-long enablement session with Eric planned',
      'Security certification program in Q1',
      'More proactive customer engagement',
      'Role evolution toward deeper security conversations'
    ],
    productShifts: [
      'Orchestration layer clarity needed for playbook-to-agent workflows',
      'MCPs currently limited for complex orchestration',
      'Ryan Harris working with product team on customer requirements',
      'Writer Agent token pricing significantly more expensive—credit system discussion'
    ]
  });

  const [salesPartnership, setSalesPartnership] = useLocalStorage('leadershipPlaybook_salesPartnership', {
    philosophy: 'AEs drive the bus and set the table; SAs collaborate on technical storytelling.',
    bestPractices: [
      'Knowledge sharing and thought leadership',
      'Credibility building with technical stakeholders',
      'Joint deal planning and timeline ownership',
      'Proactive sharing of relevant content/demos by vertical'
    ],
    currentGaps: [
      'No standardized handoff processes between AEs and SAs',
      'Reactive SA involvement vs strategic inclusion from opportunity start',
      'Ambiguity around when to engage SAs and collaboration expectations',
      'New hires lack coaching—thrown into role as "tech support"',
      'SAs not proactive in deal communication/strategy'
    ]
  });

  const [productPartnership, setProductPartnership] = useLocalStorage('leadershipPlaybook_productPartnership', [
    'Meet with Product leadership for feedback loop',
    'Ryan Harris working with product team on customer requirements',
    'Orchestration layer clarity for playbook-to-agent workflows',
    'Applications focus and Codeful experience prioritization'
  ]);

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'presale', label: 'Pre-Sale Impact', color: colors.accent },
          { id: 'postsale', label: 'Post-Sale Impact', color: colors.success },
          { id: 'adaptation', label: 'Strategy Adaptation', color: colors.purple },
          { id: 'partnerships', label: 'Partnerships', color: colors.info }
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
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>How SAs Drive Impact Pre-Sale</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {presaleImpact.map((item, i) => (
              <EditableListItem
                key={i}
                value={item}
                onChange={(v) => {
                  const newItems = [...presaleImpact];
                  newItems[i] = v;
                  setPresaleImpact(newItems);
                }}
                onDelete={() => setPresaleImpact(presaleImpact.filter((_, idx) => idx !== i))}
                color={colors.accent}
              />
            ))}
          </div>
          <AddItemButton onClick={() => setPresaleImpact([...presaleImpact, 'New item - click to edit'])} label="Add impact" />
        </Card>
      )}

      {activeTab === 'postsale' && (
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>How SAs Drive Impact Post-Sale</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {postsaleImpact.map((item, i) => (
              <EditableListItem
                key={i}
                value={item}
                onChange={(v) => {
                  const newItems = [...postsaleImpact];
                  newItems[i] = v;
                  setPostsaleImpact(newItems);
                }}
                onDelete={() => setPostsaleImpact(postsaleImpact.filter((_, idx) => idx !== i))}
                color={colors.success}
              />
            ))}
          </div>
          <AddItemButton onClick={() => setPostsaleImpact([...postsaleImpact, 'New item - click to edit'])} label="Add impact" />
        </Card>
      )}

      {activeTab === 'adaptation' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {Object.entries(strategyAdaptation).map(([key, items], idx) => {
              const colors_map = [colors.accent, colors.purple, colors.warning];
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

      {activeTab === 'partnerships' && (
        <div>
          <Card style={{ marginBottom: '24px', backgroundColor: colors.accent + '10', border: `1px solid ${colors.accent}30` }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Sales Partnership Philosophy</h3>
            <p style={{ fontSize: '15px', color: colors.textSecondary, fontStyle: 'italic', margin: 0 }}>
              <EditableText
                value={salesPartnership.philosophy}
                onChange={(v) => setSalesPartnership({ ...salesPartnership, philosophy: v })}
                style={{ fontSize: '15px', color: colors.textSecondary, fontStyle: 'italic' }}
              />
            </p>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <Card style={{ borderTop: `3px solid ${colors.success}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Best Practices</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {salesPartnership.bestPractices.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ 
                      width: '5px', 
                      height: '5px', 
                      borderRadius: '50%', 
                      backgroundColor: colors.success,
                      marginTop: '6px',
                      flexShrink: 0
                    }} />
                    <EditableText
                      value={item}
                      onChange={(v) => {
                        const newItems = [...salesPartnership.bestPractices];
                        newItems[i] = v;
                        setSalesPartnership({ ...salesPartnership, bestPractices: newItems });
                      }}
                      style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                    />
                    {isEditMode && (
                      <button
                        onClick={() => {
                          const newItems = salesPartnership.bestPractices.filter((_, idx) => idx !== i);
                          setSalesPartnership({ ...salesPartnership, bestPractices: newItems });
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
                    setSalesPartnership({ ...salesPartnership, bestPractices: [...salesPartnership.bestPractices, 'New item - click to edit'] });
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    border: `1px dashed ${colors.success}`,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: colors.success,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.success + '10';
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
            <Card style={{ borderTop: `3px solid ${colors.danger}` }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Current Gaps</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {salesPartnership.currentGaps.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ 
                      width: '5px', 
                      height: '5px', 
                      borderRadius: '50%', 
                      backgroundColor: colors.danger,
                      marginTop: '6px',
                      flexShrink: 0
                    }} />
                    <EditableText
                      value={item}
                      onChange={(v) => {
                        const newItems = [...salesPartnership.currentGaps];
                        newItems[i] = v;
                        setSalesPartnership({ ...salesPartnership, currentGaps: newItems });
                      }}
                      style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                    />
                    {isEditMode && (
                      <button
                        onClick={() => {
                          const newItems = salesPartnership.currentGaps.filter((_, idx) => idx !== i);
                          setSalesPartnership({ ...salesPartnership, currentGaps: newItems });
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
                    setSalesPartnership({ ...salesPartnership, currentGaps: [...salesPartnership.currentGaps, 'New item - click to edit'] });
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    border: `1px dashed ${colors.danger}`,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: colors.danger,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.danger + '10';
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
          </div>

          <Card>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>Product Partnership</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {productPartnership.map((item, i) => (
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
                    onChange={(v) => {
                      const newItems = [...productPartnership];
                      newItems[i] = v;
                      setProductPartnership(newItems);
                    }}
                    style={{ fontSize: '13px', color: colors.textSecondary, flex: 1 }}
                  />
                  {isEditMode && (
                    <button
                      onClick={() => setProductPartnership(productPartnership.filter((_, idx) => idx !== i))}
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
                onClick={() => setProductPartnership([...productPartnership, 'New item - click to edit'])}
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
          </Card>
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
      { name: 'Feature adoption rates', target: 'Rules >50%, MCPS >40%, Composer >30%', status: 'bad' },
      { name: 'SA utilization / capacity', target: 'Quantify the 50+ trials problem', status: 'unknown' }
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
      'Security certification program in Q1',
      'Hour-long enablement session with Eric on security conversations',
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

const InteractiveTimeline = ({ phases, activePhase, setActivePhase }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const TIMELINE_HEIGHT = 420;
  const [dimensions, setDimensions] = useState({ width: 0, height: TIMELINE_HEIGHT });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: TIMELINE_HEIGHT
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const isSmallScreen = dimensions.width < 768;
    const margin = {
      top: isSmallScreen ? 170 : 180,
      right: isSmallScreen ? 40 : 80,
      bottom: isSmallScreen ? 170 : 180,
      left: isSmallScreen ? 40 : 80
    };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;
    const trackY = height / 2;
    const progressWidth = ((activePhase + 1) / phases.length) * width;

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);
    const xScale = scaleLinear().domain([0, 30]).range([0, width]);

    // Draw timeline track
    g.append('line')
      .attr('x1', 0).attr('y1', trackY).attr('x2', width).attr('y2', trackY)
      .attr('stroke', colors.borderLight)
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round');

    // Draw progress line
    g.append('line')
      .attr('x1', 0).attr('y1', trackY).attr('x2', progressWidth).attr('y2', trackY)
      .attr('stroke', phases[activePhase].color)
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round')
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');

    // Milestone markers (before phase labels so labels render on top)
    [0, 10, 20, 30].forEach(day => {
      const x = xScale(day);
      g.append('line')
        .attr('x1', x).attr('y1', trackY - 8).attr('x2', x).attr('y2', trackY + 8)
        .attr('stroke', colors.border).attr('stroke-width', 1).attr('opacity', 0.3);
    });

    // Draw phase nodes
    phases.forEach((phase, i) => {
      let x = i === 0 ? 0 : i === phases.length - 1 ? width : (i / (phases.length - 1)) * width;
      const isActive = i === activePhase;
      const isPast = i < activePhase;
      const isTop = i % 2 === 0;
      const circleRadius = isActive ? 16 : isPast ? 14 : 12;
      const labelY = isTop ? trackY - circleRadius - 70 : trackY + circleRadius + 75;
      const titleY = isTop ? trackY - circleRadius - 48 : trackY + circleRadius + 98;
      let textAnchor = i === 0 ? 'start' : i === phases.length - 1 ? 'end' : 'middle';

      if (isActive || isPast) {
        g.append('circle')
          .attr('cx', x).attr('cy', trackY).attr('r', 20)
          .attr('fill', 'none').attr('stroke', phase.color).attr('stroke-width', 2).attr('opacity', 0.3)
          .style('filter', 'blur(4px)');
      }
      g.append('circle')
        .attr('cx', x).attr('cy', trackY)
        .attr('r', circleRadius)
        .attr('fill', isActive || isPast ? phase.color : 'white')
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
          .attr('cx', x).attr('cy', trackY).attr('r', 6).attr('fill', 'white')
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
          .attr('y', labelY - 20)
          .attr('text-anchor', checkmarkAnchor)
          .attr('font-size', '18px')
          .text('✓')
          .attr('fill', phase.color)
          .style('pointer-events', 'none');
      }
    });

  }, [phases, activePhase, dimensions]);

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
  const [timelineTitle, setTimelineTitle] = useLocalStorage('leadershipPlaybook_timelineTitle', 'First 30 Days Timeline');

  const defaultPhases30 = [
    {
      days: 'Days 1-10',
      title: 'Discovery & Baseline',
      color: colors.accent,
      goal: 'Map current state across Partner SA integration, partner accountability, competitive positioning, capacity, and retention—establish baseline for action',
      priorities: [
        'Partner SA: Audit all partner-sourced deals; interview 3-5 regional SAs on friction points; document "telephone game" workflow; pull partner vs. direct deal velocity data',
        'Partner Accountability: Create Partner Engagement Scorecard—joint customers identified, discovery calls scheduled, pipeline generated, deals closed; define Tier 1/2/3 expectations (e.g. Tier 1: 2 joint intros/month, quarterly pipeline target)',
        'Differentiation: Conduct 5 lost-deal interviews (where "just use ChatGPT" killed deals); audit sales collateral for differentiation gaps; build competitive matrix: Writer vs. ChatGPT Enterprise vs. Claude vs. Gemini (governance, brand voice, integrations, workflow depth)',
        'Capacity: Build SA Capacity Dashboard—deal count per SA, weighted pipeline, deal stage distribution, time-to-close; set yellow (18+ deals or 120% avg pipeline) and red (21+ or 140%) thresholds',
        'Retention: Confidential 1:1s with each West Coast SA—what would make you stay 2 years? What energizes vs. drains? Identify flight risk levels; map career aspirations to growth opportunities'
      ],
      risks: [
        'Trying to fix everything at once without baseline clarity',
        'SAs or partners not candid in interviews—missing real friction',
        'Dashboard built on incomplete or stale data',
        'Overpromising timelines before discovery complete'
      ],
      assumptions: [
        'Leadership supports 30-day discovery before major process changes',
        'Sales/partner data available in Salesforce or equivalent',
        'Team willing to participate in 1:1s and interviews',
        'Current structure stable enough to run parallel discovery'
      ],
      keyDeliverables: [
        'Partner deal audit and workflow documentation',
        'Partner Engagement Scorecard and tier definitions',
        'Competitive matrix and lost-deal summary',
        'SA Capacity Dashboard (yellow/red thresholds)',
        'Retention 1:1 summary and flight-risk map'
      ]
    },
    {
      days: 'Days 11-20',
      title: 'Pilot Design & Build',
      color: colors.purple,
      goal: 'Design West Coast Partner SA pilot, prescriptive partner assets, differentiation playbook, capacity rules, and retention programs—actionable by Day 30',
      priorities: [
        'Partner SA: Select West Coast for 60-day integration pilot; redefine Partner SA as "Partner Specialist" overlay in regional pod; create shared Slack/deal rooms (partner + regional SAs); document RACI—Partner Specialist owns partner relationship, Regional SA owns technical solution and customer relationship',
        'Partner Accountability: Build Partner Pitch Kits for top 5 use cases (FS: KYC, research, regulatory docs; Healthcare: clinical docs, prior auth; Manufacturing: tech docs, quality reporting)—each with 2-min pitch, proof points, discovery questions, demo script; create "Why Writer vs. DIY" one-pager for partner sellers',
        'Differentiation: Develop Objection Handling Playbook—talk tracks for "just use ChatGPT," "we\'ll build ourselves," "Gemini free with Workspace"; create 3 vertical "Why Writer Wins" narratives (FS, Technology, Healthcare); document TCO/time-to-value angles',
        'Capacity: Audit SA-to-AE mappings vs. actual deal flow; identify mismatches (high-volume AEs + loaded SAs); propose rebalancing by geography, vertical, deal velocity; draft Deal Assignment Rules of Engagement and escalation path when capacity constrained',
        'Retention: Define Lighthouse Deal program—2-3 strategic accounts/quarter with executive touchpoints; design SA Innovation Sprint (2-day net-new build, present to leadership); implement Executive Shadow (top performers in 2-3 exec customer meetings/quarter)'
      ],
      risks: [
        'Pilot design too heavy—can\'t launch in 60 days',
        'Partner kits too generic—partners don\'t use them',
        'Objection playbook not grounded in real deal language',
        'Rebalancing triggers political pushback'
      ],
      assumptions: [
        'West Coast is viable pilot region; partner and regional SA buy-in',
        'Content/Enablement can support pitch kits and playbook',
        'AE alignment changes can be socialized with Sales leadership',
        'Executive Shadow and Lighthouse criteria are agreed'
      ],
      keyDeliverables: [
        'West Coast pilot plan with RACI and shared channels',
        'Partner Pitch Kits (top 5 use cases) and Why Writer vs. DIY one-pager',
        'Objection Handling Playbook and vertical narratives',
        'Deal Assignment Rules of Engagement and rebalancing proposal',
        'Lighthouse Deal and Innovation Sprint program docs'
      ]
    },
    {
      days: 'Days 21-30',
      title: 'Operationalize & Rhythm',
      color: colors.warning,
      goal: 'Launch pilot and accountability rhythms, enable SAs on differentiation, operationalize capacity and recognition—so Day 30 outcomes are measurable and repeatable',
      priorities: [
        'Partner SA: Launch West Coast pilot with success metrics (deal velocity, customer satisfaction, SA utilization); run weekly retro; build business case for broader rollout from pilot data',
        'Partner Accountability: Launch monthly Partner Business Reviews with scorecard; require Joint Account Planning for Tier 1 (named accounts, owner, next action, commit date); define escalation path—2 consecutive months below minimums triggers exec-to-exec conversation; build Salesforce dashboard for partner engagement visible to leadership',
        'Differentiation: Run 90-minute SA enablement on Objection Handling Playbook; start "Win Story of the Week" in Slack; create Seismic/Highspot collection for competitive situations; establish quarterly competitive intel refresh',
        'Capacity: Add weekly 15-min capacity check-in to team standup (dashboard review, flag imbalances); document flex-capacity protocol when SA hits red threshold (redistribution steps, AE communication); define strategic-deal criteria and how it affects capacity calculation',
        'Retention: Launch monthly Impact Spotlight (SA presents innovative solution to team + leadership); document path-to-Lead (deals closed, enablement contribution, peer feedback, lighthouse participation); schedule quarterly career development conversations (separate from performance reviews)'
      ],
      risks: [
        'Pilot metrics not tracked—can\'t prove value',
        'Partner reviews become checkbox—no real accountability',
        'Enablement one-and-done—no reinforcement',
        'Capacity protocol not used when pressure hits'
      ],
      assumptions: [
        'Pilot has clear success criteria and owner',
        'Salesforce/Tableau can support partner and capacity dashboards',
        'Leadership attends Impact Spotlight or equivalent',
        'Career development conversations are protected time'
      ],
      keyDeliverables: [
        'Pilot launched with metrics and weekly retro cadence',
        'Partner Business Review and Joint Account Planning in motion; partner dashboard live',
        'SA differentiation enablement complete; competitive content in Seismic/Highspot',
        'Weekly capacity check-in and flex-capacity protocol documented',
        'Impact Spotlight and path-to-Lead doc live; career conversations scheduled'
      ]
    }
  ];

  const [phases, setPhases] = useLocalStorage('leadershipPlaybook_phases', defaultPhases30);

  const [keyOutcomesTitle, setKeyOutcomesTitle] = useLocalStorage('leadershipPlaybook_keyOutcomesTitle', 'What I Aim to Have in Place After 30 Days');
  const [keyOutcomes, setKeyOutcomes] = useLocalStorage('leadershipPlaybook_keyOutcomes', [
    'Partner SA: West Coast integration pilot launched with clear RACI and success metrics',
    'Partner Accountability: Scorecard and monthly Partner Business Reviews; Tier 1 joint account plans in place',
    'Differentiation: Objection Handling Playbook enabled; Win Story of the Week and competitive content live',
    'Capacity: SA Capacity Dashboard with yellow/red thresholds; weekly check-in and flex-capacity protocol',
    'Retention: Lighthouse Deal program and Impact Spotlight launched; path-to-Lead and career conversations scheduled'
  ]);

  // Update functions for phase data
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
      {/* Interactive D3 Timeline */}
      <Card style={{ marginBottom: '24px', padding: '20px', backgroundColor: 'white' }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <EditableText
            value={timelineTitle}
            onChange={(v) => setTimelineTitle(v)}
            style={{ fontSize: '20px', fontWeight: '600', color: colors.text }}
          />
        </div>
        <InteractiveTimeline 
          phases={phases} 
          activePhase={activePhase} 
          setActivePhase={setActivePhase} 
        />
      </Card>

      {/* Active Phase Details */}
      <Card style={{ borderLeft: `4px solid ${phases[activePhase].color}`, marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <EditableText
              value={phases[activePhase].title}
              onChange={(v) => updatePhaseField('title', v)}
              style={{ fontSize: '20px', fontWeight: '600', color: colors.text, margin: '0 0 4px' }}
            />
            <EditableText
              value={phases[activePhase].days}
              onChange={(v) => updatePhaseField('days', v)}
              style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: colors.textMuted }}>Goal:</span>
            <EditableText
              value={phases[activePhase].goal}
              onChange={(v) => updatePhaseField('goal', v)}
              style={{ 
                fontSize: '12px', 
                fontWeight: '600', 
                color: phases[activePhase].color,
                backgroundColor: phases[activePhase].color + '15',
                padding: '6px 12px',
                borderRadius: '100px',
                maxWidth: '300px'
              }}
              multiline
            />
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ 
              width: '20px', 
              height: '20px', 
              borderRadius: '4px', 
              backgroundColor: phases[activePhase].color + '20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px'
            }}>
              🎯
            </div>
            <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, margin: 0 }}>Key Priorities</h5>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {phases[activePhase].priorities.map((item, i) => (
              <EditableListItem
                key={i}
                value={item}
                onChange={(v) => updatePhaseListItem('priorities', i, v)}
                onDelete={() => deletePhaseListItem('priorities', i)}
                color={phases[activePhase].color}
                style={{ 
                  padding: '8px',
                  backgroundColor: i % 2 === 0 ? colors.surface : 'white',
                  borderRadius: '6px'
                }}
              />
            ))}
          </div>
          <AddItemButton 
            onClick={() => addPhaseListItem('priorities')} 
            label="Add priority" 
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div style={{ 
            padding: '16px',
            backgroundColor: colors.danger + '08',
            borderRadius: '8px',
            border: `1px solid ${colors.danger}20`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                borderRadius: '4px', 
                backgroundColor: colors.danger + '20',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}>
                ⚠️
              </div>
              <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, margin: 0 }}>Risks</h5>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {phases[activePhase].risks.map((item, i) => (
                <EditableListItem
                  key={i}
                  value={item}
                  onChange={(v) => updatePhaseListItem('risks', i, v)}
                  onDelete={() => deletePhaseListItem('risks', i)}
                  color={colors.danger}
                />
              ))}
            </div>
            <AddItemButton 
              onClick={() => addPhaseListItem('risks')} 
              label="Add risk" 
            />
          </div>
          <div style={{ 
            padding: '16px',
            backgroundColor: colors.warning + '08',
            borderRadius: '8px',
            border: `1px solid ${colors.warning}20`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                borderRadius: '4px', 
                backgroundColor: colors.warning + '20',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}>
                💭
              </div>
              <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.warning, margin: 0 }}>Assumptions</h5>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {phases[activePhase].assumptions.map((item, i) => (
                <EditableListItem
                  key={i}
                  value={item}
                  onChange={(v) => updatePhaseListItem('assumptions', i, v)}
                  onDelete={() => deletePhaseListItem('assumptions', i)}
                  color={colors.warning}
                />
              ))}
            </div>
            <AddItemButton 
              onClick={() => addPhaseListItem('assumptions')} 
              label="Add assumption" 
            />
          </div>
        </div>

        {phases[activePhase].keyDeliverables && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                borderRadius: '4px', 
                backgroundColor: phases[activePhase].color + '20',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}>
                📦
              </div>
              <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.text, margin: 0 }}>Key Deliverables</h5>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {phases[activePhase].keyDeliverables.map((item, i) => (
                <EditableListItem
                  key={i}
                  value={item}
                  onChange={(v) => updatePhaseListItem('keyDeliverables', i, v)}
                  onDelete={() => deletePhaseListItem('keyDeliverables', i)}
                  color={phases[activePhase].color}
                  style={{ 
                    padding: '8px',
                    backgroundColor: i % 2 === 0 ? phases[activePhase].color + '10' : 'white',
                    borderRadius: '6px',
                    border: `1px solid ${phases[activePhase].color}20`
                  }}
                />
              ))}
            </div>
            <AddItemButton 
              onClick={() => addPhaseListItem('keyDeliverables')} 
              label="Add deliverable" 
            />
          </div>
        )}
      </Card>

      {/* Key Outcomes by Day 30 */}
      <Card style={{ backgroundColor: colors.success + '10', border: `1px solid ${colors.success}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '8px', 
            backgroundColor: colors.success + '20',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
          }}>
            ✅
          </div>
          <EditableText
            value={keyOutcomesTitle}
            onChange={(v) => setKeyOutcomesTitle(v)}
            style={{ fontSize: '16px', fontWeight: '600', color: colors.success, margin: 0 }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {keyOutcomes.map((item, i) => (
            <EditableListItem
              key={i}
              value={item}
              onChange={(v) => {
                const newOutcomes = [...keyOutcomes];
                newOutcomes[i] = v;
                setKeyOutcomes(newOutcomes);
              }}
              onDelete={() => setKeyOutcomes(keyOutcomes.filter((_, idx) => idx !== i))}
              color={colors.success}
              style={{ 
                padding: '8px',
                backgroundColor: 'white',
                borderRadius: '6px'
              }}
            />
          ))}
        </div>
        <AddItemButton 
          onClick={() => setKeyOutcomes([...keyOutcomes, 'New outcome - click to edit'])} 
          label="Add outcome" 
        />
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

// From the Field Section
const FromTheFieldSection = () => {
  const { isEditMode } = useContext(EditModeContext);

  const [collaborationGaps, setCollaborationGaps] = useLocalStorage('leadershipPlaybook_collaborationGaps', [
    {
      category: 'Lack of Structured Partnerships',
      description: 'The West team operates mostly on round-robin assignment rather than consistent SA/AE pairings. Success cases involve sustained multi-deal relationships, but this isn\'t systematized.',
      source: 'Field Observations',
      issues: [
        'West Coast lacks pod structures pairing SAs with specific AEs',
        'Historical friction: "pre-sales built custom agents that post-sales team rebuilt from scratch"',
        'Creates duplicate work cycles for customers'
      ],
      recommendations: [
        'Implement pod structures with consistent SA/AE pairings',
        'Systematize multi-deal relationships that have proven successful'
      ]
    },
    {
      category: 'Role Ambiguity and Perception Issues',
      description: 'SAs need "more strategic partnership vs. demo execution." There\'s a "gap between technical demo work and holistic ROI storytelling."',
      source: 'Natalie/Thomas, Maureen (SVP Partnerships)',
      issues: [
        'SAs too reactive and siloed—need "proactive partnership vs \'demo monkey\' approach"',
        'Lack of pod structure—random AE/SA pairings hurt relationship building',
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
      category: 'Partnership Quality Gaps',
      description: 'Best SA partnerships bring "knowledge, thought leadership, credibility building." Current gaps include new hires lacking coaching and SAs not being proactive.',
      source: 'Haley (Strat AE)',
      issues: [
        'New hires "thrown into role as tech support" without coaching',
        'SAs not "proactive in deal communication/strategy"',
        'Bandwidth constraints limit strategic partnership',
        'Need "strategic ownership vs. transactional support"',
        'Require "continuous account engagement beyond scheduled meetings"'
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
      category: 'Misaligned Use Case Selection',
      description: 'AEs "accept any use case for leverage, not necessarily Writer\'s best fit," resulting in "60-70% validation success, insufficient for compelling value story."',
      source: 'Laura (VP of SA)',
      issues: [
        'Horizontal platform messaging "confuses differentiation from ChatGPT/Copilot"',
        'Accepting any use case reduces validation success rate',
        'Insufficient for compelling value story'
      ],
      recommendations: [
        'Develop clearer use case qualification criteria',
        'Improve differentiation messaging vs. ChatGPT/Copilot',
        'Focus on Writer\'s best-fit use cases'
      ]
    },
    {
      category: 'POC Process Problems',
      description: 'Technical team "spends excessive time on complex POCs never used in production." Content supply chain demos are "impressive but not scalable/implementable."',
      source: 'Laura (VP of SA), Thomas (RVP West)',
      issues: [
        'Excessive time on complex POCs never used in production',
        'Content supply chain demos impressive but not scalable/implementable',
        'Prolonged evaluations: Bangkok Bank (1+ year), Microsoft Copilot Studio comparisons lacking urgency',
        'Lack of executive sponsor alignment',
        'No clear success criteria definition',
        'No post-POC path agreement before starting'
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
        'Recent Intel deal "lacking clear post-signature plan"',
        'Previous deals like Geisinger and Clorox were "wheelhouse use cases" but need "guardrails for what scales in post-sales vs. custom builds"',
        'Professional services underutilized',
        'CSM team transitioning but not fully aligned with pre-sales'
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
        'Exit gates and tactics documented but not referenced',
        'Lack of muscle memory for successful deal closure process',
        'Attributed to "schizophrenic go-to-market and product roadmap" due to product-market fit volatility',
        'Information exists but not accessible/followed by reps'
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
      category: 'Internal Messaging Issues',
      description: '"Internal messaging wrong—positioned as replacement vs. additional tool."',
      source: 'Haley (Strat AE)',
      issues: [
        'Positioned as replacement vs. additional tool',
        'Missing "interconnectivity between Writer tools"',
        'Loading/performance issues during demos',
        'Lack of clear differentiation story vs. competitors'
      ],
      recommendations: [
        'Reposition Writer Agent as additional tool, not replacement',
        'Highlight interconnectivity between Writer tools',
        'Address loading/performance issues during demos',
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
      {/* SA/AE Collaboration Gaps */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '600', color: colors.text, margin: 0 }}>SA/AE Collaboration Gaps</h3>
          {isEditMode && (
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
          )}
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
                <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '12px' }}>Issues</h5>
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
                <AddItemButton onClick={() => addGapListItem(index, 'issues')} label="Add issue" />
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

      {/* Sales Process Issues */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '600', color: colors.text, margin: 0 }}>Sales Process Issues</h3>
          {isEditMode && (
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
          )}
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
                <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '12px' }}>Issues</h5>
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
                <AddItemButton onClick={() => addSalesIssueListItem(index, 'issues')} label="Add issue" />
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

      {/* Writer Agent Positioning Challenges */}
      <div>
        <h3 style={{ fontSize: '24px', fontWeight: '600', color: colors.text, marginBottom: '24px' }}>Writer Agent Positioning Challenges</h3>
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
                <h5 style={{ fontSize: '14px', fontWeight: '600', color: colors.danger, marginBottom: '12px' }}>Issues</h5>
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
                <AddItemButton onClick={() => addAgentListItem(index, 'issues')} label="Add issue" />
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
      content: 'Huge shoutout to @thai and @Chris Wheeler for jumping in late this evening to fix a Content Supply Chain blueprint that PwC was scheduled to present to 20+ Conagra executives tomorrow morning at 9am. They resolved multiple agents that got broken due to some LLM issues. They both put their heads together and got it done. Thank you both so much - love seeing our SA team in action 🙌',
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
  
  const [sections, setSections] = useLocalStorage('leadershipPlaybook_sections', [
    { id: 'overview', label: 'Overview', title: 'Overview', subtitle: '' },
    { id: 'leadership', label: 'Leadership Principles', title: 'Leadership Principles', subtitle: 'My leadership philosophy and how it shows up day to day' },
    { id: 'hiring', label: 'Hiring & Team Design', title: 'Hiring & Team Design', subtitle: 'The SA profile, balancing act, internal vs external hiring, and maintaining culture' },
    { id: 'gtm', label: 'GTM & Impact', title: 'GTM & Impact Model', subtitle: 'How SAs drive impact pre- and post-sale, and adapt to strategy shifts' },
    { id: 'operating', label: 'Operating & Coaching', title: 'Operating & Coaching Model', subtitle: 'Key metrics, team cadences, and how I uplevel SAs' },
    { id: 'first30', label: 'First 30 Days', title: 'First 30 Days', subtitle: 'What I would aim to have in place (10 / 20 / 30 day focus), key priorities, risks and assumptions' },
    { id: 'field', label: 'From the Field', title: 'From the Field', subtitle: 'What we\'re hearing as working or not working in sales engagements and SA/AE partnerships' },
    { id: 'anecdotes', label: 'Team Anecdotes', title: 'Team Anecdotes', subtitle: 'Feedback and recognition from colleagues at Writer' },
  ]);

  // Editable content state for Overview
  const defaultOverviewContent = {
    subtitle: 'West Coast SA Manager | Leadership Panel',
    title: 'My Leadership Playbook',
    description: 'Building and sustaining a high-performing West Coast SA team at Writer.',
    context: [
      'West Coast SA leader position targeted for February',
      'Current 3:1 AE-to-SA ratio will remain unchanged',
      '40-hour work weeks maximum—additional headcount for overages',
      'Backfill positions (Harry, Hojoon replacements) tied to financial year planning',
      'Agent Builder being sunset—transitioning to applications focus',
      'Role evolution toward deeper security conversations and consultative approach',
      'Field feedback: West team operates on round-robin assignment rather than consistent SA/AE pairings',
      'Field feedback: SAs too reactive and siloed—need proactive partnership vs "demo monkey" approach',
      'Field feedback: No standardized handoff processes between AEs and SAs—information exists but not accessible',
      'Field feedback: POC process problems—excessive time on complex POCs never used in production',
      'Field feedback: Pre-sales/post-sales disconnect—deals lacking clear post-signature plans',
      'Field feedback: Writer Agent positioning issues—internal messaging wrong, positioned as replacement vs. additional tool'
    ],
    opportunity: [
      'Establish trust and understand current state through comprehensive 1:1s and stakeholder meetings (Days 1-10)',
      'Implement pod structures with consistent SA/AE pairings to systematize successful multi-deal relationships',
      'Create standardized handoff processes and POC check-in templates for systematic execution (Days 11-20)',
      'Build coaching infrastructure with structured onboarding, post-mortems, and shadow call programs (Days 21-30)',
      'Launch leading metrics dashboard and validate process improvements with data-driven results',
      'Present 30-day findings and establish Q2 priorities based on validated learnings',
      'Require executive sponsor alignment and clear success criteria before starting POC evaluations',
      'Develop strategic partnership capabilities beyond demo execution—ROI storytelling and business acumen',
      'Establish guardrails for what scales in post-sales vs. custom builds to prevent duplicate work cycles',
      'Reposition Writer Agent messaging and highlight interconnectivity between Writer tools',
      'Create systematic content sharing by industry/vertical for better knowledge transfer',
      'Build muscle memory for successful deal closure through accessible exit gates and documented tactics'
    ]
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

              {/* Stats Row */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(4, 1fr)', 
                gap: '16px', 
                marginBottom: '32px',
                padding: '16px',
                backgroundColor: colors.gray50,
                borderRadius: '16px',
                border: `1px solid ${colors.border}`
              }}>
                <StatCard value={4} label="Current SAs" color={colors.info} />
                <StatCard value={3} suffix=":1" label="AE-to-SA Ratio" color={colors.accent} />
                <StatCard value={40} label="Max Hours/Week" color={colors.warning} />
                <StatCard value={30} label="Day Plan" color={colors.success} />
              </div>

              {/* Two Column Layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: colors.info + '15',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px'
                    }}>
                      📋
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: colors.text }}>Context</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {overviewContent.context.map((p, i) => (
                      <EditableListItem
                        key={i}
                        value={p}
                        onChange={(v) => updateOverviewListItem('context', i, v)}
                        onDelete={() => deleteOverviewListItem('context', i)}
                        color={colors.info}
                      />
                    ))}
                  </div>
                  <AddItemButton onClick={() => addOverviewListItem('context')} label="Add context" />
                </Card>

                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: colors.success + '15',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px'
                    }}>
                      🎯
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: colors.text }}>The Opportunity</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {overviewContent.opportunity.map((p, i) => (
                      <EditableListItem
                        key={i}
                        value={p}
                        onChange={(v) => updateOverviewListItem('opportunity', i, v)}
                        onDelete={() => deleteOverviewListItem('opportunity', i)}
                        color={colors.success}
                      />
                    ))}
                  </div>
                  <AddItemButton onClick={() => addOverviewListItem('opportunity')} label="Add opportunity" />
                </Card>
              </div>
            </div>
              );
            }
            
            const updateSectionTitle = (field, value) => {
              const newSections = [...sections];
              newSections[sectionIndex] = { ...newSections[sectionIndex], [field]: value };
              setSections(newSections);
            };
            
            // For non-overview sections, show editable header
            if (section.id !== 'overview') {
              return (
                <div key={section.id}>
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
