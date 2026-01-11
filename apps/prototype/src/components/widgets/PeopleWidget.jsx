import React, { useState, useMemo } from 'react';

const SAMPLE_USERS = ["Anna", "Ben", "Carla", "David", "Elena", "Frank", "Gabi", "Hans"];

const PeopleWidget = ({ value = [], onChange, label }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const valueSet = useMemo(() => new Set(value), [value]);

  const filteredSuggestions = useMemo(() => 
    SAMPLE_USERS.filter(s => 
      s.toLowerCase().includes(inputValue.toLowerCase()) && !valueSet.has(s)
    ), [inputValue, valueSet]);

  const handleSelect = (suggestion) => {
    onChange([...value, suggestion]);
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleRemove = (item) => {
    onChange(value.filter(v => v !== item));
  };

  return (
    <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700 relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={label}
          className="w-full bg-transparent border-none focus:ring-0 placeholder-slate-400 text-white"
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
            {filteredSuggestions.map(suggestion => (
              <div
                key={suggestion}
                onMouseDown={() => handleSelect(suggestion)}
                className="px-3 py-2 cursor-pointer hover:bg-slate-700 text-slate-200"
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700">
          {value.map(item => (
            <div key={item} className="flex items-center gap-1 bg-purple-500/20 text-purple-300 text-xs font-medium px-2 py-1 rounded-full">
              <span>{item}</span>
              <button onClick={() => handleRemove(item)} className="text-purple-300 hover:text-white">
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PeopleWidget;