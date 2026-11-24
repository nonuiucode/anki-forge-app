import { useRef } from 'react';

import { formatReminderDateTime } from '../engine/reminder';
import type {
  AppSettings,
  FrequencyTier,
  ReviewLogEntry,
  ReviewReminderPayload,
  StudyCard,
} from '../types';

interface StatsViewProps {
  cards: StudyCard[];
  logs: ReviewLogEntry[];
  settings: AppSettings;
  reminderPayload: ReviewReminderPayload;
  onUpdateSettings: (next: AppSettings) => void;
  onToggleReminder: (enabled: boolean) => void;
  onTestReminder: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}

const TIER_LABELS: Record<FrequencyTier, string> = {
  high: '高频必背',
  medium: '中频常考',
  low: '真题常规',
  supplement: '课件补充',
};

function dateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function StatsView({
  cards,
  logs,
  settings,
  reminderPayload,
  onUpdateSettings,
  onToggleReminder,
  onTestReminder,
  onExportBackup,
  onImportBackup,
}: StatsViewProps) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const now = Date.now();
  const todayStr = dateKey(now);

  const dayCounts = new Map<string, number>();
  let todayGood = 0;
  let todayTotal = 0;
  for (const log of logs) {
    const dk = dateKey(log.reviewedAt);
    dayCounts.set(dk, (dayCounts.get(dk) ?? 0) + 1);
    if (dk === todayStr) {
      todayTotal += 1;
      if (log.rating >= 3) todayGood += 1;
    }
  }
  const accuracy = todayTotal > 0 ? Math.round((todayGood / todayTotal) * 100) : 100;

  // Compute current streak ending today (or yesterday)
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const dk = dateKey(now - offset * 86_400_000);
    if ((dayCounts.get(dk) ?? 0) > 0) {
      streak += 1;
    } else if (offset === 0) {
      continue;
    } else {
      break;
    }
  }

  // 91 days (13 weeks x 7 days) heatmap
  const cells: Array<{ key: string; count: number; col: number; row: number }> = [];
  for (let i = 90; i >= 0; i -= 1) {
    const idx = 90 - i;
    const dk = dateKey(now - i * 86_400_000);
    cells.push({
      key: dk,
      count: dayCounts.get(dk) ?? 0,
      col: Math.floor(idx / 7),
      row: idx % 7,
    });
  }

  const tierStats = (['high', 'medium', 'low', 'supplement'] as FrequencyTier[]).map((tier) => {
    const subset = cards.filter((c) => c.frequencyTier === tier);
    const mastered = subset.filter((c) => c.fsrs.scheduledDays >= 7 || (c.fsrs.state === 'review' && c.fsrs.reps > 0)).length;
    return { tier, total: subset.length, mastered };
  });

  return (
    <>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-val">{todayTotal}</div>
          <div className="stat-label">今日复习</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{accuracy}%</div>
          <div className="stat-label">今日正确率</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{streak} 天</div>
          <div className="stat-label">连续打卡</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{cards.length}</div>
          <div className="stat-label">总卡片数</div>
        </div>
      </div>

      <div className="card-panel">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>最近 90 天复习热力图</div>
        <svg viewBox="0 0 210 112" style={{ width: '100%', maxWidth: 460, display: 'block' }}>
          {cells.map((cell) => {
            const level =
              cell.count === 0 ? 0 : cell.count < 10 ? 1 : cell.count < 30 ? 2 : cell.count < 60 ? 3 : 4;
            return (
              <rect
                key={cell.key}
                x={cell.col * 16}
                y={cell.row * 16}
                width={12}
                height={12}
                rx={2.5}
                fill={`var(--heat-${level})`}
              >
                <title>{`${cell.key}: ${cell.count} 次`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="card-panel">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>各考频层级掌握度</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tierStats.map((item) => {
            const pct = item.total > 0 ? Math.round((item.mastered / item.total) * 100) : 0;
            return (
              <div key={item.tier}>
                <div className="row-between" style={{ fontSize: 13, marginBottom: 4 }}>
                  <span>{TIER_LABELS[item.tier]}</span>
                  <span className="num-tab">
                    {item.mastered} / {item.total} ({pct}%)
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-panel">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>复习提醒</div>
          <span className={`pill ${settings.reminderEnabled ? 'pill-topic' : ''}`}>
            {settings.reminderEnabled ? '已开启' : '未开启'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row-between">
            <span style={{ fontSize: 14 }}>开启每日复习提醒</span>
            <input
              type="checkbox"
              aria-label="开启每日复习提醒"
              style={{ width: 20, height: 20, accentColor: 'var(--accent)', cursor: 'pointer' }}
              checked={settings.reminderEnabled}
              onChange={(e) => onToggleReminder(e.target.checked)}
            />
          </div>

          <div className="row-between">
            <span style={{ fontSize: 14 }}>每日提醒时间</span>
            <input
              type="time"
              aria-label="每日提醒时间"
              className="input-field num-tab"
              style={{ width: 'auto', minWidth: 112 }}
              value={settings.reminderTime}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  reminderTime: e.target.value || '20:30',
                })
              }
            />
          </div>

          <div className="row-between">
            <div>
              <div style={{ fontSize: 14 }}>FSRS 到期智能提醒</div>
              <div className="top-sub">
                已学卡片进入最佳复习窗口时提醒，23:00–07:30 自动顺延至次日 08:30
              </div>
            </div>
            <input
              type="checkbox"
              aria-label="FSRS 到期智能提醒"
              style={{ width: 20, height: 20, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
              checked={settings.smartDueReminder}
              onChange={(e) =>
                onUpdateSettings({ ...settings, smartDueReminder: e.target.checked })
              }
            />
          </div>

          <div className="row-between" style={{ paddingTop: 2 }}>
            <div className="top-sub num-tab">
              {settings.reminderEnabled
                ? `每日 ${String(reminderPayload.hour).padStart(2, '0')}:${String(reminderPayload.minute).padStart(2, '0')} 提醒${
                    reminderPayload.nextDueAtMs
                      ? ` · 下一批到期提醒：${formatReminderDateTime(reminderPayload.nextDueAtMs)}`
                      : ''
                  }`
                : '开启后将在每日设定时间与 FSRS 到期窗口推送本地通知'}
            </div>
            <button type="button" className="btn btn-sm btn-subtle" onClick={onTestReminder}>
              发送测试通知
            </button>
          </div>
        </div>
      </div>

      <div className="card-panel">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>设置与备份</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row-between">
            <span style={{ fontSize: 14 }}>护眼主题</span>
            <select
              className="select-field"
              style={{ width: 'auto' }}
              value={settings.theme}
              onChange={(e) =>
                onUpdateSettings({ ...settings, theme: e.target.value as AppSettings['theme'] })
              }
            >
              <option value="system">跟随系统</option>
              <option value="light">晴海银波（浅色）</option>
              <option value="dark">深海月光（暗夜）</option>
            </select>
          </div>

          <div className="row-between">
            <span style={{ fontSize: 14 }}>题目乱序出题</span>
            <input
              type="checkbox"
              aria-label="题目乱序出题"
              style={{ width: 20, height: 20, accentColor: 'var(--accent)', cursor: 'pointer' }}
              checked={settings.shuffleQuestions}
              onChange={(e) =>
                onUpdateSettings({ ...settings, shuffleQuestions: e.target.checked })
              }
            />
          </div>

          <div className="row-between">
            <span style={{ fontSize: 14 }}>选择题选项乱序</span>
            <input
              type="checkbox"
              aria-label="选择题选项乱序"
              style={{ width: 20, height: 20, accentColor: 'var(--accent)', cursor: 'pointer' }}
              checked={settings.shuffleOptions}
              onChange={(e) =>
                onUpdateSettings({ ...settings, shuffleOptions: e.target.checked })
              }
            />
          </div>

          <div className="row-between">
            <span style={{ fontSize: 14 }}>卡壳自动收入阈值（遗忘次数）</span>
            <input
              type="number"
              min={2}
              max={10}
              className="input-field"
              style={{ width: 84 }}
              value={settings.leechThreshold}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  leechThreshold: Math.max(2, Math.min(10, Number(e.target.value) || 3)),
                })
              }
            />
          </div>

          <div className="row-between">
            <span style={{ fontSize: 14 }}>每日新卡上限</span>
            <input
              type="number"
              min={5}
              max={200}
              className="input-field"
              style={{ width: 84 }}
              value={settings.dailyNewLimit}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  dailyNewLimit: Math.max(5, Math.min(200, Number(e.target.value) || 30)),
                })
              }
            />
          </div>

          <div className="row-wrap" style={{ paddingTop: 4 }}>
            <button type="button" className="btn btn-sm" onClick={onExportBackup}>
              导出全量备份 (.json)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => backupInputRef.current?.click()}
            >
              恢复全量备份
            </button>
          </div>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onImportBackup(f);
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
