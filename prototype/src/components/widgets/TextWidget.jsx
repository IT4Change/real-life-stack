import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  Bold, Italic, Heading1, Heading2, Heading3, List, Quote, 
  Image as ImageIcon, MapPin, Calendar, Users, Tag 
} from 'lucide-react';

const WIDGET_CONFIG = {
  'media': { icon: ImageIcon, label: 'Medien' },
  'location': { icon: MapPin, label: 'Ort' },
  'date': { icon: Calendar, label: 'Datum' },
  'people': { icon: Users, label: 'Personen' },
  'tags': { icon: Tag, label: 'Tags' },
};

const TextWidget = ({ value = '', onChange, onMention, availableWidgets, onToggleWidget, isTextWidget, autoFocus = false }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      // Small delay to ensure the animation has started
      setTimeout(() => {
        textareaRef.current.focus();
      }, 100);
    }
  }, [autoFocus]);
  
  const handleTextChange = (e) => {
    const text = e.target.value;
    onChange(text);

    if (e.nativeEvent.data === ' ') {
      const words = text.slice(0, e.target.selectionStart).trim().split(/\s+/);
      const lastWord = words[words.length - 1];

      if (lastWord && lastWord.startsWith('@') && lastWord.length > 1) {
        onMention([lastWord.substring(1)], '@');
      } else if (lastWord && lastWord.startsWith('#') && lastWord.length > 1) {
        onMention([lastWord.substring(1)], '#');
      }
    }
  };

  const applyFormat = (format) => {
    let formattedText;
    switch(format) {
        case 'h1': formattedText = `# ${value}`; break;
        case 'h2': formattedText = `## ${value}`; break;
        case 'h3': formattedText = `### ${value}`; break;
        case 'bold': formattedText = `**${value}**`; break;
        case 'italic': formattedText = `*${value}*`; break;
        case 'list': formattedText = `- ${value}`; break;
        case 'quote': formattedText = `> ${value}`; break;
        default: formattedText = value;
    }
    onChange(formattedText);
  };

  return (
    <div className="bg-slate-800/60 rounded-lg border border-slate-700">
      <div className="p-2 border-b border-slate-700 flex items-center space-x-1">
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('h1')}><Heading1 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('h2')}><Heading2 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('h3')}><Heading3 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('bold')}><Bold className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('italic')}><Italic className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('list')}><List className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => applyFormat('quote')}><Quote className="w-4 h-4" /></Button>
      </div>
      <motion.textarea
        ref={textareaRef}
        layoutId="text-input-hero"
        value={value}
        onChange={handleTextChange}
        placeholder="Was möchtest du teilen?"
        className="w-full p-4 bg-transparent border-none focus:outline-none focus:ring-0 placeholder-slate-400 text-white resize-none min-h-[120px]"
        rows={5}
        transition={{
          layout: {
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1]
          }
        }}
      />
      {isTextWidget && availableWidgets.length > 0 && (
        <div className="p-2 border-t border-slate-700 flex items-center space-x-2">
          {availableWidgets.map(widgetType => {
            const config = WIDGET_CONFIG[widgetType];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <Button key={widgetType} variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-700/50" onClick={() => onToggleWidget(widgetType)} title={config.label}>
                <Icon className="w-5 h-5" />
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TextWidget;