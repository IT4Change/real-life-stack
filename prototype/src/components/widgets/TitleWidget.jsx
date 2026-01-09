import React from 'react';

const TitleWidget = ({ value = '', onChange, label }) => {
  return (
    <div className="w-full relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="w-full text-xl font-semibold bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder-slate-400 text-white"
      />
    </div>
  );
};

export default TitleWidget;