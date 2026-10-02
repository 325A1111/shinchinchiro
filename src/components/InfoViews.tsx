import React from 'react';
import {
  CpuOpponentId,
  RerollRuleMode,
  RoundHistoryRecord,
} from '../types/chinchiro';
import { CPU_OPPONENTS, YAKU_REFERENCE_LIST } from '../utils/chinchiroLogic';
import { JapaneseDie } from './DiceBowlArena';
import { AvatarWithFallback } from './AvatarWithFallback';

export const YakuGuideView: React.FC<{ onReturnToArena: () => void }> = ({
  onReturnToArena,
}) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <p className="text-xs text-[#A8A29E] mb-1">
            01. 役と配当の序列 · 全216通りの組み合わせ
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-[#F5F2EB]">
            チンチロリン 役・配当一覧
          </h1>
        </div>
        <button
          onClick={onReturnToArena}
          className="px-4 py-2 text-xs font-medium bg-[#DC2626] text-white rounded-lg hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0"
        >
          対局卓へ戻る
        </button>
      </div>

      <div className="divide-y divide-white/10 mt-4">
        {YAKU_REFERENCE_LIST.map((item, idx) => (
          <div
            key={item.name}
            className="py-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
          >
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2 text-xs text-[#A8A29E] font-mono-tabular">
                <span>0{idx + 1}</span>
                <span aria-hidden="true">·</span>
                <span>{item.tierLabel}</span>
                <span aria-hidden="true">·</span>
                <span>出現率 {item.probabilityText}</span>
                <span aria-hidden="true">·</span>
                <span>{item.combinationsText}</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold font-display text-[#F5F2EB]">
                {item.name}
              </h2>
              <p className="text-sm text-[#B8B0A4] leading-relaxed">
                {item.description}
              </p>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
              <div className="flex items-center gap-2">
                {item.diceExample.map((val, dIdx) => (
                  <JapaneseDie key={dIdx} value={val} size="md" />
                ))}
              </div>
              <div className="text-right min-w-[6.5rem]">
                <div className="text-xs text-[#A8A29E]">配当倍率</div>
                <div className="text-base sm:text-lg font-bold font-mono-tabular text-[#F59E0B]">
                  {item.payoutLabel}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface MatchHistoryViewProps {
  history: RoundHistoryRecord[];
  onClearHistory: () => void;
  onReturnToArena: () => void;
}

export const MatchHistoryView: React.FC<MatchHistoryViewProps> = ({
  history,
  onClearHistory,
  onReturnToArena,
}) => {
  const totalRounds = history.length;
  const playerWins = history.filter((r) => r.winner === 'PLAYER').length;
  const cpuWins = history.filter((r) => r.winner === 'CPU').length;
  const draws = history.filter((r) => r.winner === 'DRAW').length;
  const netProfit = history.reduce((acc, r) => acc + r.netDeltaPlayer, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <p className="text-xs text-[#A8A29E] mb-1">
            02. 通算対局ログ · 収支推移
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-[#F5F2EB]">
            対局戦績・出目履歴
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="px-4 py-2 text-xs font-medium text-[#B8B0A4] hover:text-white border border-white/15 rounded-lg transition-colors whitespace-nowrap"
            >
              戦績をリセット
            </button>
          )}
          <button
            onClick={onReturnToArena}
            className="px-4 py-2 text-xs font-medium bg-[#DC2626] text-white rounded-lg hover:bg-[#B91C1C] transition-colors whitespace-nowrap"
          >
            対局卓へ戻る
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip (Unboxed clean typography) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-6 border-b border-white/10 font-mono-tabular">
        <div>
          <div className="text-xs text-[#A8A29E]">総対局数</div>
          <div className="text-2xl font-semibold text-[#F5F2EB] mt-1">
            {totalRounds}局
          </div>
        </div>
        <div>
          <div className="text-xs text-[#A8A29E]">勝敗内訳</div>
          <div className="text-2xl font-semibold text-[#F5F2EB] mt-1">
            {playerWins}勝 · {cpuWins}敗 · {draws}分
          </div>
        </div>
        <div>
          <div className="text-xs text-[#A8A29E]">勝率</div>
          <div className="text-2xl font-semibold text-[#F5F2EB] mt-1">
            {totalRounds > 0 ? `${Math.round((playerWins / totalRounds) * 100)}%` : '0%'}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#A8A29E]">通算収支</div>
          <div
            className={`text-2xl font-semibold mt-1 ${
              netProfit > 0
                ? 'text-[#10B981]'
                : netProfit < 0
                  ? 'text-[#EF4444]'
                  : 'text-[#F5F2EB]'
            }`}
          >
            {netProfit > 0 ? `+${netProfit.toLocaleString()}` : netProfit.toLocaleString()}両
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="py-16 text-center text-sm text-[#A8A29E]">
          まだ対局履歴がありません。対局卓でサイコロを振ると、各局の出目と振り直し回数が記録されます。
        </div>
      ) : (
        <div className="overflow-x-auto mt-6">
          <table className="w-full text-left border-collapse font-mono-tabular text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-[#A8A29E]">
                <th className="py-3 pr-4 font-normal">局</th>
                <th className="py-3 px-4 font-normal">親番</th>
                <th className="py-3 px-4 font-normal">あなたの出目（振り直し）</th>
                <th className="py-3 px-4 font-normal">CPUの出目（振り直し）</th>
                <th className="py-3 px-4 font-normal">賭け金 · 倍率</th>
                <th className="py-3 pl-4 text-right font-normal">収支結果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {history.map((record) => (
                <tr key={record.roundNumber} className="hover:bg-white/[0.02]">
                  <td className="py-3.5 pr-4 text-[#A8A29E]">
                    第{record.roundNumber}局
                  </td>
                  <td className="py-3.5 px-4 text-[#F5F2EB]">
                    {record.dealer === 'PLAYER' ? 'あなた' : 'CPU'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[#F5F2EB] font-medium">
                      {record.playerOutcome.label}
                    </span>
                    <span className="text-xs text-[#A8A29E] ml-2">
                      [{record.playerOutcome.dice.join('-')}] · 振直{record.playerRerollsUsed}回
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[#F5F2EB] font-medium">
                      {record.cpuOutcome.label}
                    </span>
                    <span className="text-xs text-[#A8A29E] ml-2">
                      [{record.cpuOutcome.dice.join('-')}] · 振直{record.cpuRerollsUsed}回
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[#B8B0A4]">
                    {record.betAmount.toLocaleString()}両
                    {record.appliedMultiplier > 0 ? ` × ${record.appliedMultiplier}倍` : ' · 返還'}
                  </td>
                  <td
                    className={`py-3.5 pl-4 text-right font-semibold ${
                      record.netDeltaPlayer > 0
                        ? 'text-[#10B981]'
                        : record.netDeltaPlayer < 0
                          ? 'text-[#EF4444]'
                          : 'text-[#A8A29E]'
                    }`}
                  >
                    {record.winner === 'PLAYER'
                      ? `勝 +${record.netDeltaPlayer.toLocaleString()}両`
                      : record.winner === 'CPU'
                        ? `負 ${record.netDeltaPlayer.toLocaleString()}両`
                        : '引分 ±0両'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface RulesSettingsViewProps {
  rerollRuleMode: RerollRuleMode;
  onChangeRerollRuleMode: (mode: RerollRuleMode) => void;
  enableShonben: boolean;
  onToggleShonben: (enabled: boolean) => void;
  selectedOpponentId: CpuOpponentId;
  onSelectOpponent: (id: CpuOpponentId) => void;
  startingFunds: number;
  onChangeStartingFunds: (amount: number) => void;
  onStartNewMatch: () => void;
  onReturnToArena: () => void;
}

export const RulesSettingsView: React.FC<RulesSettingsViewProps> = ({
  rerollRuleMode,
  onChangeRerollRuleMode,
  enableShonben,
  onToggleShonben,
  selectedOpponentId,
  onSelectOpponent,
  startingFunds,
  onChangeStartingFunds,
  onStartNewMatch,
  onReturnToArena,
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <p className="text-xs text-[#A8A29E] mb-1">
            03. 対局規定 · 振り直し方式と対戦相手
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-[#F5F2EB]">
            ルール設定・CPU対戦相手選択
          </h1>
        </div>
        <button
          onClick={onReturnToArena}
          className="px-4 py-2 text-xs font-medium bg-[#DC2626] text-white rounded-lg hover:bg-[#B91C1C] transition-colors whitespace-nowrap"
        >
          対局卓へ戻る
        </button>
      </div>

      <div className="space-y-10 mt-8">
        {/* Section 1: Opponent Selection */}
        <div>
          <h2 className="text-lg font-bold font-display text-[#F5F2EB] mb-1">
            01. 対戦相手CPUの選択
          </h2>
          <p className="text-xs text-[#A8A29E] mb-4">
            打ち筋や振り直し判断が異なる2名の雀荘打ち手から対戦相手を選べます。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(CPU_OPPONENTS) as CpuOpponentId[]).map((id) => {
              const opp = CPU_OPPONENTS[id];
              const isSelected = selectedOpponentId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectOpponent(id)}
                  className={`text-left p-5 rounded-xl border transition-colors flex items-start gap-4 ${
                    isSelected
                      ? 'bg-[#26201B] border-[#F59E0B]'
                      : 'bg-[#1C1815] border-white/10 hover:border-white/25'
                  }`}
                >
                  <AvatarWithFallback
                    src={opp.avatarPath}
                    alt={opp.name}
                    fallbackLabel={opp.name}
                    className="w-16 h-16 rounded-lg"
                  />
                  <div className="space-y-1">
                    <div className="text-xs text-[#A8A29E]">
                      {opp.title} · {isSelected ? '選択中' : 'クリックして選択'}
                    </div>
                    <div className="text-base font-bold font-display text-[#F5F2EB]">
                      {opp.name}
                    </div>
                    <p className="text-xs text-[#B8B0A4] leading-relaxed">
                      {opp.styleDescription}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Re-roll Mode */}
        <div className="pt-6 border-t border-white/10">
          <h2 className="text-lg font-bold font-display text-[#F5F2EB] mb-1">
            02. 振り直し（最大3回）の適用ルール
          </h2>
          <p className="text-xs text-[#A8A29E] mb-4">
            「自由振り直し（戦略モード）」では低い出目が出た際にも最大3回まで振り直しを選択できます。「定石ルール」では目なしの時のみ最大3回まで振り直します。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onChangeRerollRuleMode('FREE_UP_TO_3')}
              className={`text-left p-5 rounded-xl border transition-colors ${
                rerollRuleMode === 'FREE_UP_TO_3'
                  ? 'bg-[#26201B] border-[#F59E0B]'
                  : 'bg-[#1C1815] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="text-xs text-[#F59E0B] mb-1">
                推奨 · 駆け引き重視
              </div>
              <div className="text-base font-bold font-display text-[#F5F2EB]">
                自由振り直しモード（振り直し最大3回）
              </div>
              <p className="text-xs text-[#B8B0A4] mt-1.5 leading-relaxed">
                初回ロール後、最大3回まで任意のタイミングで振り直し可能。低い出目（一の目〜三の目）やヒフミから逆転を狙うか、現在の出目で勝負するかを自分で決断できます。
              </p>
            </button>

            <button
              type="button"
              onClick={() => onChangeRerollRuleMode('STRICT_MENASHI_3')}
              className={`text-left p-5 rounded-xl border transition-colors ${
                rerollRuleMode === 'STRICT_MENASHI_3'
                  ? 'bg-[#26201B] border-[#F59E0B]'
                  : 'bg-[#1C1815] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="text-xs text-[#A8A29E] mb-1">
                伝統ルール · 厳格規定
              </div>
              <div className="text-base font-bold font-display text-[#F5F2EB]">
                定石ルール（目なし時のみ最大3回振り直し）
              </div>
              <p className="text-xs text-[#B8B0A4] mt-1.5 leading-relaxed">
                役または通常の出目（一の目〜六の目）が出た時点で即確定し、「目なし」になった場合のみ最大3回まで振り直しを行います。
              </p>
            </button>
          </div>
        </div>

        {/* Section 3: Shonben & Initial Funds */}
        <div className="pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-base font-bold font-display text-[#F5F2EB] mb-1">
              03. ションベン（茶碗外飛び出し）判定
            </h2>
            <p className="text-xs text-[#A8A29E] mb-3">
              有効にすると、約2%の確率で賽が茶碗から飛び出し即一倍負けとなるハプニングが発生します。
            </p>
            <div className="inline-flex p-1 bg-[#1C1815] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => onToggleShonben(true)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  enableShonben
                    ? 'bg-[#F59E0B] text-[#141210]'
                    : 'text-[#B8B0A4] hover:text-white'
                }`}
              >
                あり（本格派）
              </button>
              <button
                type="button"
                onClick={() => onToggleShonben(false)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  !enableShonben
                    ? 'bg-[#F59E0B] text-[#141210]'
                    : 'text-[#B8B0A4] hover:text-white'
                }`}
              >
                なし（純粋出目勝負）
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-base font-bold font-display text-[#F5F2EB] mb-1">
              04. 新規対局時の初期軍資金（プレイヤー）
            </h2>
            <p className="text-xs text-[#A8A29E] mb-3">
              新規対局を開始する際のあなたの初期所持金を設定します（CPUの資金は無制限・∞両）。
            </p>
            <div className="inline-flex p-1 bg-[#1C1815] border border-white/10 rounded-lg font-mono-tabular">
              {[3000, 5000, 10000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => onChangeStartingFunds(amt)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    startingFunds === amt
                      ? 'bg-[#F59E0B] text-[#141210]'
                      : 'text-[#B8B0A4] hover:text-white'
                  }`}
                >
                  {amt.toLocaleString()}両
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-white/10 flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => {
              onStartNewMatch();
              onReturnToArena();
            }}
            className="px-5 py-2.5 text-xs font-medium bg-[#DC2626] text-white rounded-lg hover:bg-[#B91C1C] transition-colors whitespace-nowrap"
          >
            この設定で新規対局を開始
          </button>
        </div>
      </div>
    </div>
  );
};
