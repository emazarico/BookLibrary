import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  Calendar,
  Download,
  Flame,
  Gift,
  Pencil,
  Plus,
  Printer,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { exportReadingLogsCsv } from '../../services/importExport';
import { useLibrary } from '../../store/LibraryContext';
import type { Book } from '../../types/library';
import {
  buildDailyActivityHeatmap,
  computeAnalyticsBreakdown,
} from '../../utils/analytics';
import { computeReadingBadges } from '../../utils/badges';
import { formatMinutesHuman, formatReadingLogBadge } from '../../utils/progress';
import {
  buildTimelineGroups,
  computeMonthlyStats,
  computeReadingSummary,
  getAvailableYears,
  parseYearMonth,
} from '../../utils/stats';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';
import { BookDetailDrawer } from '../library/BookDetailDrawer';
import { BookFormModal } from '../library/BookFormModal';
import { BreakdownCharts } from './BreakdownCharts';
import { LogSessionModal } from './LogSessionModal';
import { MonthlyChart } from './MonthlyChart';
import { ReadingHeatmap } from './ReadingHeatmap';

interface TimelineViewProps {
  onOpenPdfExport: () => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ onOpenPdfExport }) => {
  const {
    activeProfile,
    profileBooks,
    profileLogs,
    updateProfile,
    deleteReadingLog,
  } = useLibrary();

  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(
    () => getAvailableYears(profileBooks, profileLogs),
    [profileBooks, profileLogs],
  );

  const [yearFilter, setYearFilter] = useState<number | 'all'>(currentYear);
  const [chartMetric, setChartMetric] = useState<'pages' | 'books'>('pages');
  const [includeBackfill, setIncludeBackfill] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'timeline' | 'sessions'>('timeline');
  const [sessionBookFilter, setSessionBookFilter] = useState<string>('all');

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logBookId, setLogBookId] = useState<string | undefined>(undefined);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const [editBook, setEditBook] = useState<Book | null>(null);

  const chartYear = yearFilter === 'all' ? currentYear : yearFilter;

  const monthlyBuckets = useMemo(
    () => computeMonthlyStats(profileBooks, profileLogs, chartYear, includeBackfill),
    [profileBooks, profileLogs, chartYear, includeBackfill],
  );

  const summary = useMemo(
    () => computeReadingSummary(profileBooks, profileLogs, yearFilter, includeBackfill),
    [profileBooks, profileLogs, yearFilter, includeBackfill],
  );

  const heatmapData = useMemo(
    () => buildDailyActivityHeatmap(profileBooks, profileLogs, yearFilter),
    [profileBooks, profileLogs, yearFilter],
  );

  const breakdownData = useMemo(
    () => computeAnalyticsBreakdown(profileBooks, profileLogs, yearFilter),
    [profileBooks, profileLogs, yearFilter],
  );

  const badges = useMemo(
    () => computeReadingBadges(profileBooks, profileLogs, activeProfile?.badgeRewards),
    [profileBooks, profileLogs, activeProfile?.badgeRewards],
  );
  const unlockedCount = useMemo(
    () => badges.filter((b) => b.unlocked).length,
    [badges],
  );

  const totalAudioMinutes = useMemo(() => {
    let sum = 0;
    for (const l of profileLogs) {
      if (!l.minutesListened) continue;
      if (yearFilter !== 'all') {
        const ym = parseYearMonth(l.date);
        if (!ym || ym.year !== yearFilter) continue;
      }
      sum += l.minutesListened;
    }
    return sum;
  }, [profileLogs, yearFilter]);

  const timelineGroups = useMemo(() => {
    const groups = buildTimelineGroups(profileBooks, yearFilter);
    if (selectedMonth === null) return groups;
    const targetMonthKey = `${chartYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    return groups.filter((g) => g.monthKey === targetMonthKey);
  }, [profileBooks, yearFilter, selectedMonth, chartYear]);

  const bookById = useMemo(
    () => new Map(profileBooks.map((b) => [b.id, b])),
    [profileBooks],
  );

  const filteredLogs = useMemo(() => {
    return profileLogs.filter((l) => {
      if (sessionBookFilter !== 'all' && l.bookId !== sessionBookFilter) return false;
      const ym = parseYearMonth(l.date);
      if (yearFilter !== 'all' && (!ym || ym.year !== yearFilter)) return false;
      if (selectedMonth !== null && (!ym || ym.year !== chartYear || ym.month !== selectedMonth)) {
        return false;
      }
      return true;
    });
  }, [profileLogs, sessionBookFilter, yearFilter, selectedMonth, chartYear]);

  const detailBook = useMemo(
    () => profileBooks.find((b) => b.id === detailBookId) || null,
    [profileBooks, detailBookId],
  );

  const yearlyGoal = activeProfile?.yearlyBookGoal || 12;
  const monthlyPageGoal = activeProfile?.monthlyPageGoal || 500;
  const goalPct = Math.min(100, Math.round((summary.booksFinished / yearlyGoal) * 100));
  const ringRadius = 22;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc - (goalPct / 100) * ringCirc;

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const num = Math.max(1, Math.min(500, Number(goalDraft) || yearlyGoal));
    await updateProfile(activeProfile.id, { yearlyBookGoal: num });
    setEditingGoal(false);
  };

  const monthLabelSelected =
    selectedMonth !== null ? monthlyBuckets[selectedMonth]?.label : null;

  return (
    <div className="space-y-7 animate-fade-slide">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
            Reading Timeline &amp; Log
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Monthly pages read, daily heatmap, format &amp; genre analytics, and milestones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={yearFilter}
            onChange={(e) => {
              const val = e.target.value;
              setYearFilter(val === 'all' ? 'all' : Number(val));
              setSelectedMonth(null);
            }}
            aria-label="Filter year"
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-sm font-semibold text-stone-800 dark:text-stone-100 outline-none"
          >
            <option value="all">All Years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenPdfExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-sm font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Export PDF
          </button>

          <button
            type="button"
            disabled={profileBooks.length === 0}
            onClick={() => {
              const activeReading = profileBooks.find((b) => b.status === 'reading');
              setLogBookId(activeReading?.id);
              setLogModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-md shadow-amber-600/20 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Log Reading
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Books Finished + Goal Ring */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Books Finished
            </p>
            <p className="font-serif-display text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1">
              {summary.booksFinished}
              <span className="text-sm font-sans-ui font-medium text-stone-400">
                {' '}
                / {yearlyGoal} goal
              </span>
            </p>

            {editingGoal ? (
              <form onSubmit={(e) => void handleSaveGoal(e)} className="flex items-center gap-1.5 mt-1.5">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="w-16 px-2 py-0.5 rounded-lg bg-stone-50 dark:bg-stone-900 border border-amber-500 text-xs outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setGoalDraft(String(yearlyGoal));
                  setEditingGoal(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline mt-1 cursor-pointer"
              >
                <Pencil className="w-3 h-3" /> Edit goal
              </button>
            )}
          </div>

          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r={ringRadius}
                fill="none"
                strokeWidth="5"
                className="stroke-stone-200 dark:stroke-stone-800"
              />
              <circle
                cx="28"
                cy="28"
                r={ringRadius}
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringOffset}
                className="stroke-amber-500 transition-all duration-500"
              />
            </svg>
            <span className="absolute text-[11px] font-bold text-stone-700 dark:text-stone-200">
              {goalPct}%
            </span>
          </div>
        </div>

        {/* KPI 2: Pages Read */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Pages Read ({yearFilter === 'all' ? 'All Time' : yearFilter})
          </p>
          <p className="font-serif-display text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1">
            {summary.totalPages.toLocaleString()}
          </p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1">
              <span>
                This month: {summary.currentMonthPages.toLocaleString()} pp
                {totalAudioMinutes > 0 ? ` · ${formatMinutesHuman(totalAudioMinutes)} audio` : ''}
              </span>
              <span>Goal {monthlyPageGoal}</span>
            </div>
            <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{
                  width: `${Math.min(100, Math.round((summary.currentMonthPages / monthlyPageGoal) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Reading Cadence & Streak */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Reading Cadence
          </p>
          <p className="font-serif-display text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            {summary.currentDailyStreak}d streak
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
            {summary.activeReadingDays} active reading day(s) logged
          </p>
        </div>

        {/* KPI 4: Avg Rating & Avg Length */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Ratings &amp; Length
          </p>
          <p className="font-serif-display text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 flex items-center gap-1.5">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            {summary.averageRating > 0 ? summary.averageRating.toFixed(1) : '—'}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
            Avg length:{' '}
            {summary.averagePagesPerBook > 0 ? `${summary.averagePagesPerBook} pp` : '—'}
          </p>
        </div>
      </section>

      {/* Monthly Pages / Books Chart */}
      <section className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-xl bg-stone-100 dark:bg-stone-800/80 self-start">
            <button
              type="button"
              onClick={() => setChartMetric('pages')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartMetric === 'pages'
                  ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              Pages / Month
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('books')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartMetric === 'books'
                  ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              Books / Month
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBackfill}
                onChange={(e) => setIncludeBackfill(e.target.checked)}
                className="accent-amber-600 rounded"
              />
              <span>Include finished-book page backfill</span>
            </label>

            {monthLabelSelected && (
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
              >
                {monthLabelSelected} {chartYear} <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <MonthlyChart
          buckets={monthlyBuckets}
          year={chartYear}
          metric={chartMetric}
          monthlyPageGoal={monthlyPageGoal}
          yearlyBookGoal={yearlyGoal}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
        />
      </section>

      {/* P2.2 Daily Reading Calendar Heatmap */}
      <ReadingHeatmap data={heatmapData} yearFilter={yearFilter} />

      {/* P2.3 Genre, Format, Rating & Pace Breakdown Charts */}
      <BreakdownCharts breakdown={breakdownData} />

      {/* Milestones & Reading Badges (P3.3) */}
      <section className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
                Milestones &amp; Reading Badges
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Parents can configure reward notes in Parent / Admin.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/20 self-start sm:self-auto">
            {unlockedCount} / {badges.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 ${
                badge.unlocked
                  ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-emerald-500/10 border-amber-500/35 shadow-xs'
                  : 'bg-stone-50/80 dark:bg-stone-900/50 border-stone-200/80 dark:border-stone-800'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                    badge.unlocked
                      ? 'bg-amber-500/20'
                      : 'bg-stone-200/70 dark:bg-stone-800 opacity-60 grayscale-[35%]'
                  }`}
                >
                  {badge.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <h3 className="font-serif-display font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                      {badge.title}
                    </h3>
                    {badge.unlocked && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 shrink-0">
                        Unlocked
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">
                    {badge.description}
                  </p>
                </div>
              </div>

              {!badge.unlocked && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1 tabular-nums">
                    <span>
                      {badge.current.toLocaleString()} / {badge.target.toLocaleString()}{' '}
                      {badge.unitLabel}
                    </span>
                    <span>{badge.progressPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${badge.progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {badge.rewardNote && (
                <div
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium flex items-start gap-1.5 border ${
                    badge.unlocked
                      ? 'bg-rose-500/10 text-rose-800 dark:text-rose-200 border-rose-500/25'
                      : 'bg-amber-500/8 text-amber-800 dark:text-amber-300 border-amber-500/20'
                  }`}
                >
                  <Gift className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    <strong>Reward:</strong> {badge.rewardNote}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Timeline vs Reading Log Tabs */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-2xl bg-stone-200/60 dark:bg-stone-800/80">
            <button
              type="button"
              onClick={() => setActiveSubTab('timeline')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeSubTab === 'timeline'
                  ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <BookOpenCheck className="w-4 h-4" /> Reading Timeline (
              {timelineGroups.reduce((s, g) => s + g.books.length, 0)})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('sessions')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeSubTab === 'sessions'
                  ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <Calendar className="w-4 h-4" /> Reading Log ({filteredLogs.length})
            </button>
          </div>

          {activeSubTab === 'sessions' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sessionBookFilter}
                onChange={(e) => setSessionBookFilter(e.target.value)}
                aria-label="Filter log by book"
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 outline-none"
              >
                <option value="all">All Books</option>
                {profileBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={profileLogs.length === 0}
                onClick={() =>
                  exportReadingLogsCsv(profileLogs, profileBooks, activeProfile?.name || 'reader')
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-xs font-semibold text-stone-700 dark:text-stone-200 disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Export Log CSV
              </button>
            </div>
          )}
        </div>

        {activeSubTab === 'timeline' ? (
          timelineGroups.length === 0 ? (
            <div className="py-12 text-center rounded-3xl bg-white/70 dark:bg-[#171A23]/70 border border-dashed border-stone-300 dark:border-stone-700 text-sm text-stone-500">
              No finished books found for this filter. Mark a book as Finished (with a finish date)
              to see it on your timeline!
            </div>
          ) : (
            <div className="relative pl-5 sm:pl-7 border-l-2 border-stone-200 dark:border-stone-800 space-y-8">
              {timelineGroups.map((group) => (
                <div key={group.monthKey} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[27px] sm:-left-[35px] top-1 w-3.5 h-3.5 rounded-full bg-amber-500 ring-4 ring-[#FAF8F5] dark:ring-[#0F1117]"
                  />

                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                    <h3 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
                      {group.label}
                    </h3>
                    <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                      {group.books.length} {group.books.length === 1 ? 'book' : 'books'}
                      {group.totalPages > 0
                        ? ` · ${group.totalPages.toLocaleString()} pages`
                        : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {group.books.map((book) => (
                      <div
                        key={book.id}
                        onClick={() => setDetailBookId(book.id)}
                        className="p-3.5 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 hover:border-amber-400 transition-all cursor-pointer flex gap-3.5"
                      >
                        <BookCover
                          title={book.title}
                          author={book.author}
                          coverUrl={book.coverUrl}
                          size="sm"
                          interactive={false}
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-serif-display font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                            {book.title}
                          </h4>
                          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                            {book.author}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {book.rating > 0 && <StarRating value={book.rating} size="sm" />}
                            {book.pageCount > 0 && (
                              <span className="text-[11px] text-stone-400">
                                {book.pageCount} pp
                              </span>
                            )}
                          </div>
                          {(book.dateStarted || book.dateFinished) && (
                            <p className="text-[11px] text-stone-400 mt-1">
                              {book.dateStarted ? `${book.dateStarted} → ` : 'Finished '}
                              {book.dateFinished || ''}
                            </p>
                          )}
                          {(book.review || book.notes) && (
                            <p className="text-xs italic text-stone-600 dark:text-stone-300 line-clamp-1 mt-1">
                              &ldquo;{book.review || book.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center rounded-3xl bg-white/70 dark:bg-[#171A23]/70 border border-dashed border-stone-300 dark:border-stone-700 text-sm text-stone-500">
            No reading sessions logged in this view yet. Click &ldquo;Log Reading&rdquo; above to
            record pages read.
          </div>
        ) : (
          <div className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800/80 overflow-hidden">
            {filteredLogs.map((log) => {
              const book = bookById.get(log.bookId);
              const badge = formatReadingLogBadge(log);
              return (
                <div
                  key={log.id}
                  className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-stone-50/70 dark:hover:bg-stone-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {book && (
                      <BookCover
                        title={book.title}
                        author={book.author}
                        coverUrl={book.coverUrl}
                        size="xs"
                        interactive={false}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => book && setDetailBookId(book.id)}
                          className="font-serif-display font-bold text-sm text-stone-900 dark:text-stone-100 hover:text-amber-700 dark:hover:text-amber-400 truncate cursor-pointer text-left"
                        >
                          {book?.title || 'Deleted Book'}
                        </button>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          {badge.deltaLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                        <span>{log.date}</span>
                        {badge.reachedLabel && <span>· {badge.reachedLabel}</span>}
                        {log.note && <span className="italic truncate">· &ldquo;{log.note}&rdquo;</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label="Delete log entry"
                    onClick={() => deleteReadingLog(log.id)}
                    className="p-2 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <LogSessionModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        initialBookId={logBookId}
      />

      <BookDetailDrawer
        book={detailBook}
        onClose={() => setDetailBookId(null)}
        onEdit={(b) => setEditBook(b)}
        onLogPages={(b) => {
          setLogBookId(b.id);
          setLogModalOpen(true);
        }}
      />

      <BookFormModal
        open={editBook !== null}
        onClose={() => setEditBook(null)}
        editBook={editBook}
      />
    </div>
  );
};
