import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, Grid3x3, Columns, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const CalendarHeader = ({
  currentDate,
  viewMode,
  onViewModeChange,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onToggleFilters,
  filtersOpen,
  activeFilterCount = 0
}) => {
  const viewModes = [
    { id: 'month', icon: Grid3x3, label: 'Monat' },
    { id: 'week', icon: Columns, label: 'Woche' },
    { id: 'day', icon: CalendarIcon, label: 'Tag' },
    { id: 'list', icon: List, label: 'Liste' }
  ];

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4 bg-slate-900/50 backdrop-blur-lg border-b border-white/20">
      {/* Left: Date Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreviousMonth}
          className="text-white hover:bg-white/20 h-9 w-9"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <h2 className="text-white font-semibold text-lg min-w-[180px] text-center">
            {format(currentDate, 'MMMM yyyy', { locale: de })}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToday}
            className="text-white hover:bg-white/20 hidden sm:flex"
          >
            Heute
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onNextMonth}
          className="text-white hover:bg-white/20 h-9 w-9"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Right: View Mode & Filters */}
      <div className="flex items-center gap-2">
        {/* View Mode Selector */}
        <div className="flex bg-slate-800/60 rounded-lg p-1">
          {viewModes.map(mode => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => onViewModeChange(mode.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  viewMode === mode.id
                    ? 'bg-purple-500 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title={mode.label}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm hidden sm:inline">{mode.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFilters}
          className={`relative h-9 w-9 rounded-full ${
            filtersOpen
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'text-white hover:bg-white/20'
          }`}
        >
          <Filter className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
};

export default CalendarHeader;
