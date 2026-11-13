import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RotateCcw, Dices, Check, Sparkles, ChevronRight } from 'lucide-react';
import {
  ActiveTab,
  CpuOpponentId,
  DiceTriplet,
  RerollRuleMode,
  RollOutcome,
  RoundHistoryRecord,
  TurnPhase,
  YakuType,
} from './types/chinchiro';
import {
  ASSETS,
  canPerformReroll,
  CPU_OPPONENTS,
  generateRandomTriplet,
} from './utils/chinchiroLogic';
import { soundEngine } from './utils/sound';
import { DiceBowlArena, JapaneseDie } from './components/DiceBowlArena';
import { AvatarWithFallback } from './components/AvatarWithFallback';
import {
  MatchHistoryView,
  RulesSettingsView,
  YakuGuideView,
} from './components/InfoViews';

const MAX_REROLLS = 3;
const SESSION_TOKEN_STORAGE_KEY = 'chinchiro_session_token';

interface ServerSessionState {
  opponentId: CpuOpponentId;
  ruleMode: RerollRuleMode;
  enableShonben: boolean;
  startingFunds: number;
  roundNumber: number;
  dealer: 'PLAYER' | 'CPU';
  playerFunds: number;
  betAmount: number;
  turnPhase: 'BETTING' | 'PLAYER_ROLLING' | 'ROUND_RESULT' | 'MATCH_OVER';
  throwNumber: number;
  remainingRerolls: number;
  playerOutcome: RollOutcome | null;
  playerRerollsUsed: number;
  cpuOutcome: RollOutcome | null;
  cpuRerollsUsed: number;
  roundSettlement: {
    winner: 'PLAYER' | 'CPU' | 'DRAW';
    appliedMultiplier: number;
    netDeltaPlayer: number;
    summaryReason: string;
  } | null;
  cpuDialogue: string;
  history: RoundHistoryRecord[];
}

interface CpuRollStep {
  dice: DiceTriplet;
  outcome: RollOutcome;
  throwNumber: number;
  remainingRerolls: number;
  rerollsUsed: number;
  dialogue: string;
}

export default function App() {
  // Navigation & Settings State
  const [activeTab, setActiveTab] = useState<ActiveTab>('ARENA');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [rerollRuleMode, setRerollRuleMode] = useState<RerollRuleMode>('FREE_UP_TO_3');
  const [enableShonben, setEnableShonben] = useState<boolean>(false);
  const [selectedOpponentId, setSelectedOpponentId] = useState<CpuOpponentId>('GENZO');
  const [startingFunds, setStartingFunds] = useState<number>(5000);

  // Match State (Authoritatively synchronized with server)
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [dealer, setDealer] = useState<'PLAYER' | 'CPU'>('PLAYER');
  const [playerFunds, setPlayerFunds] = useState<number>(5000);
  const [betAmount, setBetAmount] = useState<number>(500);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('BETTING');
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  // Active Roll State inside the Bowl
  const [bowlDice, setBowlDice] = useState<DiceTriplet>([1, 1, 1]);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [activeRoller, setActiveRoller] = useState<'PLAYER' | 'CPU'>('PLAYER');
  const [throwNumber, setThrowNumber] = useState<number>(0); // 1 = initial, 2..4 = rerolls 1..3
  const [remainingRerolls, setRemainingRerolls] = useState<number>(MAX_REROLLS);

  // Player & CPU Outcomes for the Current Round
  const [playerOutcome, setPlayerOutcome] = useState<RollOutcome | null>(null);
  const [playerRerollsUsed, setPlayerRerollsUsed] = useState<number>(0);
  const [cpuOutcome, setCpuOutcome] = useState<RollOutcome | null>(null);
  const [cpuRerollsUsed, setCpuRerollsUsed] = useState<number>(0);

  // Round Settlement Result & CPU Dialogue
  const [roundSettlement, setRoundSettlement] = useState<{
    winner: 'PLAYER' | 'CPU' | 'DRAW';
    appliedMultiplier: number;
    netDeltaPlayer: number;
    summaryReason: string;
  } | null>(null);
  const [cpuDialogue, setCpuDialogue] = useState<string>(
    CPU_OPPONENTS.GENZO.quotes.greeting
  );
  const [history, setHistory] = useState<RoundHistoryRecord[]>([]);

  // Session & Timers Refs
  const sessionTokenRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
      : null
  );
  const timerRefs = useRef<number[]>([]);

  const clearAllTimers = () => {
    timerRefs.current.forEach((id) => window.clearTimeout(id));
    timerRefs.current = [];
  };

  const scheduleTimeout = (fn: () => void, delayMs: number) => {
    const id = window.setTimeout(fn, delayMs);
    timerRefs.current.push(id);
    return id;
  };

  const applyServerState = (s: ServerSessionState) => {
    setSelectedOpponentId(s.opponentId);
    setRerollRuleMode(s.ruleMode);
    setEnableShonben(s.enableShonben);
    setStartingFunds(s.startingFunds);
    setRoundNumber(s.roundNumber);
    setDealer(s.dealer);
    setPlayerFunds(s.playerFunds);
    setBetAmount(s.betAmount);
    setTurnPhase(s.turnPhase);
    setThrowNumber(s.throwNumber);
    setRemainingRerolls(s.remainingRerolls);
    setPlayerOutcome(s.playerOutcome);
    setPlayerRerollsUsed(s.playerRerollsUsed);
    setCpuOutcome(s.cpuOutcome);
    setCpuRerollsUsed(s.cpuRerollsUsed);
    setRoundSettlement(s.roundSettlement);
    setCpuDialogue(s.cpuDialogue);
    setHistory(s.history);

    if (s.cpuOutcome && (s.turnPhase === 'ROUND_RESULT' || s.turnPhase === 'MATCH_OVER')) {
      setActiveRoller('CPU');
      setBowlDice(s.cpuOutcome.dice);
    } else if (s.playerOutcome) {
      setActiveRoller('PLAYER');
      setBowlDice(s.playerOutcome.dice);
    } else {
      setActiveRoller('PLAYER');
      setBowlDice([1, 1, 1]);
    }
  };

  const apiRequest = async <T,>(
    endpoint: string,
    method: 'POST' | 'PATCH' | 'GET',
    body?: Record<string, unknown>
  ): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionTokenRef.current) {
      headers['X-Session-Token'] = sessionTokenRef.current;
    }

    const res = await fetch(endpoint, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.error === 'string'
          ? data.error
          : '通信エラーが発生しました。'
      );
    }
    return data as T;
  };

  const initSession = async () => {
    try {
      const data = await apiRequest<{
        sessionToken: string;
        state: ServerSessionState;
      }>('/api/session/init', 'POST', {});
      sessionTokenRef.current = data.sessionToken;
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, data.sessionToken);
      applyServerState(data.state);
      setApiError(null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'セッション初期化に失敗しました。');
    }
  };

  useEffect(() => {
    void initSession();
    return () => clearAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentOpponent = CPU_OPPONENTS[selectedOpponentId];

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.enabled = next;
  };

  const playOutcomeAudio = (outcome: RollOutcome) => {
    if (
      outcome.yakuType === YakuType.PINZORO ||
      outcome.yakuType === YakuType.ARASHI ||
      outcome.yakuType === YakuType.SHIGORO
    ) {
      soundEngine.playHighYaku();
    } else if (
      outcome.yakuType === YakuType.HIFUMI ||
      outcome.yakuType === YakuType.SHONBEN
    ) {
      soundEngine.playMissOrPenalty(true);
    } else if (outcome.yakuType === YakuType.MENASHI) {
      soundEngine.playMissOrPenalty(false);
    } else {
      soundEngine.playPointLock();
    }
  };

  // Start a fresh match with full funds via server
  const startNewMatch = async (
    customOpponentId?: CpuOpponentId,
    customFunds?: number
  ) => {
    clearAllTimers();
    setIsRolling(false);
    setIsBusy(true);
    setApiError(null);
    try {
      const data = await apiRequest<{
        sessionToken: string;
        state: ServerSessionState;
      }>('/api/game/new', 'POST', {
        opponentId: customOpponentId ?? selectedOpponentId,
        startingFunds: customFunds ?? startingFunds,
        ruleMode: rerollRuleMode,
        enableShonben,
      });
      sessionTokenRef.current = data.sessionToken;
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, data.sessionToken);
      applyServerState(data.state);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '新規対局の開始に失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const updateSettings = async (patch: {
    opponentId?: CpuOpponentId;
    ruleMode?: RerollRuleMode;
    enableShonben?: boolean;
    startingFunds?: number;
  }) => {
    setApiError(null);
    try {
      const data = await apiRequest<{ state: ServerSessionState }>(
        '/api/game/settings',
        'PATCH',
        patch
      );
      setSelectedOpponentId(data.state.opponentId);
      setRerollRuleMode(data.state.ruleMode);
      setEnableShonben(data.state.enableShonben);
      setStartingFunds(data.state.startingFunds);
      setCpuDialogue(data.state.cpuDialogue);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '設定の更新に失敗しました。');
    }
  };

  // Perform a Player roll (initial roll or re-roll 1..3) verified on server
  const executePlayerRoll = async (isInitialThrow: boolean) => {
    if (isRolling || isBusy) return;
    if (!isInitialThrow && remainingRerolls <= 0) return;

    clearAllTimers();
    setApiError(null);
    setIsBusy(true);
    setTurnPhase('PLAYER_ROLLING');
    setActiveRoller('PLAYER');
    setIsRolling(true);
    soundEngine.playDiceRoll();
    setBowlDice(generateRandomTriplet());

    try {
      const endpoint = isInitialThrow ? '/api/game/roll' : '/api/game/reroll';
      const payload = isInitialThrow ? { betAmount } : {};
      const data = await apiRequest<{
        dice: DiceTriplet;
        outcome: RollOutcome;
        state: ServerSessionState;
      }>(endpoint, 'POST', payload);

      scheduleTimeout(() => {
        setBowlDice(data.dice);
        setIsRolling(false);
        setIsBusy(false);
        setThrowNumber(data.state.throwNumber);
        setRemainingRerolls(data.state.remainingRerolls);
        setPlayerOutcome(data.outcome);
        setPlayerRerollsUsed(data.state.playerRerollsUsed);
        setBetAmount(data.state.betAmount);
        playOutcomeAudio(data.outcome);
      }, 180);
    } catch (err) {
      setIsRolling(false);
      setIsBusy(false);
      setApiError(err instanceof Error ? err.message : 'ロール処理に失敗しました。');
      void initSession();
    }
  };

  // Lock in Player's outcome and play back server-verified CPU roll sequence
  const lockPlayerOutcomeAndStartCpuTurn = async () => {
    if (!playerOutcome || isRolling || isBusy) return;
    clearAllTimers();
    setApiError(null);
    setIsBusy(true);
    setTurnPhase('CPU_ROLLING');
    setActiveRoller('CPU');
    setThrowNumber(0);
    setRemainingRerolls(MAX_REROLLS);
    setCpuOutcome(null);
    setCpuRerollsUsed(0);
    setCpuDialogue(currentOpponent.quotes.rolling);

    try {
      const data = await apiRequest<{
        cpuSteps: CpuRollStep[];
        settlement: ServerSessionState['roundSettlement'];
        state: ServerSessionState;
      }>('/api/game/stand', 'POST', {});

      const playStep = (index: number) => {
        const step = data.cpuSteps[index];
        if (!step) {
          applyServerState(data.state);
          setIsRolling(false);
          setIsBusy(false);
          if (data.settlement?.winner === 'PLAYER') {
            soundEngine.playWinSettlement();
          } else if (data.settlement?.winner === 'CPU') {
            soundEngine.playMissOrPenalty(false);
          }
          return;
        }

        setIsRolling(true);
        soundEngine.playDiceRoll();
        setBowlDice(generateRandomTriplet());

        scheduleTimeout(() => {
          setBowlDice(step.dice);
          setIsRolling(false);
          setThrowNumber(step.throwNumber);
          setRemainingRerolls(step.remainingRerolls);
          setCpuOutcome(step.outcome);
          setCpuRerollsUsed(step.rerollsUsed);
          setCpuDialogue(step.dialogue);
          playOutcomeAudio(step.outcome);

          if (index + 1 < data.cpuSteps.length) {
            scheduleTimeout(() => {
              setCpuDialogue(
                `${currentOpponent.quotes.reroll}（CPU振り直し 残り${step.remainingRerolls - 1}回）`
              );
              playStep(index + 1);
            }, 700);
          } else {
            scheduleTimeout(() => {
              playStep(index + 1);
            }, 650);
          }
        }, 200);
      };

      playStep(0);
    } catch (err) {
      setIsRolling(false);
      setIsBusy(false);
      setApiError(err instanceof Error ? err.message : '勝負確定に失敗しました。');
      void initSession();
    }
  };

  // Proceed to the next round via server
  const advanceToNextRound = async () => {
    if (isBusy) return;
    clearAllTimers();
    setApiError(null);
    setIsBusy(true);
    try {
      const data = await apiRequest<{ state: ServerSessionState }>(
        '/api/game/next-round',
        'POST',
        {}
      );
      applyServerState(data.state);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '次の局への移行に失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearHistory = async () => {
    setApiError(null);
    try {
      const data = await apiRequest<{ state: ServerSessionState }>(
        '/api/game/clear-history',
        'POST',
        {}
      );
      setHistory(data.state.history);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '履歴の削除に失敗しました。');
    }
  };

  const maxAllowedBet = Math.max(0, playerFunds);
  const playerCanReroll = canPerformReroll(
    playerOutcome,
    remainingRerolls,
    rerollRuleMode
  );

  // Recommend locking in if Player already has Shigoro, Arashi, Pinzoro, or 5/6 point
  const isStrongPlayerRoll =
    playerOutcome !== null && playerOutcome.strengthRank >= 15;

  return (
    <div className="min-h-screen flex flex-col bg-[#141210] text-[#F5F2EB]">
      {/* Top Bar Contract: Strictly 1 row, 3 zones (Brand Wordmark — 4 Nav Links — 2 Primary Actions) */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/10 bg-[#141210]/95 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#arena"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('ARENA');
          }}
          className="text-lg sm:text-xl font-bold font-display tracking-tight text-[#F5F2EB] whitespace-nowrap"
        >
          雀荘・丁半 チンチロリン
        </a>

        {/* Zone 2: 4 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#B8B0A4]">
          <button
            type="button"
            onClick={() => setActiveTab('ARENA')}
            className={`hover:text-[#F5F2EB] transition-colors whitespace-nowrap py-1 ${
              activeTab === 'ARENA'
                ? 'text-[#F5F2EB] underline underline-offset-8 decoration-[#DC2626] decoration-2'
                : ''
            }`}
          >
            対局卓
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('YAKU_GUIDE')}
            className={`hover:text-[#F5F2EB] transition-colors whitespace-nowrap py-1 ${
              activeTab === 'YAKU_GUIDE'
                ? 'text-[#F5F2EB] underline underline-offset-8 decoration-[#DC2626] decoration-2'
                : ''
            }`}
          >
            役・配当一覧
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`hover:text-[#F5F2EB] transition-colors whitespace-nowrap py-1 ${
              activeTab === 'HISTORY'
                ? 'text-[#F5F2EB] underline underline-offset-8 decoration-[#DC2626] decoration-2'
                : ''
            }`}
          >
            対局戦績
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('RULES')}
            className={`hover:text-[#F5F2EB] transition-colors whitespace-nowrap py-1 ${
              activeTab === 'RULES'
                ? 'text-[#F5F2EB] underline underline-offset-8 decoration-[#DC2626] decoration-2'
                : ''
            }`}
          >
            ルール設定
          </button>
        </nav>

        {/* Zone 3: 2 primary actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleSound}
            className="px-3 py-2 text-xs font-medium text-[#B8B0A4] hover:text-[#F5F2EB] border border-white/15 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            aria-label={soundEnabled ? '効果音をオフにする' : '効果音をオンにする'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? '音声 ON' : '音声 OFF'}</span>
          </button>
          <button
            type="button"
            onClick={() => startNewMatch()}
            className="px-3.5 py-2 text-xs font-medium text-[#F5F2EB] bg-[#26201B] hover:bg-[#332B24] border border-white/15 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>新規対局</span>
          </button>
        </div>
      </header>

      {/* Mobile Sub-Navigation Bar */}
      <div className="flex md:hidden items-center justify-around border-b border-white/10 bg-[#1A1714] px-2 py-2 text-xs font-medium text-[#B8B0A4]">
        <button
          type="button"
          onClick={() => setActiveTab('ARENA')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'ARENA' ? 'text-[#F5F2EB] bg-white/10' : ''
          }`}
        >
          対局卓
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('YAKU_GUIDE')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'YAKU_GUIDE' ? 'text-[#F5F2EB] bg-white/10' : ''
          }`}
        >
          役・配当一覧
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('HISTORY')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'HISTORY' ? 'text-[#F5F2EB] bg-white/10' : ''
          }`}
        >
          対局戦績
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('RULES')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'RULES' ? 'text-[#F5F2EB] bg-white/10' : ''
          }`}
        >
          ルール設定
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'YAKU_GUIDE' && (
          <YakuGuideView onReturnToArena={() => setActiveTab('ARENA')} />
        )}

        {activeTab === 'HISTORY' && (
          <MatchHistoryView
            history={history}
            onClearHistory={() => {
              void handleClearHistory();
            }}
            onReturnToArena={() => setActiveTab('ARENA')}
          />
        )}

        {activeTab === 'RULES' && (
          <RulesSettingsView
            rerollRuleMode={rerollRuleMode}
            onChangeRerollRuleMode={(mode) => {
              void updateSettings({ ruleMode: mode });
            }}
            enableShonben={enableShonben}
            onToggleShonben={(enabled) => {
              void updateSettings({ enableShonben: enabled });
            }}
            selectedOpponentId={selectedOpponentId}
            onSelectOpponent={(id) => {
              void updateSettings({ opponentId: id });
            }}
            startingFunds={startingFunds}
            onChangeStartingFunds={(amt) => {
              void updateSettings({ startingFunds: amt });
            }}
            onStartNewMatch={() => {
              void startNewMatch(selectedOpponentId, startingFunds);
            }}
            onReturnToArena={() => setActiveTab('ARENA')}
          />
        )}

        {activeTab === 'ARENA' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {apiError && (
              <div
                role="alert"
                className="mb-4 px-4 py-3 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 text-xs sm:text-sm text-[#FCA5A5] flex items-center justify-between gap-4"
              >
                <span>{apiError}</span>
                <button
                  type="button"
                  onClick={() => setApiError(null)}
                  className="text-xs text-[#F5F2EB] underline shrink-0"
                >
                  閉じる
                </button>
              </div>
            )}
            {/* Top Match Info & Mode Switcher Strip */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/10">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#B8B0A4] font-mono-tabular">
                <span className="text-[#F5F2EB] font-semibold">第{roundNumber}局</span>
                <span aria-hidden="true">·</span>
                <span>親番: {dealer === 'PLAYER' ? 'あなた' : currentOpponent.name}</span>
                <span aria-hidden="true">·</span>
                <span>現在の賭け金: {betAmount.toLocaleString()}両</span>
                <span aria-hidden="true">·</span>
                <span>振り直し上限: 3回まで</span>
              </div>

              {/* Interactive Segmented Controls for Opponent & Reroll Rule */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 p-1 bg-[#1C1815] border border-white/10 rounded-lg">
                  {(Object.keys(CPU_OPPONENTS) as CpuOpponentId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={turnPhase !== 'BETTING' && turnPhase !== 'ROUND_RESULT'}
                      onClick={() => {
                        void updateSettings({ opponentId: id });
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        selectedOpponentId === id
                          ? 'bg-[#F59E0B] text-[#141210]'
                          : 'text-[#B8B0A4] hover:text-white disabled:opacity-50'
                      }`}
                    >
                      対 {CPU_OPPONENTS[id].name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#1C1815] border border-white/10 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      void updateSettings({ ruleMode: 'FREE_UP_TO_3' });
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      rerollRuleMode === 'FREE_UP_TO_3'
                        ? 'bg-white/15 text-[#F5F2EB]'
                        : 'text-[#A8A29E] hover:text-white'
                    }`}
                  >
                    任意振り直し3回
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void updateSettings({ ruleMode: 'STRICT_MENASHI_3' });
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      rerollRuleMode === 'STRICT_MENASHI_3'
                        ? 'bg-white/15 text-[#F5F2EB]'
                        : 'text-[#A8A29E] hover:text-white'
                    }`}
                  >
                    目なし時のみ3回
                  </button>
                </div>
              </div>
            </div>

            {/* 12-Column Desktop Game Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6 items-start">
              {/* Left 8 Columns: Active Game Table */}
              <div className="lg:col-span-8 flex flex-col">
                {/* 1. CPU Opponent Zone (Top) */}
                <div className="p-5 rounded-t-2xl bg-[#1C1815] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-4">
                    <AvatarWithFallback
                      src={currentOpponent.avatarPath}
                      alt={currentOpponent.name}
                      fallbackLabel={currentOpponent.name}
                      className="w-14 h-14 rounded-lg"
                    />
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#A8A29E] font-mono-tabular">
                        <span>{currentOpponent.title}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dealer === 'CPU' ? '親番' : '子方'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#F5F2EB] font-semibold">
                          所持金 無限（∞両）
                        </span>
                      </div>
                      <h2 className="text-lg font-bold font-display text-[#F5F2EB] mt-0.5">
                        {currentOpponent.name}
                      </h2>
                      <p className="text-xs text-[#D6CFC2] mt-1">
                        {cpuDialogue}
                      </p>
                    </div>
                  </div>

                  {/* CPU Current/Locked Roll Readout */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-white/10 shrink-0 font-mono-tabular">
                    <div className="text-xs text-[#A8A29E]">
                      CPU出目 · 振直{cpuRerollsUsed}/{MAX_REROLLS}回
                    </div>
                    {cpuOutcome ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-base font-bold font-display text-[#F59E0B]">
                          {cpuOutcome.label}
                        </span>
                        <span className="text-xs text-[#B8B0A4]">
                          [{cpuOutcome.dice.join('-')}]
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-[#A8A29E] mt-1">
                        {turnPhase === 'CPU_ROLLING' ? 'ロール中…' : '手番待機中'}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Center Ceramic Bowl Table Canvas */}
                <div className="relative py-8 px-4 sm:px-8 border-x border-white/10 overflow-hidden flex flex-col items-center justify-center min-h-[25rem]">
                  {/* Authentic Tatami & Hinoki Table Backdrop with Measured Contrast Scrim */}
                  <img
                    src={ASSETS.tableBackdropUrl}
                    alt="和風対局卓"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none select-none"
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 50%, rgba(20,18,16,0.55) 0%, rgba(20,18,16,0.92) 100%)',
                    }}
                  />

                  <div className="relative z-10 w-full flex flex-col items-center">
                    <DiceBowlArena
                      dice={bowlDice}
                      outcome={
                        activeRoller === 'PLAYER' ? playerOutcome : cpuOutcome
                      }
                      isRolling={isRolling}
                      activeRollerLabel={
                        activeRoller === 'PLAYER'
                          ? 'あなたの手番'
                          : `${currentOpponent.name}の手番`
                      }
                      throwNumber={throwNumber}
                      remainingRerolls={remainingRerolls}
                      maxRerolls={MAX_REROLLS}
                    />

                    {/* Side-by-Side Comparison Banner when both have rolled or in ROUND_RESULT */}
                    {(playerOutcome || cpuOutcome) && (
                      <div className="w-full max-w-lg mt-5 pt-4 border-t border-white/10 grid grid-cols-2 gap-4 text-center font-mono-tabular">
                        <div>
                          <div className="text-xs text-[#A8A29E]">
                            あなたの出目（振直 {playerRerollsUsed}/{MAX_REROLLS}回）
                          </div>
                          <div className="text-base sm:text-lg font-bold font-display text-[#F5F2EB] mt-0.5">
                            {playerOutcome ? playerOutcome.label : '未ロール'}
                          </div>
                          {playerOutcome && (
                            <div className="flex items-center justify-center gap-1.5 mt-1">
                              {playerOutcome.dice.map((d, i) => (
                                <JapaneseDie key={i} value={d} size="sm" />
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs text-[#A8A29E]">
                            CPUの出目（振直 {cpuRerollsUsed}/{MAX_REROLLS}回）
                          </div>
                          <div className="text-base sm:text-lg font-bold font-display text-[#F5F2EB] mt-0.5">
                            {cpuOutcome ? cpuOutcome.label : '待機中'}
                          </div>
                          {cpuOutcome && (
                            <div className="flex items-center justify-center gap-1.5 mt-1">
                              {cpuOutcome.dice.map((d, i) => (
                                <JapaneseDie key={i} value={d} size="sm" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Player Control Deck (Bottom) */}
                <div className="p-5 sm:p-6 rounded-b-2xl bg-[#1C1815] border border-white/10 flex flex-col gap-5">
                  {/* Player Status Row */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10 font-mono-tabular">
                    <div>
                      <div className="text-xs text-[#A8A29E]">
                        あなた · {dealer === 'PLAYER' ? '親番' : '子方'}
                      </div>
                      <div className="text-xl sm:text-2xl font-bold text-[#F5F2EB] mt-0.5">
                        所持金 {playerFunds.toLocaleString()}両
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-[#A8A29E]">
                        この局の振り直し残り回数
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-[#F59E0B] mt-0.5">
                        残り {activeRoller === 'PLAYER' ? remainingRerolls : MAX_REROLLS - playerRerollsUsed} / {MAX_REROLLS} 回
                      </div>
                    </div>
                  </div>

                  {/* Phase-Specific Controls */}
                  {turnPhase === 'BETTING' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="text-xs text-[#B8B0A4] font-mono-tabular">
                          賭け金を選択（上限 {maxAllowedBet.toLocaleString()}両）
                        </div>
                        <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                          {[100, 500, 1000, 5000].map((preset) => {
                            const disabled = preset > maxAllowedBet;
                            const active = betAmount === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                disabled={disabled}
                                onClick={() => setBetAmount(preset)}
                                className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                                  active
                                    ? 'bg-[#F59E0B] text-[#141210] border-[#F59E0B] font-semibold'
                                    : 'bg-[#26201B] text-[#E5DEC9] border-white/10 hover:border-white/25 disabled:opacity-40'
                                }`}
                              >
                                {preset.toLocaleString()}両
                              </button>
                            );
                          })}
                          {maxAllowedBet >= 200 && (
                            <button
                              type="button"
                              onClick={() =>
                                setBetAmount(
                                  Math.max(100, Math.floor(maxAllowedBet / 200) * 100)
                                )
                              }
                              className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                                betAmount ===
                                Math.max(100, Math.floor(maxAllowedBet / 200) * 100)
                                  ? 'bg-[#F59E0B] text-[#141210] border-[#F59E0B] font-semibold'
                                  : 'bg-[#26201B] text-[#E5DEC9] border-white/10 hover:border-white/25'
                              }`}
                            >
                              半額（{Math.max(100, Math.floor(maxAllowedBet / 200) * 100).toLocaleString()}両）
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setBetAmount(maxAllowedBet)}
                            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                              betAmount === maxAllowedBet
                                ? 'bg-[#DC2626] text-white border-[#DC2626] font-semibold'
                                : 'bg-[#26201B] text-[#E5DEC9] border-white/10 hover:border-white/25'
                            }`}
                          >
                            全額勝負（{maxAllowedBet.toLocaleString()}両）
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy || maxAllowedBet <= 0}
                        onClick={() => {
                          void executePlayerRoll(true);
                        }}
                        className="px-6 py-3.5 text-sm font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Dices className="w-4 h-4" />
                        <span>サイコロを振る（1投目）</span>
                      </button>
                    </div>
                  )}

                  {turnPhase === 'PLAYER_ROLLING' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-xs sm:text-sm text-[#D6CFC2]">
                        {remainingRerolls > 0 ? (
                          playerCanReroll ? (
                            <span>
                              あと <strong className="text-[#F59E0B] font-mono-tabular">{remainingRerolls}回</strong> 振り直せます。振り直すか、現在の「
                              <strong className="text-[#F5F2EB]">{playerOutcome?.label}</strong>
                              」で勝負するか選んでください。
                            </span>
                          ) : (
                            <span>
                              定石ルールにより「
                              <strong className="text-[#F5F2EB]">{playerOutcome?.label}</strong>
                              」で出目が確定しました。
                            </span>
                          )
                        ) : (
                          <span>
                            振り直し3回を使い切りました。「
                            <strong className="text-[#F5F2EB]">{playerOutcome?.label}</strong>
                            」でCPUと勝負します。
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 shrink-0">
                        {playerCanReroll && remainingRerolls > 0 && (
                          <button
                            type="button"
                            disabled={isRolling || isBusy}
                            onClick={() => {
                              void executePlayerRoll(false);
                            }}
                            className={`px-5 py-3 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap ${
                              !isStrongPlayerRoll
                                ? 'bg-[#DC2626] hover:bg-[#B91C1C] text-white'
                                : 'bg-[#26201B] hover:bg-[#332B24] text-[#F5F2EB] border border-white/15'
                            } disabled:opacity-50`}
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>振り直す（残り {remainingRerolls} 回）</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isRolling || isBusy}
                          onClick={() => {
                            void lockPlayerOutcomeAndStartCpuTurn();
                          }}
                          className={`px-5 py-3 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap ${
                            isStrongPlayerRoll || !playerCanReroll || remainingRerolls === 0
                              ? 'bg-[#F59E0B] hover:bg-[#D97706] text-[#141210]'
                              : 'bg-[#26201B] hover:bg-[#332B24] text-[#F5F2EB] border border-white/15'
                          } disabled:opacity-50`}
                        >
                          <Check className="w-4 h-4" />
                          <span>
                            {remainingRerolls === 0 || !playerCanReroll
                              ? 'この目でCPUと勝負する'
                              : 'この目で確定（勝負する）'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {turnPhase === 'CPU_ROLLING' && (
                    <div className="flex items-center justify-between gap-4 py-1">
                      <div className="text-sm text-[#E5DEC9]">
                        {currentOpponent.name}が茶碗に賽を投じています…（残り振り直し {remainingRerolls}/{MAX_REROLLS}回）
                      </div>
                      <div className="text-xs font-mono-tabular text-[#F59E0B]">
                        CPU思考・ロール中
                      </div>
                    </div>
                  )}

                  {turnPhase === 'ROUND_RESULT' && roundSettlement && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                      <div>
                        <div className="flex items-center gap-2 font-mono-tabular text-xs">
                          <span
                            className={`font-bold text-sm ${
                              roundSettlement.winner === 'PLAYER'
                                ? 'text-[#10B981]'
                                : roundSettlement.winner === 'CPU'
                                  ? 'text-[#EF4444]'
                                  : 'text-[#F59E0B]'
                            }`}
                          >
                            {roundSettlement.winner === 'PLAYER'
                              ? `あなたの勝利（+${roundSettlement.netDeltaPlayer.toLocaleString()}両）`
                              : roundSettlement.winner === 'CPU'
                                ? `CPUの勝利（${roundSettlement.netDeltaPlayer.toLocaleString()}両）`
                                : '同格引き分け（±0両）'}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-[#D6CFC2] mt-1">
                          {roundSettlement.summaryReason}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={advanceToNextRound}
                        className="px-6 py-3 text-xs sm:text-sm font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <span>次の局へ進む（第{roundNumber + 1}局）</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {turnPhase === 'MATCH_OVER' && roundSettlement && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-[#F59E0B]">
                          <Sparkles className="w-4 h-4" />
                          <span>
                            {playerFunds > 0
                              ? `対局完全勝利！${currentOpponent.name}の軍資金をすべて討ち取りました！`
                              : '軍資金が尽きました…対局終了です。'}
                          </span>
                        </div>
                        <p className="text-xs text-[#B8B0A4] mt-1">
                          {roundSettlement.summaryReason} · 最終所持金 {playerFunds.toLocaleString()}両
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => startNewMatch()}
                        className="px-6 py-3 text-xs sm:text-sm font-bold bg-[#F59E0B] hover:bg-[#D97706] text-[#141210] rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>もう一度最初から対局する</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right 4 Columns: Quick Yaku Hierarchy & Live Session Feed */}
              <aside className="lg:col-span-4 space-y-6">
                {/* Quick Yaku Hierarchy Panel */}
                <div className="p-5 rounded-2xl bg-[#1C1815] border border-white/10">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="text-base font-bold font-display text-[#F5F2EB]">
                      01. 役・出目の強さ順（早見表）
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('YAKU_GUIDE')}
                      className="text-xs text-[#F59E0B] hover:underline whitespace-nowrap"
                    >
                      詳細確率を見る
                    </button>
                  </div>

                  <div className="divide-y divide-white/5 mt-2 text-xs font-mono-tabular">
                    <div className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[#F59E0B] font-bold">ピンゾロ</span>
                        <span className="text-[#A8A29E] ml-2">[1·1·1]</span>
                      </div>
                      <span className="text-[#F59E0B] font-semibold">5倍づけ</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[#F5F2EB] font-semibold">アラシ（ゾロ目）</span>
                        <span className="text-[#A8A29E] ml-2">[6·6·6]〜[2·2·2]</span>
                      </div>
                      <span className="text-[#F59E0B] font-semibold">3倍づけ</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[#F5F2EB] font-semibold">シゴロ</span>
                        <span className="text-[#A8A29E] ml-2">[4·5·6]</span>
                      </div>
                      <span className="text-[#F59E0B] font-semibold">2倍づけ</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[#F5F2EB]">通常の出目</span>
                        <span className="text-[#A8A29E] ml-2">六＞五＞四＞三＞二＞一</span>
                      </div>
                      <span className="text-[#B8B0A4]">1倍勝負</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[#A8A29E]">目なし</span>
                        <span className="text-[#A8A29E] ml-2">揃いなし（振直3回迄）</span>
                      </div>
                      <span className="text-[#A8A29E]">1倍負け</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[#EF4444] font-semibold">ヒフミ</span>
                        <span className="text-[#A8A29E] ml-2">[1·2·3] 最弱厄目</span>
                      </div>
                      <span className="text-[#EF4444] font-semibold">2倍払い</span>
                    </div>
                  </div>
                </div>

                {/* Recent Rounds Log Panel */}
                <div className="p-5 rounded-2xl bg-[#1C1815] border border-white/10">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="text-base font-bold font-display text-[#F5F2EB]">
                      02. 直近の対局記録
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('HISTORY')}
                      className="text-xs text-[#B8B0A4] hover:text-white whitespace-nowrap"
                    >
                      全履歴（{history.length}局）
                    </button>
                  </div>

                  {history.length === 0 ? (
                    <p className="text-xs text-[#A8A29E] py-6 text-center">
                      まだ記録がありません。サイコロを振って対局を始めましょう。
                    </p>
                  ) : (
                    <div className="divide-y divide-white/5 mt-2 font-mono-tabular text-xs">
                      {history.slice(0, 5).map((item) => (
                        <div
                          key={item.roundNumber}
                          className="py-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="truncate">
                            <span className="text-[#A8A29E]">第{item.roundNumber}局</span>
                            <span className="mx-1.5 text-[#A8A29E]" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-[#F5F2EB]">
                              自:{item.playerOutcome.label}
                            </span>
                            <span className="mx-1 text-[#A8A29E]">対</span>
                            <span className="text-[#B8B0A4]">
                              敵:{item.cpuOutcome.label}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 font-semibold ${
                              item.netDeltaPlayer > 0
                                ? 'text-[#10B981]'
                                : item.netDeltaPlayer < 0
                                  ? 'text-[#EF4444]'
                                  : 'text-[#A8A29E]'
                            }`}
                          >
                            {item.netDeltaPlayer > 0
                              ? `+${item.netDeltaPlayer.toLocaleString()}両`
                              : item.netDeltaPlayer < 0
                                ? `${item.netDeltaPlayer.toLocaleString()}両`
                                : '±0両'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
