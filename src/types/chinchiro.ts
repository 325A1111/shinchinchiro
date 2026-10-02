export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export type DiceTriplet = [DieValue, DieValue, DieValue];

export enum YakuType {
  PINZORO = 'PINZORO',   // [1, 1, 1] -> 5x win
  ARASHI = 'ARASHI',     // [2..6, 2..6, 2..6] -> 3x win
  SHIGORO = 'SHIGORO',   // [4, 5, 6] -> 2x win
  DEME = 'DEME',         // Pair + 1 point (6 > 5 > 4 > 3 > 2 > 1) -> 1x
  MENASHI = 'MENASHI',   // No combination -> 1x loss if final
  SHONBEN = 'SHONBEN',   // Out of bowl -> 1x instant loss
  HIFUMI = 'HIFUMI',     // [1, 2, 3] -> 2x penalty loss
}

export interface RollOutcome {
  dice: DiceTriplet;
  yakuType: YakuType;
  label: string;           // e.g. "ピンゾロ", "五のアラシ", "シゴロ", "四の目", "目なし", "ヒフミ"
  reading: string;         // e.g. "一ゾロ・五倍づけ", "三倍づけ"
  pointValue: number | null; // For DEME (1..6) or ARASHI (2..6)
  strengthRank: number;    // Numeric score for comparing two outcomes directly (1..100)
  multiplier: number;      // Base payout multiplier (5, 3, 2, 1, 2 for Hifumi penalty)
  isPenalty: boolean;      // True for HIFUMI or SHONBEN
  description: string;
}

export type RerollRuleMode = 'FREE_UP_TO_3' | 'STRICT_MENASHI_3';

export type ActiveTab = 'ARENA' | 'YAKU_GUIDE' | 'HISTORY' | 'RULES';

export type TurnPhase =
  | 'BETTING'
  | 'PLAYER_ROLLING'
  | 'CPU_ROLLING'
  | 'ROUND_RESULT'
  | 'MATCH_OVER';

export type CpuOpponentId = 'GENZO' | 'TATSUKICHI';

export interface CpuOpponentProfile {
  id: CpuOpponentId;
  name: string;
  title: string;
  styleDescription: string;
  avatarPath: string;
  riskTolerance: 'CAUTIOUS' | 'AGGRESSIVE';
  quotes: {
    greeting: string;
    rolling: string;
    reroll: string;
    highYaku: string;
    lowRoll: string;
    winRound: string;
    loseRound: string;
  };
}

export interface RoundHistoryRecord {
  roundNumber: number;
  dealer: 'PLAYER' | 'CPU';
  betAmount: number;
  playerOutcome: RollOutcome;
  playerRerollsUsed: number;
  cpuOutcome: RollOutcome;
  cpuRerollsUsed: number;
  winner: 'PLAYER' | 'CPU' | 'DRAW';
  appliedMultiplier: number;
  netDeltaPlayer: number;
  summaryReason: string;
}
