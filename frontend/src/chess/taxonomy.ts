// taxonomy.ts — Principle definitions and Elo gate mappings
// Every coaching lesson maps to a principle from this taxonomy.
// Source of truth: docs/principle-taxonomy.md
// Elo gates: only teach a principle if the user's Elo is in [min, max]

export interface Principle {
  id: string
  name: string
  description: string
  eloMin: number
  eloMax: number
  gamePhases: ('opening' | 'early_middlegame' | 'middlegame' | 'late_middlegame' | 'endgame')[]
  takeawayTemplate: string
}

export interface CategoryDefinition {
  id: string
  name: string
  color: string
  shortLabel: string
}

export const CATEGORIES: Record<string, CategoryDefinition> = {
  hung_piece: {
    id: 'hung_piece',
    name: 'Hung Piece',
    shortLabel: 'Hung Piece',
    color: '#ef4444',
  },
  ignored_threat: {
    id: 'ignored_threat',
    name: 'Ignored Threat',
    shortLabel: 'Ignored Threat',
    color: '#f97316',
  },
  missed_tactic: {
    id: 'missed_tactic',
    name: 'Missed Tactic',
    shortLabel: 'Missed Tactic',
    color: '#eab308',
  },
  aimless_move: {
    id: 'aimless_move',
    name: 'Aimless Move',
    shortLabel: 'Aimless Move',
    color: '#94a3b8',
  },
  didnt_develop: {
    id: 'didnt_develop',
    name: "Didn't Develop",
    shortLabel: 'No Development',
    color: '#38bdf8',
  },
  didnt_castle: {
    id: 'didnt_castle',
    name: "Didn't Castle",
    shortLabel: 'No Castle',
    color: '#8b5cf6',
  },
  unknown: {
    id: 'unknown',
    name: 'General Mistake',
    shortLabel: 'General',
    color: '#64748b',
  },
}

export const PRINCIPLES: Record<string, Principle> = {
  // Opening
  OPENING_01: {
    id: 'OPENING_01',
    name: 'Complete Development First',
    description: 'Develop all minor pieces before launching attacks or pawn advances.',
    eloMin: 0, eloMax: 1600,
    gamePhases: ['opening', 'early_middlegame'],
    takeawayTemplate: 'Before starting any attack, ask: are all my pieces in the game?',
  },
  OPENING_02: {
    id: 'OPENING_02',
    name: 'Castle Early for King Safety',
    description: 'Castle within the first 10-12 moves to get your king safe and connect rooks.',
    eloMin: 0, eloMax: 1400,
    gamePhases: ['opening', 'early_middlegame'],
    takeawayTemplate: 'Your king in the center is a target. Castling tucks it away safely.',
  },
  OPENING_03: {
    id: 'OPENING_03',
    name: "Don't Bring the Queen Out Early",
    description: 'Moving the queen before development wastes time as opponent gains tempo attacking it.',
    eloMin: 0, eloMax: 1200,
    gamePhases: ['opening'],
    takeawayTemplate: 'Every time your opponent attacks your queen, they develop for free.',
  },
  OPENING_04: {
    id: 'OPENING_04',
    name: 'Control the Center',
    description: 'Place pawns and pieces to control d4, d5, e4, e5.',
    eloMin: 0, eloMax: 1400,
    gamePhases: ['opening', 'early_middlegame'],
    takeawayTemplate: 'The center is the highway of the chessboard. Control it.',
  },
  OPENING_05: {
    id: 'OPENING_05',
    name: "Don't Move the Same Piece Twice",
    description: 'Moving the same piece twice in the opening loses development time.',
    eloMin: 0, eloMax: 1400,
    gamePhases: ['opening'],
    takeawayTemplate: 'Every opening move should bring a NEW piece into the game.',
  },

  // Tactical
  TACTICAL_01: {
    id: 'TACTICAL_01',
    name: 'Blunder Check (One-Second Habit)',
    description: 'Before every move: is the piece I\'m moving defending something? Can my opponent capture anything after I move?',
    eloMin: 0, eloMax: 1400,
    gamePhases: ['opening', 'early_middlegame', 'middlegame', 'late_middlegame', 'endgame'],
    takeawayTemplate: 'Before EVERY move: (1) Is the piece I\'m moving defending something? (2) Can my opponent take anything after I move?',
  },
  TACTICAL_02: {
    id: 'TACTICAL_02',
    name: "Don't Ignore Opponent's Threats",
    description: "Before executing your plan, check what your opponent's last move is threatening.",
    eloMin: 0, eloMax: 1600,
    gamePhases: ['opening', 'early_middlegame', 'middlegame', 'late_middlegame', 'endgame'],
    takeawayTemplate: "Your opponent's last move wasn't random. What are they threatening right now?",
  },
  TACTICAL_03: {
    id: 'TACTICAL_03',
    name: 'Look for Forcing Moves First',
    description: 'Consider checks, captures, and threats before quiet moves.',
    eloMin: 1000, eloMax: 1800,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: 'Always look at forcing moves first: checks, captures, and threats.',
  },
  TACTICAL_04: {
    id: 'TACTICAL_04',
    name: 'Back-Rank Awareness',
    description: 'When your king has no escape square, a rook check on the back rank is checkmate.',
    eloMin: 800, eloMax: 1600,
    gamePhases: ['middlegame', 'late_middlegame', 'endgame'],
    takeawayTemplate: "Create a 'luft' (escape square) with h3 or g3 when you have time.",
  },

  // Strategic
  STRATEGIC_01: {
    id: 'STRATEGIC_01',
    name: 'Improve Your Worst Piece',
    description: 'Find the piece doing the least and make it useful.',
    eloMin: 1200, eloMax: 2500,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: 'Which piece is doing the least? That\'s the one to improve.',
  },
  STRATEGIC_02: {
    id: 'STRATEGIC_02',
    name: "Don't Trade When You Have Space Advantage",
    description: 'Trading pieces relieves your opponent\'s cramped position.',
    eloMin: 1200, eloMax: 2500,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: 'When you have space, keep pieces on and let your opponent suffocate.',
  },
  STRATEGIC_03: {
    id: 'STRATEGIC_03',
    name: "Trade Pieces When You're Up Material",
    description: 'When ahead, simplify. Fewer pieces = fewer chances for comeback.',
    eloMin: 1000, eloMax: 1800,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: 'When you\'re up material, trade pieces. Your opponent needs complications.',
  },
  STRATEGIC_04: {
    id: 'STRATEGIC_04',
    name: 'Piece Activity Over Material',
    description: "Don't grab material if it makes your pieces passive.",
    eloMin: 1400, eloMax: 2500,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: 'Before grabbing a pawn, ask: what does it cost me in piece activity?',
  },
  STRATEGIC_05: {
    id: 'STRATEGIC_05',
    name: 'Play With a Plan',
    description: 'Every move should serve a purpose. "Hope chess" leads to passive positions.',
    eloMin: 1000, eloMax: 1800,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: "Before every move, answer: 'what am I trying to achieve?'",
  },
  STRATEGIC_06: {
    id: 'STRATEGIC_06',
    name: "Don't Weaken Your King's Pawn Shield",
    description: 'Pushing pawns in front of your castled king creates permanent weaknesses.',
    eloMin: 800, eloMax: 1800,
    gamePhases: ['middlegame'],
    takeawayTemplate: 'The pawns in front of your king are its bodyguards. Once pushed, they can\'t come back.',
  },
  STRATEGIC_07: {
    id: 'STRATEGIC_07',
    name: 'Control Open Files With Rooks',
    description: 'Open files are highways for rooks. Occupy them first.',
    eloMin: 1200, eloMax: 2500,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: 'Getting your rook on an open file first is often the key advantage.',
  },
  STRATEGIC_08: {
    id: 'STRATEGIC_08',
    name: 'Prophylaxis — What Is My Opponent Trying To Do?',
    description: "Consider your opponent's plan before executing your own.",
    eloMin: 1400, eloMax: 2500,
    gamePhases: ['middlegame', 'late_middlegame'],
    takeawayTemplate: "Sometimes the best move is stopping your opponent's idea before pursuing your own.",
  },

  // Endgame
  ENDGAME_01: {
    id: 'ENDGAME_01',
    name: 'Activate Your King',
    description: 'In the endgame, the king becomes a powerful fighting piece.',
    eloMin: 1000, eloMax: 2500,
    gamePhases: ['endgame'],
    takeawayTemplate: 'In the endgame, march your king toward the center.',
  },
  ENDGAME_02: {
    id: 'ENDGAME_02',
    name: 'Rooks Belong Behind Passed Pawns',
    description: 'Behind your own to support advance, behind opponent\'s to restrain.',
    eloMin: 1400, eloMax: 2500,
    gamePhases: ['endgame'],
    takeawayTemplate: 'Rooks behind passed pawns is one of the most important endgame rules.',
  },
  ENDGAME_03: {
    id: 'ENDGAME_03',
    name: 'Improve Before Breaking Through',
    description: 'Maximize your position before attempting to break through. Patience wins endgames.',
    eloMin: 1200, eloMax: 2500,
    gamePhases: ['endgame'],
    takeawayTemplate: "When you're winning, improve everything before pushing. Patience wins endgames.",
  },

  // Meta
  META_02: {
    id: 'META_02',
    name: 'When Ahead Simplify, When Behind Complicate',
    description: 'Winning? Trade pieces. Losing? Create complications.',
    eloMin: 1200, eloMax: 2500,
    gamePhases: ['middlegame', 'late_middlegame', 'endgame'],
    takeawayTemplate: 'Winning? Trade pieces. Losing? Keep it messy and give your opponent chances to go wrong.',
  },
}

// CLASSIFIER PRIORITY: TACTICAL_01 and TACTICAL_02 SUPPRESS all other principles
// A hanging piece is ALWAYS the lesson. Never also mention pawn structure.
export const PRIORITY_PRINCIPLES = ['TACTICAL_01', 'TACTICAL_02']
