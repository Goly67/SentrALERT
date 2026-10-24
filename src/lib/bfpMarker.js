// BFP marker: minimal shield with a clear, classic two-tone flame.
// The only animation (flame flicker) lives in styles.css under .bfp-flame.
export const BFP_MARKER_SVG = `
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="bfp-shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#24508F" />
        <stop offset="1" stop-color="#0E2240" />
      </linearGradient>
      <linearGradient id="bfp-fire-outer" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FF9A2E" />
        <stop offset="1" stop-color="#F0391B" />
      </linearGradient>
      <linearGradient id="bfp-fire-inner" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFF6D0" />
        <stop offset="1" stop-color="#FFD046" />
      </linearGradient>
    </defs>

    <path d="M24 3.5 40 9v13.5c0 9-6.4 15.6-16 21C14.4 38.1 8 31.5 8 22.5V9L24 3.5Z" fill="url(#bfp-shield)" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round" />

    <g class="bfp-flame">
      <!-- outer flame: pointed tip, side lick, round base -->
      <path d="M24 11C24.5 15.5 30.5 18.5 30.5 26C30.5 31.8 27.7 35.5 24 35.5C20.3 35.5 17.5 31.8 17.5 26C17.5 22.5 19.3 20.3 20.8 18.5C21.3 20.5 22.2 21.8 23.2 22.4C23.6 18.8 22.6 14.8 24 11Z" fill="url(#bfp-fire-outer)" />
      <!-- inner flame -->
      <path d="M24 22C24.3 25 27 26.5 27 30C27 32.7 25.7 34.2 24 34.2C22.3 34.2 21 32.7 21 30C21 27.5 23 25.8 24 22Z" fill="url(#bfp-fire-inner)" />
    </g>
  </svg>`;