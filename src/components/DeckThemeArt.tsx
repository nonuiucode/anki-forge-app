interface MarineHeroProps {
  totalCards: number;
  todayReviewed: number;
  dueTotal: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  onToggleShuffleQuestions: () => void;
  onToggleShuffleOptions: () => void;
}

export function SilverAppleLogo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="seaLogoGrad" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#081C38" />
          <stop offset="100%" stopColor="#13457C" />
        </linearGradient>
        <linearGradient id="silverChipGrad" x1="14" y1="12" x2="50" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#D8E5F3" />
          <stop offset="100%" stopColor="#9DB7D4" />
        </linearGradient>
        <linearGradient id="appleEmblemGrad" x1="25" y1="22" x2="39" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F24B64" />
          <stop offset="100%" stopColor="#A91D34" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#seaLogoGrad)" stroke="#3B79B8" strokeWidth="1.5" />
      <path d="M8 44 Q20 39 32 44 T56 44 L56 58 Q32 63 8 58 Z" fill="#1F66AC" opacity="0.35" />
      <circle cx="32" cy="32" r="22" stroke="url(#silverChipGrad)" strokeWidth="4.2" strokeDasharray="7.5 3.6" />
      <circle cx="32" cy="32" r="18.2" fill="#0B2344" stroke="#E2ECF7" strokeWidth="1.2" opacity="0.95" />
      <circle cx="32" cy="9.8" r="1.4" fill="#E2ECF7" />
      <circle cx="32" cy="54.2" r="1.4" fill="#E2ECF7" />
      <circle cx="9.8" cy="32" r="1.4" fill="#E2ECF7" />
      <circle cx="54.2" cy="32" r="1.4" fill="#E2ECF7" />
      <path d="M32.2 21.5 C32.2 18.6 33.8 16.8 35.6 15.8" stroke="#D8E5F3" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M33.2 19.6 C36.2 17.5 39.2 18.4 39.5 21 C36.8 21.7 34.4 21.1 33.2 19.6 Z" fill="#67E8F9" />
      <path
        d="M32 23.6 C29.5 21.8 24.4 22.8 23.2 27.9 C21.9 33.3 25.1 41.2 28.9 42.3 C30.4 42.7 31.3 41.7 32 41.7 C32.7 41.7 33.6 42.7 35.1 42.3 C38.9 41.2 42.1 33.3 40.8 27.9 C39.6 22.8 34.5 21.8 32 23.6 Z"
        fill="url(#appleEmblemGrad)"
        stroke="#FFD5DC"
        strokeWidth="0.9"
      />
      <ellipse cx="27.3" cy="27.6" rx="1.6" ry="3.2" transform="rotate(-18 27.3 27.6)" fill="#FFFFFF" opacity="0.45" />
    </svg>
  );
}

export function AppleCoinMini({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#0F2D54" stroke="#B7CAE0" strokeWidth="1.4" strokeDasharray="3.2 1.6" />
      <path d="M12.2 7 C12.5 5.4 13.7 4.4 15 4" stroke="#E2ECF7" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M12 8.2 C10.4 7.1 7.4 7.8 6.8 10.7 C6.1 14 8.2 18.1 10.3 18.7 C11.1 18.9 11.6 18.4 12 18.4 C12.4 18.4 12.9 18.9 13.7 18.7 C15.8 18.1 17.9 14 17.2 10.7 C16.6 7.8 13.6 7.1 12 8.2 Z"
        fill="#DF3B56"
      />
    </svg>
  );
}

export function MarineHeroCover({
  totalCards,
  todayReviewed,
  dueTotal,
  shuffleQuestions,
  shuffleOptions,
  onToggleShuffleQuestions,
  onToggleShuffleOptions,
}: MarineHeroProps) {
  return (
    <section className="marine-hero" aria-label="玖记封面概览">
      <svg className="marine-hero-bg" viewBox="0 0 720 220" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="heroSea" x1="0" y1="0" x2="720" y2="220" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#071830" />
            <stop offset="52%" stopColor="#0E3464" />
            <stop offset="100%" stopColor="#16528E" />
          </linearGradient>
          <radialGradient id="heroMoon" cx="84%" cy="24%" r="48%">
            <stop offset="0%" stopColor="#9CD0FF" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#9CD0FF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="720" height="220" fill="url(#heroSea)" />
        <rect width="720" height="220" fill="url(#heroMoon)" />
        <path
          d="M0 154 C110 128 210 176 340 150 C470 124 590 170 720 138 L720 220 L0 220 Z"
          fill="#226BB5"
          opacity="0.28"
        />
        <path
          d="M0 178 C140 152 250 198 395 170 C530 144 635 186 720 164 L720 220 L0 220 Z"
          fill="#5AA6EB"
          opacity="0.16"
        />
        <g transform="translate(566 28) rotate(8)" opacity="0.2">
          <rect x="0" y="0" width="96" height="134" rx="12" fill="#0B2242" stroke="#DCE9F8" strokeWidth="2" />
          <rect x="8" y="8" width="80" height="118" rx="8" stroke="#9EC4EB" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M48 45 L58 67 L48 89 L38 67 Z" fill="#DCE9F8" />
        </g>
        <circle cx="96" cy="42" r="1.8" fill="#E2EEFA" opacity="0.55" />
        <circle cx="218" cy="28" r="1.3" fill="#B5D8FA" opacity="0.45" />
        <circle cx="445" cy="54" r="2" fill="#FFFFFF" opacity="0.4" />
        <circle cx="520" cy="112" r="1.4" fill="#9BD0FF" opacity="0.5" />
      </svg>

      <div className="marine-hero-inner">
        <div className="marine-hero-top">
          <div className="marine-hero-brand">
            <SilverAppleLogo size={46} />
            <div>
              <div className="marine-hero-kicker">♠ ♥ 蔚蓝牌桌 · 离线 FSRS 记忆卡组 ♦ ♣</div>
              <div className="marine-hero-title">每一次翻牌，都在记忆曲线上落子</div>
            </div>
          </div>
          <div className="marine-suit-cluster" aria-hidden="true">
            <span>♠</span>
            <span className="suit-crimson">♥</span>
            <span>♣</span>
            <span className="suit-crimson">♦</span>
          </div>
        </div>

        <div className="marine-chip-row">
          <div className="chip-stat">
            <span className="chip-dot chip-dot-silver" />
            <span className="num-tab">今日筹码 <strong>{todayReviewed}</strong></span>
          </div>
          <div className="chip-stat">
            <span className="chip-dot chip-dot-ocean" />
            <span className="num-tab">待翻牌 <strong>{dueTotal}</strong></span>
          </div>
          <div className="chip-stat">
            <span className="chip-dot chip-dot-apple" />
            <span className="num-tab">总藏牌 <strong>{totalCards}</strong></span>
          </div>
        </div>

        <div className="marine-toggle-row">
          <button
            type="button"
            className={`hero-toggle-chip ${shuffleQuestions ? 'active' : ''}`}
            onClick={onToggleShuffleQuestions}
          >
            <span>洗牌 · 题目乱序</span>
            <strong>{shuffleQuestions ? '开' : '关'}</strong>
          </button>
          <button
            type="button"
            className={`hero-toggle-chip ${shuffleOptions ? 'active' : ''}`}
            onClick={onToggleShuffleOptions}
          >
            <span>洗牌 · 选项乱序</span>
            <strong>{shuffleOptions ? '开' : '关'}</strong>
          </button>
        </div>
      </div>
    </section>
  );
}
