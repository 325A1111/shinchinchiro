import React from 'react';
import { DiceTriplet, DieValue, RollOutcome, YakuType } from '../types/chinchiro';

interface DieFaceProps {
  value: DieValue;
  size?: 'sm' | 'md' | 'lg';
  isRolling?: boolean;
  isHighlightedPoint?: boolean;
  rotationDeg?: number;
}

const PIP_POSITIONS: Record<DieValue, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [26, 26],
    [74, 26],
    [50, 50],
    [26, 74],
    [74, 74],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

export const JapaneseDie: React.FC<DieFaceProps> = ({
  value,
  size = 'lg',
  isRolling = false,
  isHighlightedPoint = false,
  rotationDeg = 0,
}) => {
  const dimensions =
    size === 'lg'
      ? 'w-16 h-16 sm:w-20 sm:h-20 rounded-xl'
      : size === 'md'
        ? 'w-12 h-12 rounded-lg'
        : 'w-8 h-8 rounded-md';

  const pips = PIP_POSITIONS[value];

  return (
    <div
      className={`relative select-none bg-[#FAF6EE] shadow-md transition-transform duration-150 flex items-center justify-center ${dimensions} ${
        isRolling ? 'animate-dice-tumble' : ''
      } ${
        isHighlightedPoint
          ? 'ring-2 ring-[#F59E0B] shadow-[#F59E0B]/25'
          : 'border border-[#D6CFC2]'
      }`}
      style={{
        transform: !isRolling && rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
      }}
      aria-label={`サイコロの目 ${value}`}
    >
      {/* Inner recessed bone bevel */}
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect
          x="6"
          y="6"
          width="88"
          height="88"
          rx="16"
          fill="none"
          stroke="#EBE4D5"
          strokeWidth="2.5"
        />
        {pips.map(([cx, cy], index) => {
          const isRedOne = value === 1;
          const radius = isRedOne ? 19 : value === 4 ? 10.5 : 9.5;
          const fill = isRedOne ? '#DC2626' : '#1C1917';
          return (
            <g key={index}>
              <circle cx={cx} cy={cy + 1.5} r={radius} fill="rgba(0,0,0,0.12)" />
              <circle cx={cx} cy={cy} r={radius} fill={fill} />
              {isRedOne && (
                <circle cx={cx - 5} cy={cy - 5} r={4.5} fill="rgba(255,255,255,0.32)" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface DiceBowlArenaProps {
  dice: DiceTriplet;
  outcome: RollOutcome | null;
  isRolling: boolean;
  activeRollerLabel: string;
  throwNumber: number; // 1..4
  remainingRerolls: number; // 0..3
  maxRerolls: number; // 3
}

export const DiceBowlArena: React.FC<DiceBowlArenaProps> = ({
  dice,
  outcome,
  isRolling,
  activeRollerLabel,
  throwNumber,
  remainingRerolls,
  maxRerolls,
}) => {
  // Determine which die index is the singleton point in DEME so we can subtly highlight it
  let pointDieIndex = -1;
  if (!isRolling && outcome && outcome.yakuType === YakuType.DEME && outcome.pointValue !== null) {
    const [d0, d1, d2] = dice;
    if (d0 === d1) pointDieIndex = 2;
    else if (d1 === d2) pointDieIndex = 0;
    else if (d0 === d2) pointDieIndex = 1;
  }

  const isShonben = !isRolling && outcome?.yakuType === YakuType.SHONBEN;

  const isHighYaku =
    !isRolling &&
    outcome &&
    (outcome.yakuType === YakuType.PINZORO ||
      outcome.yakuType === YakuType.ARASHI ||
      outcome.yakuType === YakuType.SHIGORO);

  const isPenaltyYaku =
    !isRolling &&
    outcome &&
    (outcome.yakuType === YakuType.HIFUMI || outcome.yakuType === YakuType.SHONBEN);

  const rotations = [-6, 5, -4];

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Top Status Line Above Bowl (Zero-Pill clean metadata) */}
      <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#B8B0A4] mb-3 font-mono-tabular">
        <span className="text-[#F5F2EB] font-medium">{activeRollerLabel}</span>
        <span aria-hidden="true">·</span>
        <span>
          {throwNumber === 0 ? '待機中' : `${throwNumber}投目`}
        </span>
        <span aria-hidden="true">·</span>
        <span className={remainingRerolls > 0 ? 'text-[#F59E0B]' : 'text-[#9CA3AF]'}>
          振り直し残り {remainingRerolls}/{maxRerolls}回
        </span>
      </div>

      {/* Traditional Ceramic Donburi Bowl */}
      <div className="relative flex items-center justify-center my-1">
        <div
          className={`relative w-64 h-64 sm:w-76 sm:h-76 rounded-full flex items-center justify-center transition-transform duration-150 ${
            isRolling ? 'animate-bowl-shake' : ''
          }`}
          style={{
            background:
              'radial-gradient(circle at 50% 45%, #2D2620 0%, #1E1915 58%, #120F0D 88%, #3A2E25 97%, #1A1410 100%)',
            boxShadow:
              'inset 0 12px 28px rgba(0,0,0,0.85), inset 0 0 0 6px #46372B, 0 18px 40px rgba(0,0,0,0.75)',
          }}
        >
          {/* Decorative Traditional Ceramic Inner Rings */}
          <svg
            viewBox="0 0 300 300"
            className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
          >
            <circle
              cx="150"
              cy="150"
              r="134"
              fill="none"
              stroke="#8C6D46"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <circle
              cx="150"
              cy="150"
              r="118"
              fill="none"
              stroke="#6E5536"
              strokeWidth="1"
            />
            <circle
              cx="150"
              cy="150"
              r="52"
              fill="none"
              stroke="#57432A"
              strokeWidth="1.2"
            />
          </svg>

          {/* 3 Dice arranged naturally inside the bowl */}
          <div className="relative z-10 flex items-center justify-center gap-3 sm:gap-4 px-4">
            {dice.map((val, idx) => {
              const offsetClasses =
                idx === 0
                  ? '-translate-y-3'
                  : idx === 1
                    ? 'translate-y-4'
                    : '-translate-y-2';

              // If Shonben, 3rd die hops outside the bowl rim
              const shonbenClass =
                isShonben && idx === 2 ? 'translate-x-20 -translate-y-24 opacity-90' : offsetClasses;

              return (
                <div key={idx} className={`transition-transform duration-150 ${shonbenClass}`}>
                  <JapaneseDie
                    value={val}
                    size="lg"
                    isRolling={isRolling}
                    isHighlightedPoint={pointDieIndex === idx}
                    rotationDeg={rotations[idx]}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Outcome Callout Banner Below Bowl */}
      <div className="mt-4 min-h-[4.25rem] flex flex-col items-center justify-center text-center px-4">
        {isRolling ? (
          <div className="text-base sm:text-lg font-display text-[#E5DEC9] tracking-wider">
            ちん・ちろ・りん…！
          </div>
        ) : outcome ? (
          <>
            <div className="flex items-baseline justify-center gap-3">
              <span
                className={`text-2xl sm:text-3xl font-bold font-display tracking-tight ${
                  isHighYaku
                    ? 'text-[#F59E0B]'
                    : isPenaltyYaku
                      ? 'text-[#EF4444]'
                      : outcome.yakuType === YakuType.MENASHI
                        ? 'text-[#A8A29E]'
                        : 'text-[#F5F2EB]'
                }`}
              >
                {outcome.label}
              </span>
              <span className="text-xs sm:text-sm text-[#B8B0A4] font-mono-tabular">
                [{outcome.dice.join(' · ')}]
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#B8B0A4] mt-1 max-w-md">
              {outcome.reading} — {outcome.description}
            </p>
          </>
        ) : (
          <p className="text-xs sm:text-sm text-[#A8A29E]">
            賭け金を決めて「サイコロを振る」を押してください（振り直しは最大3回まで可能）
          </p>
        )}
      </div>
    </div>
  );
};
