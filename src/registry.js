// Table of contents. Module code is loaded lazily on first visit.
// `sym` is TeX for the group/algebra symbol shown in the sidebar and on cards.

export const chapters = [
  { id: 'symmetry', num: 'I', title: 'Symmetry & generators', desc: 'Continuous symmetries, the exponential map and conserved charges.' },
  { id: 'rotations', num: 'II', title: 'Rotations, spin & angular momentum', desc: 'Non-commuting rotations, spinors and multiplets.' },
  { id: 'dynamics', num: 'III', title: 'Phase space & quantum dynamics', desc: 'Hidden symmetries, Hamiltonian flows and the canonical commutator.' },
  { id: 'spacetime', num: 'IV', title: 'Spacetime', desc: 'Boosts, rapidity and the classification of particles.' },
  { id: 'particles', num: 'V', title: 'Internal symmetry & particles', desc: 'Flavour and colour, symmetry breaking and the classification of simple Lie algebras.' },
];

export const modules = [
  {
    id: 'u1',
    chapter: 'symmetry',
    sym: 'U(1)',
    title: 'Phases & charge',
    blurb: 'The circle group. The exponential map wraps the line of generators onto phases $e^{i\\theta}$, and compactness forces charges to be integers.',
    tags: ['abelian', 'compact', 'quantum phase'],
    load: () => import('./modules/u1.js'),
  },
  {
    id: 'torus',
    chapter: 'symmetry',
    sym: 'T^2',
    title: 'Tori & oscillators',
    blurb: 'Two commuting phases. One-parameter subgroups wind around the torus: rational frequency ratios close up, irrational ones fill it densely.',
    tags: ['abelian', 'integrable systems'],
    load: () => import('./modules/torus.js'),
  },
  {
    id: 'so3',
    chapter: 'rotations',
    sym: 'SO(3)',
    title: 'Rotations & angular momentum',
    blurb: 'Axis–angle rotations, the $\\pi$-ball with antipodes glued, and generators obeying $[J_i,J_j]=i\\epsilon_{ijk}J_k$.',
    tags: ['non-abelian', 'compact'],
    load: () => import('./modules/so3.js'),
  },
  {
    id: 'loops',
    chapter: 'rotations',
    sym: '[X,Y]',
    title: 'Commutators as small loops',
    blurb: 'Go around a tiny loop and you return changed by $\\epsilon^2[X,Y]$: rotations, Thomas precession, magnetic flux, curvature and the BCH formula.',
    tags: ['brackets', 'curvature', 'BCH'],
    load: () => import('./modules/loops.js'),
  },
  {
    id: 'su2',
    chapter: 'rotations',
    sym: 'SU(2)',
    title: 'Spin-½ & the double cover',
    blurb: 'A $2\\pi$ rotation flips the sign of a spinor; $4\\pi$ restores it. Dirac’s string trick, the Bloch sphere and Larmor precession.',
    tags: ['spinors', 'double cover', 'quantum'],
    load: () => import('./modules/su2.js'),
  },
  {
    id: 'reps',
    chapter: 'rotations',
    sym: 'D^{(j)}',
    title: 'Spin multiplets & representations',
    blurb: 'Ladder operators, the Casimir $j(j+1)$, spherical harmonics rotated by Wigner D-matrices, and the addition of angular momenta.',
    tags: ['representations', 'quantum'],
    load: () => import('./modules/reps.js'),
  },
  {
    id: 'hopf',
    chapter: 'rotations',
    sym: 'S^3\\!\\to S^2',
    title: 'Hopf fibration & Berry phase',
    blurb: 'Qubit states up to phase form the Bloch sphere; each point is a whole circle in $S^3$. Linked fibres, Berry phase and the Dirac monopole.',
    tags: ['geometry', 'quantum', 'topology'],
    load: () => import('./modules/hopf.js'),
  },
  {
    id: 'kepler',
    chapter: 'dynamics',
    sym: 'SO(4)',
    title: 'Kepler & hidden symmetry',
    blurb: 'Noether: rotations conserve $\\vec L$. A hidden SO(4) conserves the Runge–Lenz vector, closes the orbits and explains the $n^2$ degeneracy of hydrogen.',
    tags: ['Noether', 'classical', 'hydrogen'],
    load: () => import('./modules/kepler.js'),
  },
  {
    id: 'sp2',
    chapter: 'dynamics',
    sym: 'Sp(2,\\R)',
    title: 'Linear phase-space flows',
    blurb: 'Quadratic Hamiltonians generate $\\sp(2,\\R)\\cong\\sl(2,\\R)$: oscillator, free particle, inverted oscillator. Stability, parametric resonance and strong focusing.',
    tags: ['symplectic', 'stability', 'classical'],
    load: () => import('./modules/sp2.js'),
  },
  {
    id: 'heisenberg',
    chapter: 'dynamics',
    sym: 'H_3',
    title: 'Heisenberg group & $[x,p]=i\\hbar$',
    blurb: 'Phase-space translations commute only up to a phase set by the enclosed area: Weyl relations, magnetic translations and the Aharonov–Bohm effect.',
    tags: ['quantum', 'nilpotent'],
    load: () => import('./modules/heisenberg.js'),
  },
  {
    id: 'lorentz',
    chapter: 'spacetime',
    sym: 'SO^+(1,3)',
    title: 'Lorentz group',
    blurb: 'Boosts are hyperbolic rotations with additive rapidity; two non-collinear boosts leave a Wigner rotation. Aberration of the sky and Wigner’s particle classification.',
    tags: ['relativity', 'non-compact'],
    load: () => import('./modules/lorentz.js'),
  },
  {
    id: 'su3',
    chapter: 'particles',
    sym: 'SU(3)',
    title: 'Quarks & the Eightfold Way',
    blurb: 'Weight diagrams of SU(3): quark triplets, meson and baryon octets, the decuplet that predicted the $\\Omega^-$, and colour singlets.',
    tags: ['flavour', 'colour', 'representations'],
    load: () => import('./modules/su3.js'),
  },
  {
    id: 'ssb',
    chapter: 'particles',
    sym: 'G/H',
    title: 'Spontaneous symmetry breaking',
    blurb: 'The vacuum chooses a point on a group orbit $G/H$. Broken generators become massless Goldstone modes; a small explicit breaking gives them mass.',
    tags: ['field theory', 'Goldstone', 'Higgs'],
    load: () => import('./modules/ssb.js'),
  },
  {
    id: 'roots',
    chapter: 'particles',
    sym: '\\Phi',
    title: 'Roots, weights & classification',
    blurb: 'Cartan generators are commuting charges; roots are the charges of ladder operators. Weyl reflections, Dynkin diagrams, grand unification and $E_8$.',
    tags: ['classification', 'GUTs'],
    load: () => import('./modules/roots.js'),
  },
];

/** Routes reachable by URL but not listed in the navigation. */
export const hidden = [
  {
    id: '_template',
    chapter: 'symmetry',
    sym: '\\g',
    title: 'Template (developer reference)',
    blurb: 'Demonstrates the core API.',
    tags: [],
    load: () => import('./modules/_template.js'),
  },
];

export function findModule(id) {
  return modules.find((m) => m.id === id) || hidden.find((m) => m.id === id) || null;
}

export function chapterOf(entry) {
  return chapters.find((c) => c.id === entry.chapter) || chapters[0];
}
