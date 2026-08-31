// Fictional handoff session used by every MBL2PC portfolio screen.
//
// The reference captures are genuine screenshots of the maintainer's own
// devices, and they carry a résumé filename with a real name on it. The site
// promises that no real data appears anywhere, so these replicas are rebuilt
// with an invented session instead of publishing the originals.

export const DEMO_APP_NAME = 'mbl2pc';
export const DEMO_PHONE_LABEL = 'Phone';
export const DEMO_DESKTOP_LABEL = 'PC';
export const DEMO_BUILD_LABEL = 'v1.4.2';

// The three themes the app ships, and the accent each one paints the chrome in.
export const DEMO_THEMES = {
  light: { headerFrom: '#6d5bd0', headerTo: '#8b5cf6', accent: '#5b4bc4', page: '#f3f4f8',
    bubbleOwn: '#5b4bc4', bubbleOther: '#e5e7f7', text: '#1f2233', muted: '#6b7086',
    surface: '#ffffff', pinnedBg: '#fdf6e3', line: '#e3e5ee' },
  dark: { headerFrom: '#3b2f7a', headerTo: '#5b3fa8', accent: '#7c6ce0', page: '#171827',
    bubbleOwn: '#4a3ba8', bubbleOther: '#242640', text: '#e8e9f5', muted: '#9a9cb5',
    surface: '#1e2033', pinnedBg: '#252135', line: '#2e3048' },
  ocean: { headerFrom: '#0f7490', headerTo: '#0891b2', accent: '#0e7490', page: '#effcfd',
    bubbleOwn: '#0e7490', bubbleOther: '#dbeafe', text: '#0f2b33', muted: '#5b7a85',
    surface: '#ffffff', pinnedBg: '#eafaff', line: '#cfe9f0' },
};

// A single believable handoff: a link goes to the desktop, a file comes back.
export const DEMO_MESSAGES = [
  {
    device: 'Phone',
    isOwn: true,
    isPinned: true,
    body: 'This link renders better on a PC: https://example.com/design-review',
    trailing: 'Sending it from my phone so I can keep moving between devices.',
    timestamp: '09:14',
  },
  {
    device: 'PC',
    isOwn: false,
    isPinned: true,
    attachment: { name: 'design-review-notes.pdf', hint: 'Tap to download', kind: 'pdf' },
    body: 'Opened it on the desktop and exported the notes. Sending the PDF back so it is on '
      + 'my phone before the call.',
    timestamp: '09:16',
  },
  {
    device: 'Phone',
    isOwn: true,
    body: 'Also saving the intro blurb as a reusable snippet so I can send it again without '
      + 'retyping it.',
    timestamp: '09:18',
  },
];

// The search view narrows to the file handoff and shows the snippet drawer open.
export const DEMO_SEARCH_TERM = 'notes';

export const DEMO_SEARCH_RESULTS = [
  {
    device: 'PC',
    isOwn: false,
    isPinned: true,
    attachment: { name: 'design-review-notes.pdf', hint: 'Tap to download', kind: 'pdf' },
    body: 'Opened it on the desktop and exported the notes. Sending the PDF back so it is on '
      + 'my phone before the call.',
    timestamp: '09:16',
  },
  {
    device: 'PC',
    isOwn: false,
    attachment: { name: 'review-packet.zip', hint: 'Tap to download', kind: 'zip' },
    body: 'Copied the link and the intro note into snippets. File handoff and reusable text are '
      + 'both ready from either device.',
    timestamp: '09:20',
  },
];

export const DEMO_SNIPPETS = [
  { label: 'Intro note', preview: 'Notes attached; the write-up is at https://…' },
  { label: 'PC link', preview: 'This link renders better on a PC and i…' },
  { label: 'Follow-up', preview: 'Happy to walk through how the tooling…' },
];

export const DEMO_PINNED_ROWS = [
  { device: 'Phone', preview: 'This link renders better on a PC: https://exam…' },
  { device: 'PC', preview: 'Opened it on the desktop and exported the not…' },
];
