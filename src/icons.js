// 24px stroke icons
const svg = body => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICONS = {
  hand: svg('<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5v-7a1.5 1.5 0 0 1 3 0V11M14 6a1.5 1.5 0 0 1 3 0v5M17 8a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.6 14.6a1.6 1.6 0 0 1 2.6-1.9L8 15"/>'),
  pencil: svg('<path d="M16.5 3.5l4 4L8 20H4v-4z"/><path d="M13.5 6.5l4 4"/>'),
  eraser: svg('<path d="M20 20H9.5L4 14.5a2 2 0 0 1 0-2.8L12.7 3a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20"/><path d="M8 9l7 7"/>'),
  line: svg('<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>'),
  rect: svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  ellipse: svg('<circle cx="12" cy="12" r="8"/>'),
  fill: svg('<path d="M4.5 11.5L12 4l7.5 7.5L12 19z"/><path d="M4.5 11.5h15"/><path d="M20 15.5c.8 1.3 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.7-1.7 1.5-3z"/>'),
  select: svg('<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M11 4h2M11 20h2M4 11v2M20 11v2"/>'),
  picker: svg('<path d="M14.5 4.5l5 5-2 2-5-5z"/><path d="M13 7L5 15v4h4l8-8"/>'),
  measure: svg('<path d="M3.5 16.5L16.5 3.5l4 4-13 13z"/><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>'),
  zone: svg('<path d="M5 21V4h12l-2.5 4.5L17 13H5"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>'),
}
