import React, { useMemo, useState } from 'react';
import { CalendarDays, Flame } from 'lucide-react';
import type { HeatmapData, HeatmapDay } from '../../utils/analytics';
import { formatMinutesHuman } from '../../utils/progress';

interface ReadingHeatmapProps {
  data: HeatmapData;
  yearFilter: number | 'all';
}

const LEVEL_CLASSES: Record<HeatmapDay['level'], string> = {
  0: 'bg-stone-100 dark:bg-stone-800/80 border-stone-200/70 dark:border-stone-700/60',
  1: 'bg-amber-200 dark:bg-amber-900/65 border-amber-300/70 dark:border-amber-800/70',
  2: 'bg-amber-400 dark:bg-amber-700/85 border-amber-500/70 dark:border-amber-600/80',
  3: 'bg-orange-500 dark:bg-amber-500 border-orange-600/70 dark:border-amber-400/70',
  4: 'bg-emerald-600 dark:bg-emerald-500 border-emerald-700/70 dark:border-emerald-400/70',
};

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export const ReadingHeatmap: React.FC<ReadingHeatmapProps> = ({ data, yearFilter }) => {
  const defaultFocusDay = useMemo(() => {
    for (let w = data.weeks.length - 1; w >= 0; w--) {
      for (let d = data.weeks[w].length - 1; d >= 0; d--) {
        const cell = data.weeks[w][d];
        if (cell.inRange && cell.score > 0) return cell;
      }
    }
    return null;
  }, [data.weeks]);

  const [focusedDay, setFocusedDay] = useState<HeatmapDay | null>(null);
  const shownDay = focusedDay || defaultFocusDay;

  const monthByWeek = useMemo(() => {
    const map = new Map<number, string>();
    for (const lbl of data.monthLabels) {
      map.set(lbl.weekIndex, lbl.label);
    }
    return map;
  }, [data.monthLabels]);

  return (
    <section className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
              Daily Reading Activity ({yearFilter === 'all' ? 'Last 365 Days' : yearFilter})
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {data.totalActiveDays} active {data.totalActiveDays === 1 ? 'day' : 'days'} ·{' '}
              {data.totalSessions} {data.totalSessions === 1 ? 'session' : 'sessions'} ·{' '}
              <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 dark:text-amber-300">
                <Flame className="w-3 h-3 text-orange-500" />
                Longest streak: {data.longestStreak}d
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400 self-start sm:self-auto">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              className={`w-3 h-3 rounded-[3px] border ${LEVEL_CLASSES[lvl]}`}
              aria-hidden="true"
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Scrollable Heatmap Grid */}
      <div className="overflow-x-auto custom-scrollbar pb-1">
        <div className="inline-flex flex-col gap-1 min-w-max">
          {/* Month Headers */}
          <div className="flex gap-1 pl-8 text-[10px] font-semibold text-stone-400 h-4">
            {data.weeks.map((_, weekIdx) => (
              <div key={weekIdx} className="w-3 shrink-0 overflow-visible whitespace-nowrap">
                {monthByWeek.get(weekIdx) || ''}
              </div>
            ))}
          </div>

          <div className="flex gap-1.5">
            {/* Weekday Y-axis */}
            <div className="flex flex-col gap-1 w-6 shrink-0 text-[10px] font-medium text-stone-400">
              {WEEKDAY_LABELS.map((lbl, idx) => (
                <div key={idx} className="h-3 leading-3 flex items-center">
                  {lbl}
                </div>
              ))}
            </div>

            {/* Week Columns */}
            <div className="flex gap-1">
              {data.weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {week.map((day, dayIdx) => {
                    if (!day.inRange) {
                      return <div key={`${weekIdx}-${dayIdx}`} className="w-3 h-3" />;
                    }
                    const isFocused = shownDay?.date === day.date;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onMouseEnter={() => setFocusedDay(day)}
                        onClick={() => setFocusedDay(day)}
                        title={`${day.date}: ${day.pages} pp, ${day.chapters} ch, ${day.minutes}m audio, ${day.finishedBooks} finished`}
                        aria-label={`${day.date}: ${day.score} activity points`}
                        className={`w-3 h-3 rounded-[3px] border transition-transform cursor-pointer ${
                          LEVEL_CLASSES[day.level]
                        } ${isFocused ? 'ring-2 ring-stone-900 dark:ring-white scale-110' : ''}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Selected / Hovered Day Detail Strip */}
      <div className="px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-300 flex flex-wrap items-center justify-between gap-2">
        {shownDay ? (
          <>
            <span className="font-semibold text-stone-800 dark:text-stone-100 font-mono">
              {shownDay.date}
            </span>
            <span>
              {shownDay.score === 0
                ? 'No reading logged on this day.'
                : [
                    shownDay.pages > 0 ? `${shownDay.pages} pages` : null,
                    shownDay.chapters > 0 ? `${shownDay.chapters} chapters` : null,
                    shownDay.minutes > 0 ? `${formatMinutesHuman(shownDay.minutes)} audio` : null,
                    shownDay.sessions > 0
                      ? `${shownDay.sessions} ${shownDay.sessions === 1 ? 'session' : 'sessions'}`
                      : null,
                    shownDay.finishedBooks > 0
                      ? `${shownDay.finishedBooks} finished`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
          </>
        ) : (
          <span className="text-stone-400">
            Log sessions or finish books to light up your reading activity calendar.
          </span>
        )}
      </div>
    </section>
  );
};
