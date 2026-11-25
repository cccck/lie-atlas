// Module-scoped CSS for #/reps (injected with ui.css, removed with the scope).

export const REPS_CSS = `
.m-reps .panel-section > h3 .katex { text-transform: none; letter-spacing: 0; font-size: 1.12em; color: var(--ink-2); }
.m-reps .view.reps-auto { height: auto; min-height: 0; }
.m-reps .view.reps-auto > .view-body { position: relative; inset: auto; padding: 44px 16px 14px; touch-action: auto; }
.m-reps .reps-mats { display: flex; flex-wrap: wrap; gap: 4px 30px; align-items: center; overflow-x: auto; scrollbar-width: thin; }
.m-reps .reps-mat .katex-display { margin: 0.25em 0; }
.m-reps .reps-mat .katex { font-size: 1.02em; }
.m-reps .reps-mat-note { flex: 1 1 100%; font-size: 13px; color: var(--ink-2); margin-top: 4px; }
.m-reps .reps-mat-note .ok { color: var(--good); font-weight: 600; }

.m-reps .reps-overlay { font-size: 12.5px; color: var(--ink-2); line-height: 1.45; pointer-events: none; }
.m-reps .reps-overlay .katex { font-size: 1em; }
.m-reps .reps-overlay.big { font-size: 13px; }

.m-reps .phase-legend { display: flex; align-items: center; gap: 10px; pointer-events: none; }
.m-reps .phase-ring { position: relative; width: 46px; height: 46px; flex: none; }
.m-reps .phase-ring .ring { position: absolute; inset: 9px; border-radius: 50%;
  -webkit-mask: radial-gradient(circle, transparent 46%, #000 48%); mask: radial-gradient(circle, transparent 46%, #000 48%); }
.m-reps .phase-ring span { position: absolute; font-size: 9.5px; color: var(--muted); line-height: 1; }
.m-reps .phase-ring .r0 { right: -2px; top: 50%; transform: translateY(-50%); }
.m-reps .phase-ring .r1 { top: -1px; left: 50%; transform: translateX(-50%); }
.m-reps .phase-ring .r2 { left: -1px; top: 50%; transform: translateY(-50%); }
.m-reps .phase-ring .r3 { bottom: -1px; left: 50%; transform: translateX(-50%); }
.m-reps .phase-text { font-size: 12px; color: var(--ink-2); line-height: 1.35; }
.m-reps .sign-sw { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: -1px; margin: 0 4px 0 0; }

.m-reps .reps-cg { overflow-x: auto; scrollbar-width: thin; }
.m-reps .reps-cg-head { font-size: 13px; color: var(--ink-2); margin: 0 0 6px; }
.m-reps .reps-cg table { border-collapse: collapse; font-size: 14px; }
.m-reps .reps-cg td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--ink); }
.m-reps .reps-cg tr:last-child td { border-bottom: 0; }
.m-reps .reps-cg td.lhs { white-space: nowrap; }
.m-reps .reps-cg td.eq { color: var(--muted); padding-right: 6px; }
.m-reps .reps-cg tr.sel td { background: color-mix(in srgb, var(--hi) 14%, transparent); }
.m-reps .reps-cg tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--hi); padding-left: 6px; }
.m-reps .reps-cg .katex { font-size: 1.02em; }

.m-reps .reps-group.dim { opacity: 0.55; }
.m-reps .reps-group { transition: opacity 0.15s; }
.m-reps .reps-msg { min-height: 1.4em; font-size: 12.5px; color: var(--ink-2); margin: 4px 0 0; }
`;
