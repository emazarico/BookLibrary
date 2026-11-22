import React from 'react';
import { BarChart3, Clock, PieChart, Star, Tag } from 'lucide-react';
import type { AnalyticsBreakdown } from '../../utils/analytics';

interface BreakdownChartsProps {
  breakdown: AnalyticsBreakdown;
}

export const BreakdownCharts: React.FC<BreakdownChartsProps> = ({ breakdown }) => {
  const { formatBreakdown, topTags, ratingDistribution, pace, scopeLabel, totalBooksEvaluated } =
    breakdown;

  const nonZeroFormats = formatBreakdown.filter((f) => f.count > 0);
  const totalFormatCount = nonZeroFormats.reduce((sum, f) => sum + f.count, 0);

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const maxTagCount = Math.max(1, ...topTags.map((t) => t.count));
  const maxRatingCount = Math.max(1, ...ratingDistribution.map((r) => r.count));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 1. Formats Donut Chart */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h2 className="font-serif-display text-base font-bold text-stone-900 dark:text-stone-100">
              Formats
            </h2>
          </div>
          <span className="text-[11px] font-medium text-stone-400 capitalize">
            {totalBooksEvaluated} {scopeLabel}
          </span>
        </div>

        {totalFormatCount === 0 ? (
          <p className="text-xs text-stone-400 italic py-6 text-center">
            No books in scope yet.
          </p>
        ) : (
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 90 90" className="w-24 h-24 -rotate-90">
                <circle
                  cx="45"
                  cy="45"
                  r={radius}
                  fill="none"
                  strokeWidth="12"
                  className="stroke-stone-100 dark:stroke-stone-800"
                />
                {nonZeroFormats.map((slice) => {
                  const segLength = (slice.count / totalFormatCount) * circumference;
                  const dashOffset = -cumulativeOffset;
                  cumulativeOffset += segLength;
                  return (
                    <circle
                      key={slice.format}
                      cx="45"
                      cy="45"
                      r={radius}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="12"
                      strokeDasharray={`${segLength} ${circumference}`}
                      strokeDashoffset={dashOffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute text-center">
                <span className="text-sm font-bold text-stone-900 dark:text-stone-100 block leading-none">
                  {totalFormatCount}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-stone-400">books</span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {formatBreakdown.map((item) => (
                <div key={item.format} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 font-medium text-stone-700 dark:text-stone-200">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </span>
                  <span className="font-semibold text-stone-500 dark:text-stone-400 tabular-nums">
                    {item.count} ({item.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Top Topics & Tags */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-serif-display text-base font-bold text-stone-900 dark:text-stone-100">
              Top Topics &amp; Tags
            </h2>
          </div>
          <span className="text-[11px] font-medium text-stone-400">{topTags.length} tags</span>
        </div>

        {topTags.length === 0 ? (
          <p className="text-xs text-stone-400 italic py-6 text-center">
            Tag books with genres or themes (e.g. #sci-fi, #history) to see topic distribution.
          </p>
        ) : (
          <div className="space-y-2">
            {topTags.map((item) => {
              const widthPct = Math.max(8, Math.round((item.count / maxTagCount) * 100));
              return (
                <div key={item.tag} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-700 dark:text-stone-200 truncate">
                      #{item.tag}
                    </span>
                    <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 tabular-nums shrink-0">
                      {item.count}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Ratings & Reading Pace */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <h2 className="font-serif-display text-base font-bold text-stone-900 dark:text-stone-100">
              Ratings &amp; Pace
            </h2>
          </div>
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
        </div>

        <div className="space-y-1.5">
          {ratingDistribution.map((bucket) => {
            const widthPct =
              bucket.count > 0 ? Math.max(8, Math.round((bucket.count / maxRatingCount) * 100)) : 0;
            return (
              <div key={bucket.stars} className="flex items-center gap-2 text-xs">
                <span className="w-7 font-semibold text-stone-600 dark:text-stone-300 tabular-nums">
                  {bucket.label}
                </span>
                <div className="flex-1 h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="w-6 text-right text-[11px] font-medium text-stone-500 tabular-nums">
                  {bucket.count}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100 dark:border-stone-800/80">
          <div className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/60">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
              Books / Mo
            </p>
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {pace.booksPerMonth}
            </p>
          </div>
          <div className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/60">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
              Pages / Day
            </p>
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {pace.pagesPerActiveDay > 0 ? pace.pagesPerActiveDay : '—'}
            </p>
          </div>
          <div className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/60">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
              Avg Days / Book
            </p>
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {pace.avgDaysToFinish !== null ? `${pace.avgDaysToFinish}d` : '—'}
            </p>
          </div>
          <div className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/60">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3 text-violet-500" /> Audio Hrs
            </p>
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {pace.totalAudioHours > 0 ? `${pace.totalAudioHours}h` : '0h'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
