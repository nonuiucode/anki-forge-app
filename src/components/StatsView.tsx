import { useRef } from 'react';

import { formatReminderDateTime } from '../engine/reminder';
import type {
  AppSettings,
  FrequencyTier,
  ReviewLogEntry,
  ReviewReminderPayload,
  StudyCard,
} from '../types';
import { Segmented, Switch } from './Controls';
import { Icon } from './Icons';

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
    const mastered = subset.filter(
      (c) => c.fsrs.scheduledDays >= 7 || (c.fsrs.state === 'review' && c.fsrs.reps > 0),
    ).length;
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
          <div className="stat-val">
            {accuracy}
            <small>%</small>
          </div>
          <div className="stat-label">今日正确率</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">
            {streak}
            <small>天</small>
          </div>
          <div className="stat-label">连续打卡</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{cards.length}</div>
          <div className="stat-label">总卡片数</div>
        </div>
      </div>

      <section className="card-panel">
        <div className="panel-head">
          <h2 className="panel-title">最近 90 天复习热力图</h2>
        </div>
        <div className="heatmap" role="img" aria-label="最近 90 天复习热力图">
          {cells.map((cell) => {
            const level =
              cell.count === 0
                ? 0
                : cell.count < 10
                  ? 1
                  : cell.count < 30
                    ? 2
                    : cell.count < 60
                      ? 3
                      : 4;
            return (
              <span
                key={cell.key}
                className={`heat-cell l${level}${cell.key === todayStr ? ' is-today' : ''}`}
                style={{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }}
                title={`${cell.key}: ${cell.count} 次`}
              />
            );
          })}
        </div>
        <div className="heatmap-foot">
          <span>近 13 周</span>
          <span className="heatmap-legend">
            少
            <i className="heat-cell" />
            <i className="heat-cell l1" />
            <i className="heat-cell l2" />
            <i className="heat-cell l3" />
            <i className="heat-cell l4" />多
          </span>
        </div>
      </section>

      <section className="card-panel">
        <div className="panel-head">
          <h2 className="panel-title">各考频层级掌握度</h2>
        </div>
        <div>
          {tierStats.map((item) => {
            const pct = item.total > 0 ? Math.round((item.mastered / item.total) * 100) : 0;
            return (
              <div key={item.tier} className="meter">
                <div className="meter-head">
                  <span>{TIER_LABELS[item.tier]}</span>
                  <span className="num-tab">
                    {item.mastered} / {item.total} ({pct}%)
                  </span>
                </div>
                <div className="progress-track">
                  <div className={`progress-fill tier-${item.tier}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-panel">
        <div className="panel-head">
          <h2 className="panel-title">复习提醒</h2>
          <span className={`pill ${settings.reminderEnabled ? 'pill-topic' : ''}`}>
            {settings.reminderEnabled ? '已开启' : '未开启'}
          </span>
        </div>
        <div className="list-group">
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">每日复习提醒</div>
            </div>
            <Switch
              checked={settings.reminderEnabled}
              label="开启每日复习提醒"
              onChange={(v) => onToggleReminder(v)}
            />
          </div>
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">提醒时间</div>
            </div>
            <input
              type="time"
              aria-label="每日提醒时间"
              className="input-field is-compact num-tab"
              value={settings.reminderTime}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  reminderTime: e.target.value || '20:30',
                })
              }
            />
          </div>
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">FSRS 到期智能提醒</div>
              <div className="list-row-sub">
                已学卡片进入最佳复习窗口时提醒，23:00–07:30 自动顺延至次日 08:30
              </div>
            </div>
            <Switch
              checked={settings.smartDueReminder}
              label="FSRS 到期智能提醒"
              onChange={(v) => onUpdateSettings({ ...settings, smartDueReminder: v })}
            />
          </div>
        </div>
        <div className="panel-foot">
          <div className="panel-sub num-tab" style={{ marginTop: 0 }}>
            {settings.reminderEnabled
              ? `每日 ${String(reminderPayload.hour).padStart(2, '0')}:${String(reminderPayload.minute).padStart(2, '0')} 提醒${
                  reminderPayload.nextDueAtMs
                    ? ` · 下一批到期提醒：${formatReminderDateTime(reminderPayload.nextDueAtMs)}`
                    : ''
                }`
              : '开启后将在每日设定时间与 FSRS 到期窗口推送本地通知'}
          </div>
          <button type="button" className="btn btn-sm btn-subtle" onClick={onTestReminder}>
            <Icon name="bell" size={16} />
            测试通知
          </button>
        </div>
      </section>

      <section className="card-panel">
        <h2 className="panel-title">设置与备份</h2>

        <div className="setting-block">
          <div className="list-row-title">护眼主题</div>
          <Segmented<AppSettings['theme']>
            label="护眼主题"
            value={settings.theme}
            onChange={(v) => onUpdateSettings({ ...settings, theme: v })}
            options={[
              { value: 'system', label: '跟随系统', icon: 'monitor' },
              { value: 'light', label: '晴海', icon: 'sun' },
              { value: 'dark', label: '深海', icon: 'moon' },
            ]}
          />
        </div>

        <div className="list-group">
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">题目乱序出题</div>
            </div>
            <Switch
              checked={settings.shuffleQuestions}
              label="题目乱序出题"
              onChange={(v) => onUpdateSettings({ ...settings, shuffleQuestions: v })}
            />
          </div>
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">选择题选项乱序</div>
            </div>
            <Switch
              checked={settings.shuffleOptions}
              label="选择题选项乱序"
              onChange={(v) => onUpdateSettings({ ...settings, shuffleOptions: v })}
            />
          </div>
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">卡壳自动收入阈值</div>
              <div className="list-row-sub">遗忘次数，2–10</div>
            </div>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="减少"
                disabled={settings.leechThreshold <= 2}
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    leechThreshold: Math.max(2, settings.leechThreshold - 1),
                  })
                }
              >
                <Icon name="minus" size={16} />
              </button>
              <input
                type="number"
                min={2}
                max={10}
                className="stepper-input"
                aria-label="卡壳自动收入阈值"
                value={settings.leechThreshold}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    leechThreshold: Math.max(2, Math.min(10, Number(e.target.value) || 3)),
                  })
                }
              />
              <button
                type="button"
                className="stepper-btn"
                aria-label="增加"
                disabled={settings.leechThreshold >= 10}
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    leechThreshold: Math.min(10, settings.leechThreshold + 1),
                  })
                }
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
          <div className="list-row">
            <div className="list-row-text">
              <div className="list-row-title">每日新卡上限</div>
              <div className="list-row-sub">5–200 张</div>
            </div>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="减少"
                disabled={settings.dailyNewLimit <= 5}
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    dailyNewLimit: Math.max(5, settings.dailyNewLimit - 5),
                  })
                }
              >
                <Icon name="minus" size={16} />
              </button>
              <input
                type="number"
                min={5}
                max={200}
                className="stepper-input"
                aria-label="每日新卡上限"
                value={settings.dailyNewLimit}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    dailyNewLimit: Math.max(5, Math.min(200, Number(e.target.value) || 30)),
                  })
                }
              />
              <button
                type="button"
                className="stepper-btn"
                aria-label="增加"
                disabled={settings.dailyNewLimit >= 200}
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    dailyNewLimit: Math.min(200, settings.dailyNewLimit + 5),
                  })
                }
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="section-divider" />

        <div className="list-group">
          <button type="button" className="list-row is-action" onClick={onExportBackup}>
            <span className="list-row-icon">
              <Icon name="download" size={18} />
            </span>
            <div className="list-row-text">
              <div className="list-row-title">导出全量备份 (.json)</div>
              <div className="list-row-sub">生成备份文件，可分享或保存到本地</div>
            </div>
            <Icon name="chevronRight" size={18} className="chevron" />
          </button>
          <button
            type="button"
            className="list-row is-action"
            onClick={() => backupInputRef.current?.click()}
          >
            <span className="list-row-icon">
              <Icon name="upload" size={18} />
            </span>
            <div className="list-row-text">
              <div className="list-row-title">恢复全量备份</div>
              <div className="list-row-sub">选择之前导出的 .json 备份文件</div>
            </div>
            <Icon name="chevronRight" size={18} className="chevron" />
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
      </section>
    </>
  );
}
