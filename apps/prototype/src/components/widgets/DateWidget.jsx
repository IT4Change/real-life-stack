import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DateWidget = ({ value = { start: '', end: '', showEnd: false, rrule: 'none' }, onChange, label }) => {
  const handleChange = (field, fieldValue) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700 space-y-4 relative">
      <p className="font-medium text-slate-200">{label}</p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <Label htmlFor="start-date" className="text-xs text-slate-400">Start</Label>
          <input
            id="start-date"
            type="datetime-local"
            value={value.start || ''}
            onChange={(e) => handleChange('start', e.target.value)}
            className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm focus:ring-purple-500 focus:border-purple-500 text-white"
          />
        </div>
        {value.showEnd && (
          <div className="flex-1 min-w-0">
            <Label htmlFor="end-date" className="text-xs text-slate-400">Ende</Label>
            <input
              id="end-date"
              type="datetime-local"
              value={value.end || ''}
              onChange={(e) => handleChange('end', e.target.value)}
              className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm focus:ring-purple-500 focus:border-purple-500 text-white"
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Checkbox id="show-end-date" checked={value.showEnd} onCheckedChange={(checked) => handleChange('showEnd', checked)} />
          <Label htmlFor="show-end-date" className="text-sm font-medium text-slate-300 cursor-pointer">Enddatum</Label>
        </div>
        <div>
          <Select onValueChange={(val) => handleChange('rrule', val)} value={value.rrule || 'none'}>
            <SelectTrigger className="w-[150px] bg-slate-700 border-slate-600 text-slate-300">
              <SelectValue placeholder="Wiederholung" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine</SelectItem>
              <SelectItem value="FREQ=DAILY">Täglich</SelectItem>
              <SelectItem value="FREQ=WEEKLY">Wöchentlich</SelectItem>
              <SelectItem value="FREQ=MONTHLY">Monatlich</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default DateWidget;