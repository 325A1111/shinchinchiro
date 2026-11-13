import {
  CpuOpponentId,
  CpuOpponentProfile,
  DiceTriplet,
  DieValue,
  RerollRuleMode,
  RollOutcome,
  YakuType,
} from '../types/chinchiro';

import masterAvatarUrl from '../assets/images/cpu_opponent_master_1790914860507.jpg';
import challengerAvatarUrl from '../assets/images/cpu_opponent_challenger_1790914870898.jpg';
import tableBackdropUrl from '../assets/images/chinchiro_tatami_backdrop_1790914848328.jpg';

export const ASSETS = {
  masterAvatarUrl,
  challengerAvatarUrl,
  tableBackdropUrl,
};

const KANJI_NUMS: Record<DieValue, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
};

export const CPU_OPPONENTS: Record<CpuOpponentId, CpuOpponentProfile> = {
  GENZO: {
    id: 'GENZO',
    name: '宗匠・源蔵',
    title: '老舗雀荘の帳場主',
    styleDescription: '堅実な判断で四の目以上を手堅く確定させる熟練の打ち手。',
    avatarPath: masterAvatarUrl,
    riskTolerance: 'CAUTIOUS',
    quotes: {
      greeting: '「ほう、良い面構えだ。茶碗の音が澄むまで存分に振ってみな。」',
      rolling: '「さて、賽の目というのは欲をかくと逃げるものよ…」',
      reroll: '「まだ目が定まらん。もうひと振り、茶碗に問うてみよう。」',
      highYaku: '「ふっ、これだからチンチロはやめられん。文句なしの役目だ。」',
      lowRoll: '「むう、手が滑ったか。これも博打の常よ。」',
      winRound: '「年季の違いというやつだな。次はどう出る？」',
      loseRound: '「見事な勝負勘だ。今のひと振りは素直に兜を脱ごう。」',
    },
  },
  TATSUKICHI: {
    id: 'TATSUKICHI',
    name: '勝負師・辰吉',
    title: '深川通りの鉄火打ち',
    styleDescription: '低い出目を嫌い、残り振り直し回数を限界まで使って大役・高目を狙う荒波型。',
    avatarPath: challengerAvatarUrl,
    riskTolerance: 'AGGRESSIVE',
    quotes: {
      greeting: '「ちんちろりん、と景気よく鳴らそうじゃねえか！振り直し3回、真っ向勝負だ！」',
      rolling: '「行くぜ、どんぶりの底から大役を呼び込んでやる！」',
      reroll: '「こんな安目で降りられるかい！もう一回振り直しだ！」',
      highYaku: '「見たか！これが深川仕込みの豪運よ！」',
      lowRoll: '「ちっ、賽が暴れやがったか…！」',
      winRound: '「へへっ、悪いな！流れはこっちに向いてるぜ！」',
      loseRound: '「くぅ〜っ、今の目は強え！次は倍返しだ！」',
    },
  },
};

export function rollSingleDie(): DieValue {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(1);
    // Rejection sampling: 252 is the largest multiple of 6 <= 255
    while (true) {
      globalThis.crypto.getRandomValues(buf);
      if (buf[0] < 252) {
        return ((buf[0] % 6) + 1) as DieValue;
      }
    }
  }
  return (Math.floor(Math.random() * 6) + 1) as DieValue;
}

export function generateRandomTriplet(): DiceTriplet {
  return [rollSingleDie(), rollSingleDie(), rollSingleDie()];
}

export function evaluateDiceRoll(dice: DiceTriplet, isShonben: boolean = false): RollOutcome {
  if (isShonben) {
    return {
      dice,
      yakuType: YakuType.SHONBEN,
      label: 'ションベン',
      reading: '茶碗外飛び出し・一倍払い',
      pointValue: null,
      strengthRank: 2,
      multiplier: 1,
      isPenalty: true,
      description: '賽が茶碗の外へ飛び出した反則負け。即座に一倍払いとなります。',
    };
  }

  const sorted = [...dice].sort((a, b) => a - b) as DiceTriplet;
  const [a, b, c] = sorted;

  // 1. All three match (Pinzoro or Arashi)
  if (a === b && b === c) {
    if (a === 1) {
      return {
        dice,
        yakuType: YakuType.PINZORO,
        label: 'ピンゾロ',
        reading: '一ゾロ最高役・五倍づけ',
        pointValue: 1,
        strengthRank: 100,
        multiplier: 5,
        isPenalty: false,
        description: '三つの賽すべてが一の目。チンチロリン最強の役で賭け金の5倍を獲得します。',
      };
    }
    return {
      dice,
      yakuType: YakuType.ARASHI,
      label: `${KANJI_NUMS[a]}ゾロ（アラシ）`,
      reading: `${KANJI_NUMS[a]}の三つ揃い・三倍づけ`,
      pointValue: a,
      strengthRank: 80 + a, // 82..86
      multiplier: 3,
      isPenalty: false,
      description: `${KANJI_NUMS[a]}の目が三つ揃った大役。賭け金の3倍を獲得します。`,
    };
  }

  // 2. Shigoro [4, 5, 6]
  if (a === 4 && b === 5 && c === 6) {
    return {
      dice,
      yakuType: YakuType.SHIGORO,
      label: 'シゴロ',
      reading: '四・五・六揃い・二倍づけ',
      pointValue: 6,
      strengthRank: 70,
      multiplier: 2,
      isPenalty: false,
      description: '四・五・六の順目。通常の出目をすべて上回り、賭け金の2倍を獲得します。',
    };
  }

  // 3. Hifumi [1, 2, 3]
  if (a === 1 && b === 2 && c === 3) {
    return {
      dice,
      yakuType: YakuType.HIFUMI,
      label: 'ヒフミ',
      reading: '一・二・三揃い・二倍払い',
      pointValue: 0,
      strengthRank: 1,
      multiplier: 2,
      isPenalty: true,
      description: '一・二・三の厄目。最弱の目であり、賭け金の2倍を支払う痛恨の役です。',
    };
  }

  // 4. Pair + 1 point (Demé)
  if (a === b || b === c) {
    const point = (a === b ? c : a) as DieValue;
    const pairVal = (a === b ? a : b) as DieValue;
    return {
      dice,
      yakuType: YakuType.DEME,
      label: `${KANJI_NUMS[point]}の目`,
      reading: `${KANJI_NUMS[pairVal]}対子＋出目${KANJI_NUMS[point]}・一倍勝負`,
      pointValue: point,
      strengthRank: 10 + point, // 11 (1の目) .. 16 (6の目)
      multiplier: 1,
      isPenalty: false,
      description: `${KANJI_NUMS[pairVal]}が二つ揃い、残った「${KANJI_NUMS[point]}（${point}）」が勝負の強さとなります。`,
    };
  }

  // 5. Menashi (No combination)
  return {
    dice,
    yakuType: YakuType.MENASHI,
    label: '目なし',
    reading: '役・出目なし（振り直し対象）',
    pointValue: null,
    strengthRank: 5,
    multiplier: 1,
    isPenalty: false,
    description: 'ペアも順目も揃っていない状態。残り回数があれば振り直しを行います。',
  };
}

/**
 * Determines if the player/CPU can re-roll given the current outcome, remaining re-rolls, and rule mode.
 */
export function canPerformReroll(
  outcome: RollOutcome | null,
  remainingRerolls: number,
  ruleMode: RerollRuleMode
): boolean {
  if (!outcome || remainingRerolls <= 0) return false;
  if (outcome.yakuType === YakuType.SHONBEN) return false;

  if (ruleMode === 'FREE_UP_TO_3') {
    // In FREE_UP_TO_3 mode, user can re-roll up to 3 times on any non-Shonben roll to test luck or escape bad rolls
    return true;
  }

  // In STRICT_MENASHI_3 mode, only MENASHI can be re-rolled
  return outcome.yakuType === YakuType.MENASHI;
}

/**
 * Determines whether the CPU chooses to use one of its remaining re-rolls.
 */
export function shouldCpuReroll(
  currentOutcome: RollOutcome,
  remainingRerolls: number,
  ruleMode: RerollRuleMode,
  opponent: CpuOpponentProfile,
  targetOutcomeToBeat: RollOutcome | null
): boolean {
  if (!canPerformReroll(currentOutcome, remainingRerolls, ruleMode)) {
    return false;
  }

  // Always re-roll MENASHI if allowed
  if (currentOutcome.yakuType === YakuType.MENASHI) {
    return true;
  }

  // In strict mode, only Menashi can be re-rolled anyway
  if (ruleMode === 'STRICT_MENASHI_3') {
    return false;
  }

  // In FREE_UP_TO_3 mode, CPU makes strategic decisions:
  // Never re-roll Pinzoro, Arashi, Shigoro, or 6の目
  if (
    currentOutcome.yakuType === YakuType.PINZORO ||
    currentOutcome.yakuType === YakuType.ARASHI ||
    currentOutcome.yakuType === YakuType.SHIGORO ||
    currentOutcome.strengthRank >= 16
  ) {
    return false;
  }

  // Always re-roll Hifumi or 1の目 if free re-rolls remain
  if (currentOutcome.yakuType === YakuType.HIFUMI || currentOutcome.strengthRank <= 11) {
    return true;
  }

  // If CPU is rolling second (Player already locked in targetOutcomeToBeat)
  if (targetOutcomeToBeat) {
    if (currentOutcome.strengthRank < targetOutcomeToBeat.strengthRank) {
      // Currently losing to player's locked hand -> definitely re-roll!
      return true;
    }
    if (
      currentOutcome.strengthRank === targetOutcomeToBeat.strengthRank &&
      opponent.riskTolerance === 'AGGRESSIVE' &&
      currentOutcome.strengthRank <= 14
    ) {
      // Aggressive CPU tries to break a low tie
      return true;
    }
    // Already beating the player! Lock it in.
    return false;
  }

  // CPU is rolling first (Oya):
  const threshold = opponent.riskTolerance === 'AGGRESSIVE' ? 14 : 13; // Aggressive rerolls 2,3,4; Cautious rerolls 2,3
  return currentOutcome.strengthRank <= threshold;
}

/**
 * Compares Player and CPU final outcomes and computes the winner and payout multiplier.
 */
export function settleRoundOutcomes(
  playerOutcome: RollOutcome,
  cpuOutcome: RollOutcome,
  betAmount: number
): {
  winner: 'PLAYER' | 'CPU' | 'DRAW';
  appliedMultiplier: number;
  netDeltaPlayer: number;
  summaryReason: string;
} {
  if (playerOutcome.strengthRank === cpuOutcome.strengthRank) {
    return {
      winner: 'DRAW',
      appliedMultiplier: 0,
      netDeltaPlayer: 0,
      summaryReason: `双方「${playerOutcome.label}」で同格引き分け（賭け金返還）`,
    };
  }

  const playerWins = playerOutcome.strengthRank > cpuOutcome.strengthRank;

  if (playerWins) {
    // Multiplier is the higher of player's winning multiplier or CPU's penalty multiplier (e.g., if CPU rolled Hifumi 2x)
    const effectiveMultiplier = Math.max(
      playerOutcome.multiplier,
      cpuOutcome.isPenalty ? cpuOutcome.multiplier : 1
    );
    const delta = betAmount * effectiveMultiplier;
    const rateText = effectiveMultiplier > 1 ? `（${effectiveMultiplier}倍配当）` : '';
    return {
      winner: 'PLAYER',
      appliedMultiplier: effectiveMultiplier,
      netDeltaPlayer: delta,
      summaryReason: `あなたの「${playerOutcome.label}」がCPUの「${cpuOutcome.label}」に勝利${rateText}`,
    };
  } else {
    const effectiveMultiplier = Math.max(
      cpuOutcome.multiplier,
      playerOutcome.isPenalty ? playerOutcome.multiplier : 1
    );
    const delta = -betAmount * effectiveMultiplier;
    const rateText = effectiveMultiplier > 1 ? `（${effectiveMultiplier}倍払い）` : '';
    return {
      winner: 'CPU',
      appliedMultiplier: effectiveMultiplier,
      netDeltaPlayer: delta,
      summaryReason: `CPUの「${cpuOutcome.label}」があなたの「${playerOutcome.label}」に勝利${rateText}`,
    };
  }
}

export interface YakuReferenceItem {
  name: string;
  diceExample: DiceTriplet;
  payoutLabel: string;
  probabilityText: string;
  combinationsText: string;
  tierLabel: string;
  description: string;
}

export const YAKU_REFERENCE_LIST: YakuReferenceItem[] = [
  {
    name: 'ピンゾロ（一ゾロ）',
    diceExample: [1, 1, 1],
    payoutLabel: '5倍づけ',
    probabilityText: '0.46%',
    combinationsText: '1 / 216 通り',
    tierLabel: '最高役',
    description: '1の目が3つ揃った最強の役。無条件で賭け金の5倍を総取りします。',
  },
  {
    name: 'アラシ（二〜六のゾロ目）',
    diceExample: [6, 6, 6],
    payoutLabel: '3倍づけ',
    probabilityText: '2.31%',
    combinationsText: '5 / 216 通り',
    tierLabel: '上位役',
    description: '2〜6の同じ目が3つ揃った大役。数字が大きいほど強く（六ゾロ＞二ゾロ）、賭け金の3倍を獲得します。',
  },
  {
    name: 'シゴロ（四・五・六）',
    diceExample: [4, 5, 6],
    payoutLabel: '2倍づけ',
    probabilityText: '2.78%',
    combinationsText: '6 / 216 通り',
    tierLabel: '順目役',
    description: '4・5・6の順目。通常の出目（六の目以下）すべてに勝ち、賭け金の2倍を獲得します。',
  },
  {
    name: '通常の出目（六の目〜一の目）',
    diceExample: [3, 3, 5],
    payoutLabel: '1倍勝負',
    probabilityText: '41.67%',
    combinationsText: '90 / 216 通り',
    tierLabel: '通常目',
    description: '2つの賽が揃い、残り1つの賽の数字が自分の「出目」になります。六の目が最強、一の目（ピン）が最弱です。',
  },
  {
    name: '目なし（役・出目なし）',
    diceExample: [1, 3, 5],
    payoutLabel: '振り直し / 1倍負け',
    probabilityText: '50.00%',
    combinationsText: '108 / 216 通り',
    tierLabel: '未確定',
    description: 'ペアも順目もない状態（1投あたり50%で発生）。最大3回まで振り直しが可能で、最後まで目なしの場合は一の目より弱い負け目となります。',
  },
  {
    name: 'ヒフミ（一・二・三）',
    diceExample: [1, 2, 3],
    payoutLabel: '2倍払い',
    probabilityText: '2.78%',
    combinationsText: '6 / 216 通り',
    tierLabel: '厄目',
    description: '1・2・3の順目。チンチロリン最弱の厄目であり、負けると賭け金の2倍を支払います。',
  },
];
