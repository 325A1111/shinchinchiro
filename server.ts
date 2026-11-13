import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_REROLLS = 3;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_SESSIONS = 5000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 180;

// Ephemeral HMAC key generated per process if not provided via env
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

type DieValue = 1 | 2 | 3 | 4 | 5 | 6;
type DiceTriplet = [DieValue, DieValue, DieValue];
type YakuTypeValue =
  | 'PINZORO'
  | 'ARASHI'
  | 'SHIGORO'
  | 'DEME'
  | 'MENASHI'
  | 'SHONBEN'
  | 'HIFUMI';

type RerollRuleMode = 'FREE_UP_TO_3' | 'STRICT_MENASHI_3';
type CpuOpponentId = 'GENZO' | 'TATSUKICHI';
type TurnPhase =
  | 'BETTING'
  | 'PLAYER_ROLLING'
  | 'ROUND_RESULT'
  | 'MATCH_OVER';

interface RollOutcome {
  dice: DiceTriplet;
  yakuType: YakuTypeValue;
  label: string;
  reading: string;
  pointValue: number | null;
  strengthRank: number;
  multiplier: number;
  isPenalty: boolean;
  description: string;
}

interface RoundSettlement {
  winner: 'PLAYER' | 'CPU' | 'DRAW';
  appliedMultiplier: number;
  netDeltaPlayer: number;
  summaryReason: string;
}

interface RoundHistoryRecord {
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

interface CpuRollStep {
  dice: DiceTriplet;
  outcome: RollOutcome;
  throwNumber: number;
  remainingRerolls: number;
  rerollsUsed: number;
  dialogue: string;
}

interface CpuConfig {
  id: CpuOpponentId;
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

interface MatchSession {
  id: string;
  lastActiveAt: number;
  opponentId: CpuOpponentId;
  ruleMode: RerollRuleMode;
  enableShonben: boolean;
  startingFunds: number;
  roundNumber: number;
  dealer: 'PLAYER' | 'CPU';
  playerFunds: number;
  betAmount: number;
  turnPhase: TurnPhase;
  throwNumber: number;
  remainingRerolls: number;
  playerOutcome: RollOutcome | null;
  playerRerollsUsed: number;
  cpuOutcome: RollOutcome | null;
  cpuRerollsUsed: number;
  roundSettlement: RoundSettlement | null;
  cpuDialogue: string;
  history: RoundHistoryRecord[];
}

const KANJI_NUMS: Record<DieValue, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
};

const CPU_CONFIGS: Record<CpuOpponentId, CpuConfig> = {
  GENZO: {
    id: 'GENZO',
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

const ALLOWED_STARTING_FUNDS = new Set([3000, 5000, 10000]);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Cryptographically secure unbiased die roll [1..6] using Node CSPRNG
function secureRollDie(): DieValue {
  return crypto.randomInt(1, 7) as DieValue;
}

function secureRollTriplet(): DiceTriplet {
  return [secureRollDie(), secureRollDie(), secureRollDie()];
}

function secureShouldTriggerShonben(enabled: boolean): boolean {
  if (!enabled) return false;
  return crypto.randomInt(0, 100) < 2;
}

function evaluateDiceRoll(dice: DiceTriplet, isShonben: boolean): RollOutcome {
  if (isShonben) {
    return {
      dice,
      yakuType: 'SHONBEN',
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

  if (a === b && b === c) {
    if (a === 1) {
      return {
        dice,
        yakuType: 'PINZORO',
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
      yakuType: 'ARASHI',
      label: `${KANJI_NUMS[a]}ゾロ（アラシ）`,
      reading: `${KANJI_NUMS[a]}の三つ揃い・三倍づけ`,
      pointValue: a,
      strengthRank: 80 + a,
      multiplier: 3,
      isPenalty: false,
      description: `${KANJI_NUMS[a]}の目が三つ揃った大役。賭け金の3倍を獲得します。`,
    };
  }

  if (a === 4 && b === 5 && c === 6) {
    return {
      dice,
      yakuType: 'SHIGORO',
      label: 'シゴロ',
      reading: '四・五・六揃い・二倍づけ',
      pointValue: 6,
      strengthRank: 70,
      multiplier: 2,
      isPenalty: false,
      description: '四・五・六の順目。通常の出目をすべて上回り、賭け金の2倍を獲得します。',
    };
  }

  if (a === 1 && b === 2 && c === 3) {
    return {
      dice,
      yakuType: 'HIFUMI',
      label: 'ヒフミ',
      reading: '一・二・三揃い・二倍払い',
      pointValue: 0,
      strengthRank: 1,
      multiplier: 2,
      isPenalty: true,
      description: '一・二・三の厄目。最弱の目であり、賭け金の2倍を支払う痛恨の役です。',
    };
  }

  if (a === b || b === c) {
    const point = (a === b ? c : a) as DieValue;
    const pairVal = (a === b ? a : b) as DieValue;
    return {
      dice,
      yakuType: 'DEME',
      label: `${KANJI_NUMS[point]}の目`,
      reading: `${KANJI_NUMS[pairVal]}対子＋出目${KANJI_NUMS[point]}・一倍勝負`,
      pointValue: point,
      strengthRank: 10 + point,
      multiplier: 1,
      isPenalty: false,
      description: `${KANJI_NUMS[pairVal]}が二つ揃い、残った「${KANJI_NUMS[point]}（${point}）」が勝負の強さとなります。`,
    };
  }

  return {
    dice,
    yakuType: 'MENASHI',
    label: '目なし',
    reading: '役・出目なし（振り直し対象）',
    pointValue: null,
    strengthRank: 5,
    multiplier: 1,
    isPenalty: false,
    description: 'ペアも順目も揃っていない状態。残り回数があれば振り直しを行います。',
  };
}

function canPerformReroll(
  outcome: RollOutcome | null,
  remainingRerolls: number,
  ruleMode: RerollRuleMode
): boolean {
  if (!outcome || remainingRerolls <= 0) return false;
  if (outcome.yakuType === 'SHONBEN') return false;
  if (ruleMode === 'FREE_UP_TO_3') return true;
  return outcome.yakuType === 'MENASHI';
}

function shouldCpuReroll(
  currentOutcome: RollOutcome,
  remainingRerolls: number,
  ruleMode: RerollRuleMode,
  opponent: CpuConfig,
  targetOutcomeToBeat: RollOutcome
): boolean {
  if (!canPerformReroll(currentOutcome, remainingRerolls, ruleMode)) {
    return false;
  }
  if (currentOutcome.yakuType === 'MENASHI') {
    return true;
  }
  if (ruleMode === 'STRICT_MENASHI_3') {
    return false;
  }
  if (
    currentOutcome.yakuType === 'PINZORO' ||
    currentOutcome.yakuType === 'ARASHI' ||
    currentOutcome.yakuType === 'SHIGORO' ||
    currentOutcome.strengthRank >= 16
  ) {
    return false;
  }
  if (currentOutcome.yakuType === 'HIFUMI' || currentOutcome.strengthRank <= 11) {
    return true;
  }
  if (currentOutcome.strengthRank < targetOutcomeToBeat.strengthRank) {
    return true;
  }
  if (
    currentOutcome.strengthRank === targetOutcomeToBeat.strengthRank &&
    opponent.riskTolerance === 'AGGRESSIVE' &&
    currentOutcome.strengthRank <= 14
  ) {
    return true;
  }
  return false;
}

function settleRoundOutcomes(
  playerOutcome: RollOutcome,
  cpuOutcome: RollOutcome,
  betAmount: number
): RoundSettlement {
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
  }

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

// HMAC-SHA256 Session Token Signing & Constant-Time Verification
function signSessionId(sessionId: string): string {
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('hex');
  return `${sessionId}.${sig}`;
}

function verifySignedToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [sessionId, sig] = parts;
  if (!/^[a-f0-9]{64}$/.test(sessionId) || !/^[a-f0-9]{64}$/.test(sig)) {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  return sessionId;
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key && !FORBIDDEN_KEYS.has(key)) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

function hasPrototypePollution(value: unknown, depth: number = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasPrototypePollution(item, depth + 1));
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return true;
    }
    const nested = (value as Record<string, unknown>)[key];
    if (hasPrototypePollution(nested, depth + 1)) {
      return true;
    }
  }
  return false;
}

const sessions = new Map<string, MatchSession>();

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActiveAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
  while (sessions.size >= MAX_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    if (!oldestKey) break;
    sessions.delete(oldestKey);
  }
}

function createFreshSession(
  opponentId: CpuOpponentId = 'GENZO',
  startingFunds: number = 5000,
  ruleMode: RerollRuleMode = 'FREE_UP_TO_3',
  enableShonben: boolean = false
): MatchSession {
  pruneSessions();
  const id = crypto.randomBytes(32).toString('hex');
  const session: MatchSession = {
    id,
    lastActiveAt: Date.now(),
    opponentId,
    ruleMode,
    enableShonben,
    startingFunds,
    roundNumber: 1,
    dealer: 'PLAYER',
    playerFunds: startingFunds,
    betAmount: Math.min(500, startingFunds),
    turnPhase: 'BETTING',
    throwNumber: 0,
    remainingRerolls: MAX_REROLLS,
    playerOutcome: null,
    playerRerollsUsed: 0,
    cpuOutcome: null,
    cpuRerollsUsed: 0,
    roundSettlement: null,
    cpuDialogue: CPU_CONFIGS[opponentId].quotes.greeting,
    history: [],
  };
  sessions.set(id, session);
  return session;
}

function serializeSession(session: MatchSession) {
  return {
    opponentId: session.opponentId,
    ruleMode: session.ruleMode,
    enableShonben: session.enableShonben,
    startingFunds: session.startingFunds,
    roundNumber: session.roundNumber,
    dealer: session.dealer,
    playerFunds: session.playerFunds,
    betAmount: session.betAmount,
    turnPhase: session.turnPhase,
    throwNumber: session.throwNumber,
    remainingRerolls: session.remainingRerolls,
    playerOutcome: session.playerOutcome,
    playerRerollsUsed: session.playerRerollsUsed,
    cpuOutcome: session.cpuOutcome,
    cpuRerollsUsed: session.cpuRerollsUsed,
    roundSettlement: session.roundSettlement,
    cpuDialogue: session.cpuDialogue,
    history: session.history,
  };
}

function setSessionCookie(req: Request, res: Response, signedToken: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    IS_PROD;
  const attrs = [
    `chinchiro_sid=${encodeURIComponent(signedToken)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    isHttps ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  res.setHeader('Set-Cookie', attrs);
}

function extractSession(req: Request): MatchSession | null {
  const headerToken = req.headers['x-session-token'];
  const rawHeader = typeof headerToken === 'string' ? headerToken : undefined;
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawCookie = cookies.chinchiro_sid;

  const verifiedId =
    verifySignedToken(rawHeader) ?? verifySignedToken(rawCookie);
  if (!verifiedId) return null;

  const session = sessions.get(verifiedId);
  if (!session) return null;
  if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
    sessions.delete(verifiedId);
    return null;
  }
  session.lastActiveAt = Date.now();
  return session;
}

// Sliding-window IP rate limiter for /api/*
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip) || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    if (rateBuckets.size > 10_000) {
      rateBuckets.clear();
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
    res.status(429).json({
      error: 'リクエスト回数が上限に達しました。しばらく待ってから再度お試しください。',
    });
    return;
  }

  next();
}

function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  const scriptSrc = IS_PROD ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = IS_PROD ? "'self'" : "'self' ws: wss:";
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      `connect-src ${connectSrc}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  next();
}

function isValidOpponentId(val: unknown): val is CpuOpponentId {
  return val === 'GENZO' || val === 'TATSUKICHI';
}

function isValidRuleMode(val: unknown): val is RerollRuleMode {
  return val === 'FREE_UP_TO_3' || val === 'STRICT_MENASHI_3';
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeadersMiddleware);
  app.use('/api', apiRateLimiter);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  });

  app.use(express.json({ limit: '16kb' }));

  // Reject malformed JSON payloads cleanly without leaking internals
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: '不正なJSON形式です。' });
      return;
    }
    next(err);
  });

  // Prototype-pollution & unsafe-key guard on all API request bodies
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.body !== undefined && hasPrototypePollution(req.body)) {
      res.status(400).json({ error: '不正なキーが含まれています。' });
      return;
    }
    next();
  });

  // Healthcheck
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Initialize or restore server-authoritative session
  app.post('/api/session/init', (req: Request, res: Response) => {
    const existing = extractSession(req);
    if (existing) {
      const signed = signSessionId(existing.id);
      setSessionCookie(req, res, signed);
      res.json({
        sessionToken: signed,
        state: serializeSession(existing),
      });
      return;
    }

    const session = createFreshSession();
    const signed = signSessionId(session.id);
    setSessionCookie(req, res, signed);
    res.json({
      sessionToken: signed,
      state: serializeSession(session),
    });
  });

  // Start a fresh match with validated parameters
  app.post('/api/game/new', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const current = extractSession(req);

    const opponentId = isValidOpponentId(body.opponentId)
      ? body.opponentId
      : (current?.opponentId ?? 'GENZO');
    const ruleMode = isValidRuleMode(body.ruleMode)
      ? body.ruleMode
      : (current?.ruleMode ?? 'FREE_UP_TO_3');
    const enableShonben =
      typeof body.enableShonben === 'boolean'
        ? body.enableShonben
        : (current?.enableShonben ?? false);
    const startingFunds =
      typeof body.startingFunds === 'number' &&
      ALLOWED_STARTING_FUNDS.has(body.startingFunds)
        ? body.startingFunds
        : (current?.startingFunds ?? 5000);

    const session = current ?? createFreshSession(opponentId, startingFunds, ruleMode, enableShonben);
    session.opponentId = opponentId;
    session.ruleMode = ruleMode;
    session.enableShonben = enableShonben;
    session.startingFunds = startingFunds;
    session.roundNumber = 1;
    session.dealer = 'PLAYER';
    session.playerFunds = startingFunds;
    session.betAmount = Math.min(500, startingFunds);
    session.turnPhase = 'BETTING';
    session.throwNumber = 0;
    session.remainingRerolls = MAX_REROLLS;
    session.playerOutcome = null;
    session.playerRerollsUsed = 0;
    session.cpuOutcome = null;
    session.cpuRerollsUsed = 0;
    session.roundSettlement = null;
    session.cpuDialogue = CPU_CONFIGS[opponentId].quotes.greeting;

    const signed = signSessionId(session.id);
    setSessionCookie(req, res, signed);
    res.json({
      sessionToken: signed,
      state: serializeSession(session),
    });
  });

  // Update match settings safely
  app.patch('/api/game/settings', (req: Request, res: Response) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ error: 'セッションが見つかりません。再読み込みしてください。' });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;

    if (body.opponentId !== undefined) {
      if (!isValidOpponentId(body.opponentId)) {
        res.status(400).json({ error: '不正なCPU対戦相手です。' });
        return;
      }
      if (session.turnPhase === 'PLAYER_ROLLING') {
        res.status(409).json({ error: '投擲中の対戦相手変更はできません。' });
        return;
      }
      session.opponentId = body.opponentId;
      session.cpuDialogue = CPU_CONFIGS[body.opponentId].quotes.greeting;
    }

    if (body.ruleMode !== undefined) {
      if (!isValidRuleMode(body.ruleMode)) {
        res.status(400).json({ error: '不正な振り直しルールです。' });
        return;
      }
      session.ruleMode = body.ruleMode;
    }

    if (body.enableShonben !== undefined) {
      if (typeof body.enableShonben !== 'boolean') {
        res.status(400).json({ error: '不正なションベン設定です。' });
        return;
      }
      session.enableShonben = body.enableShonben;
    }

    if (body.startingFunds !== undefined) {
      if (
        typeof body.startingFunds !== 'number' ||
        !ALLOWED_STARTING_FUNDS.has(body.startingFunds)
      ) {
        res.status(400).json({ error: '不正な初期軍資金設定です。' });
        return;
      }
      session.startingFunds = body.startingFunds;
    }

    res.json({ state: serializeSession(session) });
  });

  // Player initial roll (1st throw) — validates betAmount strictly on the server
  app.post('/api/game/roll', (req: Request, res: Response) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ error: 'セッションが無効です。' });
      return;
    }
    if (session.turnPhase !== 'BETTING') {
      res.status(409).json({ error: '現在は初回投擲フェーズではありません。' });
      return;
    }
    if (session.playerFunds <= 0) {
      res.status(409).json({ error: '所持金が不足しています。新規対局を開始してください。' });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const rawBet = body.betAmount;
    const minBet = Math.min(100, session.playerFunds);

    if (
      typeof rawBet !== 'number' ||
      !Number.isSafeInteger(rawBet) ||
      rawBet < minBet ||
      rawBet > session.playerFunds
    ) {
      res.status(400).json({
        error: `賭け金は ${minBet}〜${session.playerFunds}両 の整数で指定してください。`,
      });
      return;
    }

    const dice = secureRollTriplet();
    const isShonben = secureShouldTriggerShonben(session.enableShonben);
    const outcome = evaluateDiceRoll(dice, isShonben);

    session.betAmount = rawBet;
    session.turnPhase = 'PLAYER_ROLLING';
    session.throwNumber = 1;
    session.remainingRerolls = MAX_REROLLS;
    session.playerRerollsUsed = 0;
    session.playerOutcome = outcome;

    res.json({
      dice,
      outcome,
      state: serializeSession(session),
    });
  });

  // Player re-roll (up to MAX_REROLLS = 3) — strictly enforced server-side
  app.post('/api/game/reroll', (req: Request, res: Response) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ error: 'セッションが無効です。' });
      return;
    }
    if (session.turnPhase !== 'PLAYER_ROLLING') {
      res.status(409).json({ error: '現在は振り直しできる状態ではありません。' });
      return;
    }
    if (
      !canPerformReroll(
        session.playerOutcome,
        session.remainingRerolls,
        session.ruleMode
      )
    ) {
      res.status(403).json({
        error: '振り直し回数の上限（3回）に達したか、現在のルールでは振り直しできません。',
      });
      return;
    }

    const dice = secureRollTriplet();
    const isShonben = secureShouldTriggerShonben(session.enableShonben);
    const outcome = evaluateDiceRoll(dice, isShonben);

    session.throwNumber += 1;
    session.remainingRerolls -= 1;
    session.playerRerollsUsed += 1;
    session.playerOutcome = outcome;

    res.json({
      dice,
      outcome,
      state: serializeSession(session),
    });
  });

  // Lock player's roll and execute CPU's turn + settlement authoritatively on server
  app.post('/api/game/stand', (req: Request, res: Response) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ error: 'セッションが無効です。' });
      return;
    }
    if (session.turnPhase !== 'PLAYER_ROLLING' || !session.playerOutcome) {
      res.status(409).json({ error: 'プレイヤーの出目が確定していません。' });
      return;
    }

    const opponent = CPU_CONFIGS[session.opponentId];
    const cpuSteps: CpuRollStep[] = [];
    let cpuRerollsLeft = MAX_REROLLS;
    let cpuRerollsCount = 0;
    let cpuThrow = 1;
    let finalCpuOutcome: RollOutcome | null = null;

    while (true) {
      const dice = secureRollTriplet();
      const isShonben = secureShouldTriggerShonben(session.enableShonben);
      const evaluated = evaluateDiceRoll(dice, isShonben);

      let dialogue = opponent.quotes.rolling;
      if (
        evaluated.yakuType === 'PINZORO' ||
        evaluated.yakuType === 'ARASHI' ||
        evaluated.yakuType === 'SHIGORO'
      ) {
        dialogue = opponent.quotes.highYaku;
      } else if (
        evaluated.yakuType === 'HIFUMI' ||
        evaluated.yakuType === 'SHONBEN' ||
        evaluated.yakuType === 'MENASHI'
      ) {
        dialogue = opponent.quotes.lowRoll;
      }

      cpuSteps.push({
        dice,
        outcome: evaluated,
        throwNumber: cpuThrow,
        remainingRerolls: cpuRerollsLeft,
        rerollsUsed: cpuRerollsCount,
        dialogue,
      });

      finalCpuOutcome = evaluated;

      const wantsReroll = shouldCpuReroll(
        evaluated,
        cpuRerollsLeft,
        session.ruleMode,
        opponent,
        session.playerOutcome
      );

      if (wantsReroll && cpuRerollsLeft > 0) {
        cpuRerollsLeft -= 1;
        cpuRerollsCount += 1;
        cpuThrow += 1;
      } else {
        break;
      }
    }

    const settlement = settleRoundOutcomes(
      session.playerOutcome,
      finalCpuOutcome,
      session.betAmount
    );

    const nextPlayerFunds = Math.max(
      0,
      session.playerFunds + settlement.netDeltaPlayer
    );

    session.cpuOutcome = finalCpuOutcome;
    session.cpuRerollsUsed = cpuRerollsCount;
    session.roundSettlement = settlement;
    session.playerFunds = nextPlayerFunds;

    if (settlement.winner === 'PLAYER') {
      session.cpuDialogue = opponent.quotes.loseRound;
    } else if (settlement.winner === 'CPU') {
      session.cpuDialogue = opponent.quotes.winRound;
    } else {
      session.cpuDialogue = '「同格の引き分けか。次の局で決着をつけよう。」';
    }

    const record: RoundHistoryRecord = {
      roundNumber: session.roundNumber,
      dealer: session.dealer,
      betAmount: session.betAmount,
      playerOutcome: session.playerOutcome,
      playerRerollsUsed: session.playerRerollsUsed,
      cpuOutcome: finalCpuOutcome,
      cpuRerollsUsed: cpuRerollsCount,
      winner: settlement.winner,
      appliedMultiplier: settlement.appliedMultiplier,
      netDeltaPlayer: settlement.netDeltaPlayer,
      summaryReason: settlement.summaryReason,
    };

    session.history = [record, ...session.history].slice(0, 200);
    session.turnPhase = nextPlayerFunds <= 0 ? 'MATCH_OVER' : 'ROUND_RESULT';

    res.json({
      cpuSteps,
      settlement,
      state: serializeSession(session),
    });
  });

  // Advance to next round
  app.post('/api/game/next-round', (req: Request, res: Response) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ error: 'セッションが無効です。' });
      return;
    }
    if (session.turnPhase !== 'ROUND_RESULT' || session.playerFunds <= 0) {
      res.status(409).json({ error: '次の局へ進める状態ではありません。' });
      return;
    }

    const nextMinBet = Math.min(100, session.playerFunds);
    const nextBet = Math.min(
      session.playerFunds,
      Math.max(nextMinBet, session.betAmount)
    );

    if (session.roundSettlement?.winner === 'CPU' && session.dealer === 'PLAYER') {
      session.dealer = 'CPU';
    } else if (
      session.roundSettlement?.winner === 'PLAYER' &&
      session.dealer === 'CPU'
    ) {
      session.dealer = 'PLAYER';
    }

    session.roundNumber += 1;
    session.betAmount = nextBet;
    session.turnPhase = 'BETTING';
    session.throwNumber = 0;
    session.remainingRerolls = MAX_REROLLS;
    session.playerOutcome = null;
    session.playerRerollsUsed = 0;
    session.cpuOutcome = null;
    session.cpuRerollsUsed = 0;
    session.roundSettlement = null;
    session.cpuDialogue = CPU_CONFIGS[session.opponentId].quotes.greeting;

    res.json({ state: serializeSession(session) });
  });

  // Clear history for current session
  app.post('/api/game/clear-history', (req: Request, res: Response) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ error: 'セッションが無効です。' });
      return;
    }
    session.history = [];
    res.json({ state: serializeSession(session) });
  });

  // Reject unknown API routes cleanly
  app.all('/api/{*splat}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'APIエンドポイントが見つかりません。' });
  });

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build artifacts not found. Run npm run build.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Global error handler — prevents stack trace leakage
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'サーバー内部エラーが発生しました。' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
