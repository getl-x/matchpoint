export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const paths = {
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
 bracket:'<path d="M3 5h5v5h8V5h5M3 19h5v-5h8v5h5m-9-9v4"/><circle cx="3" cy="5" r="1"/><circle cx="21" cy="19" r="1"/>',
 star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 chevron:'<path d="m8 10 4 4 4-4"/>', arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
 left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
 bell:'<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9m4 12h4"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>', check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 trophy:'<path d="M7 3h10v6a5 5 0 0 1-10 0Zm-1 2H3v4a4 4 0 0 0 5 4m10-8h3v4a4 4 0 0 1-5 4m-4 2v5m-4 1h8"/>',
 play:'<path d="m9 5 11 7-11 7Z"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13 0M18.5 17a8 8 0 0 1-13 0"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', link:'<path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
 share:'<path d="M12 15V3m-4 4 4-4 4 4M7 11H4v10h16V11h-3"/>'
};
export const icon = (name,cls='') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
export const gameIcon = id => {
 const shapes = {valorant:'<path d="M3 5v9l7 7h8L3 5Zm18 0-9 10h9V5Z"/>',cs2:'<path d="m4 16 4-4 2 2 4-7 3 1-3 7 6 3-1 3-9-4-3 3Zm10-14h5v3h-5Z"/>',lol:'<path d="M7 3h5v15h8l-3 4H7V3Z"/><path d="m16 3 4 4-4 4V3Z" opacity=".45"/>',apex:'<path d="m12 2 10 19h-7l-3-5-3 5H2L12 2Zm0 7-4 8h3l1-2 1 2h3l-4-8Z" fill-rule="evenodd"/>'};
 return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${shapes[id] || '<path d="m5 5 5 5-5 5-5-5ZM17 9l5 5-5 5-5-5Z"/>'}</svg>`;
};
