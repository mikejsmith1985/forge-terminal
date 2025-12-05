// Forge Terminal Themes
// Each theme has dark and light variants for both UI (CSS variables) and terminal (xterm)

export const themes = {
  molten: {
    name: 'Molten Metal',
    dark: {
      ui: {
        bg: '#0a0a0a',
        surface: '#171717',
        overlay: '#262626',
        text: '#e5e5e5',
        subtext: '#a3a3a3',
        accent: '#f97316',
        accentGlow: 'rgba(249, 115, 22, 0.4)',
        accentSecondary: '#ef4444',
        yellow: '#facc15',
        green: '#22c55e',
        red: '#ef4444',
        cardBg: '#171717',
        cardBorder: '#262626',
        cardHoverBorder: '#f97316',
        gradientPrimary: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
        gradientCard: 'linear-gradient(145deg, #171717 0%, #0a0a0a 100%)',
      },
      terminal: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#f97316',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#262626',
        black: '#171717',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#facc15',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#e5e5e5',
        brightBlack: '#404040',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#e879f9',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      }
    },
    light: {
      ui: {
        bg: '#f5f5f4',
        surface: '#ffffff',
        overlay: '#e7e5e4',
        text: '#1c1917',
        subtext: '#57534e',
        accent: '#ea580c',
        accentGlow: 'rgba(234, 88, 12, 0.3)',
        accentSecondary: '#dc2626',
        yellow: '#ca8a04',
        green: '#16a34a',
        red: '#dc2626',
        cardBg: '#ffffff',
        cardBorder: '#e7e5e4',
        cardHoverBorder: '#ea580c',
        gradientPrimary: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)',
        gradientCard: 'linear-gradient(145deg, #ffffff 0%, #fafaf9 100%)',
      },
      terminal: {
        background: '#f5f5f4',
        foreground: '#1c1917',
        cursor: '#ea580c',
        cursorAccent: '#f5f5f4',
        selectionBackground: '#e7e5e4',
        black: '#57534e',
        red: '#dc2626',
        green: '#16a34a',
        yellow: '#ca8a04',
        blue: '#2563eb',
        magenta: '#c026d3',
        cyan: '#0891b2',
        white: '#1c1917',
        brightBlack: '#78716c',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#3b82f6',
        brightMagenta: '#d946ef',
        brightCyan: '#06b6d4',
        brightWhite: '#000000',
      }
    }
  },

  ocean: {
    name: 'Deep Ocean',
    dark: {
      ui: {
        bg: '#0c1222',
        surface: '#141d2f',
        overlay: '#1e2a42',
        text: '#e2e8f0',
        subtext: '#94a3b8',
        accent: '#38bdf8',
        accentGlow: 'rgba(56, 189, 248, 0.4)',
        accentSecondary: '#818cf8',
        yellow: '#fbbf24',
        green: '#34d399',
        red: '#f87171',
        cardBg: '#141d2f',
        cardBorder: '#1e2a42',
        cardHoverBorder: '#38bdf8',
        gradientPrimary: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
        gradientCard: 'linear-gradient(145deg, #141d2f 0%, #0c1222 100%)',
      },
      terminal: {
        background: '#0c1222',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0c1222',
        selectionBackground: '#1e2a42',
        black: '#1e2a42',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      }
    },
    light: {
      ui: {
        bg: '#f0f9ff',
        surface: '#ffffff',
        overlay: '#e0f2fe',
        text: '#0c4a6e',
        subtext: '#0369a1',
        accent: '#0284c7',
        accentGlow: 'rgba(2, 132, 199, 0.3)',
        accentSecondary: '#6366f1',
        yellow: '#d97706',
        green: '#059669',
        red: '#dc2626',
        cardBg: '#ffffff',
        cardBorder: '#e0f2fe',
        cardHoverBorder: '#0284c7',
        gradientPrimary: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
        gradientCard: 'linear-gradient(145deg, #ffffff 0%, #f0f9ff 100%)',
      },
      terminal: {
        background: '#f0f9ff',
        foreground: '#0c4a6e',
        cursor: '#0284c7',
        cursorAccent: '#f0f9ff',
        selectionBackground: '#e0f2fe',
        black: '#64748b',
        red: '#dc2626',
        green: '#059669',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#7c3aed',
        cyan: '#0891b2',
        white: '#0c4a6e',
        brightBlack: '#94a3b8',
        brightRed: '#ef4444',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#8b5cf6',
        brightCyan: '#06b6d4',
        brightWhite: '#020617',
      }
    }
  },

  forest: {
    name: 'Emerald Forest',
    dark: {
      ui: {
        bg: '#0a120a',
        surface: '#121f12',
        overlay: '#1a2e1a',
        text: '#d4e7d4',
        subtext: '#9cb89c',
        accent: '#22c55e',
        accentGlow: 'rgba(34, 197, 94, 0.4)',
        accentSecondary: '#84cc16',
        yellow: '#eab308',
        green: '#22c55e',
        red: '#ef4444',
        cardBg: '#121f12',
        cardBorder: '#1a2e1a',
        cardHoverBorder: '#22c55e',
        gradientPrimary: 'linear-gradient(135deg, #22c55e 0%, #84cc16 100%)',
        gradientCard: 'linear-gradient(145deg, #121f12 0%, #0a120a 100%)',
      },
      terminal: {
        background: '#0a120a',
        foreground: '#d4e7d4',
        cursor: '#22c55e',
        cursorAccent: '#0a120a',
        selectionBackground: '#1a2e1a',
        black: '#1a2e1a',
        red: '#ef4444',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#2dd4bf',
        white: '#d4e7d4',
        brightBlack: '#365936',
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#5eead4',
        brightWhite: '#ffffff',
      }
    },
    light: {
      ui: {
        bg: '#f0fdf4',
        surface: '#ffffff',
        overlay: '#dcfce7',
        text: '#14532d',
        subtext: '#166534',
        accent: '#16a34a',
        accentGlow: 'rgba(22, 163, 74, 0.3)',
        accentSecondary: '#65a30d',
        yellow: '#ca8a04',
        green: '#16a34a',
        red: '#dc2626',
        cardBg: '#ffffff',
        cardBorder: '#dcfce7',
        cardHoverBorder: '#16a34a',
        gradientPrimary: 'linear-gradient(135deg, #16a34a 0%, #65a30d 100%)',
        gradientCard: 'linear-gradient(145deg, #ffffff 0%, #f0fdf4 100%)',
      },
      terminal: {
        background: '#f0fdf4',
        foreground: '#14532d',
        cursor: '#16a34a',
        cursorAccent: '#f0fdf4',
        selectionBackground: '#dcfce7',
        black: '#4d7c4d',
        red: '#dc2626',
        green: '#15803d',
        yellow: '#a16207',
        blue: '#2563eb',
        magenta: '#9333ea',
        cyan: '#0d9488',
        white: '#14532d',
        brightBlack: '#6b8e6b',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#14b8a6',
        brightWhite: '#052e16',
      }
    }
  },

  midnight: {
    name: 'Midnight Purple',
    dark: {
      ui: {
        bg: '#0f0a1a',
        surface: '#1a1225',
        overlay: '#271a38',
        text: '#e4dff0',
        subtext: '#a89bc2',
        accent: '#a855f7',
        accentGlow: 'rgba(168, 85, 247, 0.4)',
        accentSecondary: '#ec4899',
        yellow: '#fbbf24',
        green: '#34d399',
        red: '#f87171',
        cardBg: '#1a1225',
        cardBorder: '#271a38',
        cardHoverBorder: '#a855f7',
        gradientPrimary: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        gradientCard: 'linear-gradient(145deg, #1a1225 0%, #0f0a1a 100%)',
      },
      terminal: {
        background: '#0f0a1a',
        foreground: '#e4dff0',
        cursor: '#a855f7',
        cursorAccent: '#0f0a1a',
        selectionBackground: '#271a38',
        black: '#271a38',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4dff0',
        brightBlack: '#4c3a66',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      }
    },
    light: {
      ui: {
        bg: '#faf5ff',
        surface: '#ffffff',
        overlay: '#f3e8ff',
        text: '#4c1d95',
        subtext: '#6b21a8',
        accent: '#9333ea',
        accentGlow: 'rgba(147, 51, 234, 0.3)',
        accentSecondary: '#db2777',
        yellow: '#d97706',
        green: '#059669',
        red: '#dc2626',
        cardBg: '#ffffff',
        cardBorder: '#f3e8ff',
        cardHoverBorder: '#9333ea',
        gradientPrimary: 'linear-gradient(135deg, #9333ea 0%, #db2777 100%)',
        gradientCard: 'linear-gradient(145deg, #ffffff 0%, #faf5ff 100%)',
      },
      terminal: {
        background: '#faf5ff',
        foreground: '#4c1d95',
        cursor: '#9333ea',
        cursorAccent: '#faf5ff',
        selectionBackground: '#f3e8ff',
        black: '#7e6b99',
        red: '#dc2626',
        green: '#059669',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#a21caf',
        cyan: '#0891b2',
        white: '#4c1d95',
        brightBlack: '#a78bbd',
        brightRed: '#ef4444',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#c026d3',
        brightCyan: '#06b6d4',
        brightWhite: '#2e1065',
      }
    }
  },

  rose: {
    name: 'Rose Gold',
    dark: {
      ui: {
        bg: '#1a0a0f',
        surface: '#251318',
        overlay: '#381c24',
        text: '#f0e4e7',
        subtext: '#c9a8b0',
        accent: '#fb7185',
        accentGlow: 'rgba(251, 113, 133, 0.4)',
        accentSecondary: '#f472b6',
        yellow: '#fbbf24',
        green: '#34d399',
        red: '#fb7185',
        cardBg: '#251318',
        cardBorder: '#381c24',
        cardHoverBorder: '#fb7185',
        gradientPrimary: 'linear-gradient(135deg, #fb7185 0%, #f472b6 100%)',
        gradientCard: 'linear-gradient(145deg, #251318 0%, #1a0a0f 100%)',
      },
      terminal: {
        background: '#1a0a0f',
        foreground: '#f0e4e7',
        cursor: '#fb7185',
        cursorAccent: '#1a0a0f',
        selectionBackground: '#381c24',
        black: '#381c24',
        red: '#fb7185',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#f472b6',
        cyan: '#22d3ee',
        white: '#f0e4e7',
        brightBlack: '#5c3a44',
        brightRed: '#fda4af',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#f9a8d4',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      }
    },
    light: {
      ui: {
        bg: '#fff1f2',
        surface: '#ffffff',
        overlay: '#ffe4e6',
        text: '#881337',
        subtext: '#9f1239',
        accent: '#e11d48',
        accentGlow: 'rgba(225, 29, 72, 0.3)',
        accentSecondary: '#db2777',
        yellow: '#d97706',
        green: '#059669',
        red: '#e11d48',
        cardBg: '#ffffff',
        cardBorder: '#ffe4e6',
        cardHoverBorder: '#e11d48',
        gradientPrimary: 'linear-gradient(135deg, #e11d48 0%, #db2777 100%)',
        gradientCard: 'linear-gradient(145deg, #ffffff 0%, #fff1f2 100%)',
      },
      terminal: {
        background: '#fff1f2',
        foreground: '#881337',
        cursor: '#e11d48',
        cursorAccent: '#fff1f2',
        selectionBackground: '#ffe4e6',
        black: '#99646e',
        red: '#e11d48',
        green: '#059669',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#c026d3',
        cyan: '#0891b2',
        white: '#881337',
        brightBlack: '#b88a92',
        brightRed: '#f43f5e',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#d946ef',
        brightCyan: '#06b6d4',
        brightWhite: '#4c0519',
      }
    }
  },

  arctic: {
    name: 'Arctic Frost',
    dark: {
      ui: {
        bg: '#0a1014',
        surface: '#131a20',
        overlay: '#1c2630',
        text: '#e8eef3',
        subtext: '#9baab8',
        accent: '#67e8f9',
        accentGlow: 'rgba(103, 232, 249, 0.4)',
        accentSecondary: '#a5f3fc',
        yellow: '#fbbf24',
        green: '#34d399',
        red: '#f87171',
        cardBg: '#131a20',
        cardBorder: '#1c2630',
        cardHoverBorder: '#67e8f9',
        gradientPrimary: 'linear-gradient(135deg, #67e8f9 0%, #a5f3fc 100%)',
        gradientCard: 'linear-gradient(145deg, #131a20 0%, #0a1014 100%)',
      },
      terminal: {
        background: '#0a1014',
        foreground: '#e8eef3',
        cursor: '#67e8f9',
        cursorAccent: '#0a1014',
        selectionBackground: '#1c2630',
        black: '#1c2630',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#67e8f9',
        white: '#e8eef3',
        brightBlack: '#3d4f5f',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#a5f3fc',
        brightWhite: '#ffffff',
      }
    },
    light: {
      ui: {
        bg: '#ecfeff',
        surface: '#ffffff',
        overlay: '#cffafe',
        text: '#164e63',
        subtext: '#0e7490',
        accent: '#0891b2',
        accentGlow: 'rgba(8, 145, 178, 0.3)',
        accentSecondary: '#06b6d4',
        yellow: '#d97706',
        green: '#059669',
        red: '#dc2626',
        cardBg: '#ffffff',
        cardBorder: '#cffafe',
        cardHoverBorder: '#0891b2',
        gradientPrimary: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
        gradientCard: 'linear-gradient(145deg, #ffffff 0%, #ecfeff 100%)',
      },
      terminal: {
        background: '#ecfeff',
        foreground: '#164e63',
        cursor: '#0891b2',
        cursorAccent: '#ecfeff',
        selectionBackground: '#cffafe',
        black: '#5b8a99',
        red: '#dc2626',
        green: '#059669',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#9333ea',
        cyan: '#0891b2',
        white: '#164e63',
        brightBlack: '#7da8b5',
        brightRed: '#ef4444',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#083344',
      }
    }
  }
};

export const themeOrder = ['molten', 'ocean', 'forest', 'midnight', 'rose', 'arctic'];

export function applyTheme(themeId, mode) {
  const theme = themes[themeId];
  if (!theme) return;
  
  const variant = theme[mode];
  if (!variant) return;
  
  const root = document.documentElement;
  const ui = variant.ui;
  
  root.style.setProperty('--bg', ui.bg);
  root.style.setProperty('--surface', ui.surface);
  root.style.setProperty('--overlay', ui.overlay);
  root.style.setProperty('--text', ui.text);
  root.style.setProperty('--subtext', ui.subtext);
  root.style.setProperty('--accent', ui.accent);
  root.style.setProperty('--accent-glow', ui.accentGlow);
  root.style.setProperty('--accent-secondary', ui.accentSecondary);
  root.style.setProperty('--yellow', ui.yellow);
  root.style.setProperty('--green', ui.green);
  root.style.setProperty('--red', ui.red);
  root.style.setProperty('--card-bg', ui.cardBg);
  root.style.setProperty('--card-border', ui.cardBorder);
  root.style.setProperty('--card-hover-border', ui.cardHoverBorder);
  root.style.setProperty('--gradient-primary', ui.gradientPrimary);
  root.style.setProperty('--gradient-card', ui.gradientCard);
  
  // Set cursor color from terminal theme for use in CSS
  const terminal = variant.terminal;
  root.style.setProperty('--cursor-color', terminal.cursor);
  
  // Generate and apply custom cursor SVG with theme color
  const cursorColor = terminal.cursor.replace('#', '%23');
  const cursorSvg = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M5 2L5 20L9 16L12 22L15 21L12 15L18 15Z' fill='${cursorColor}' stroke='%23000' stroke-width='1.5'/></svg>") 5 2, default`;
  root.style.setProperty('--cursor-svg', cursorSvg);
  
  // Set shadow variables based on mode
  if (mode === 'dark') {
    root.style.setProperty('--shadow-sm', '0 2px 8px rgba(0, 0, 0, 0.4)');
    root.style.setProperty('--shadow-md', '0 4px 20px rgba(0, 0, 0, 0.6)');
  } else {
    root.style.setProperty('--shadow-sm', '0 2px 4px rgba(0, 0, 0, 0.05)');
    root.style.setProperty('--shadow-md', '0 4px 12px rgba(0, 0, 0, 0.1)');
  }
  root.style.setProperty('--shadow-glow', `0 0 20px ${ui.accentGlow}`);
}

export function getTerminalTheme(themeId, mode) {
  const theme = themes[themeId];
  if (!theme) return themes.molten[mode].terminal;
  return theme[mode]?.terminal || themes.molten[mode].terminal;
}
