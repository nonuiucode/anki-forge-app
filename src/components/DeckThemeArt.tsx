interface HeroCoverProps {
  isDark: boolean;
  totalCards: number;
  todayReviewed: number;
  dueTotal: number;
}

export function AppMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      className={`app-mark ${className}`.trim()}
      src="./art/app-icon.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}

export function HeroCover({ isDark, totalCards, todayReviewed, dueTotal }: HeroCoverProps) {
  const eyebrow = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const title =
    totalCards === 0
      ? '导入一副卡片，开始今天的记忆'
      : dueTotal > 0
        ? `还有 ${dueTotal} 张卡片等你翻开`
        : '今天的复习都完成了';

  return (
    <section className={`hero-cover ${isDark ? 'is-dark' : 'is-light'}`} aria-label="今日概览">
      <img
        className="hero-cover-img"
        src={isDark ? './art/hero-dark.webp' : './art/hero-light.webp'}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
      />
      <div className="hero-cover-scrim" aria-hidden="true" />
      <div className="hero-inner">
        <div>
          <div className="hero-eyebrow">{eyebrow}</div>
          <h2 className="hero-title">{title}</h2>
        </div>
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-val">{todayReviewed}</div>
            <div className="kpi-label">今日已刷</div>
          </div>
          <div className="kpi">
            <div className={`kpi-val${dueTotal > 0 ? ' is-alert' : ''}`}>{dueTotal}</div>
            <div className="kpi-label">待复习</div>
          </div>
          <div className="kpi">
            <div className="kpi-val">{totalCards}</div>
            <div className="kpi-label">总卡数</div>
          </div>
        </div>
      </div>
    </section>
  );
}
