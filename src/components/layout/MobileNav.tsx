import React from 'react';
import type { AppTab } from '../../types/library';
import { TABS } from './Header';

interface MobileNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 backdrop-blur-lg bg-white/95 dark:bg-[#13161F]/95 border-t border-stone-200 dark:border-stone-800 px-2 py-1.5 flex items-center justify-around"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
              isActive
                ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{tab.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
};
