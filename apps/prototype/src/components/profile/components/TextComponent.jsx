
import React from 'react';

const TextComponent = ({ text }) => {
  if (!text) return null;

  // Simple Markdown parser for basic formatting
  const parseMarkdown = (text) => {
    return text
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4 text-white">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mb-3 text-white/90">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-medium mb-2 text-white/80">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-4">')
      .replace(/\n/g, '<br>');
  };

  const processedText = parseMarkdown(text);
  const wrappedText = `<p class="mb-4">${processedText}</p>`;

  return (
    <div className="prose prose-sm max-w-none">
      <div
        className="text-white/80 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: wrappedText }}
      />
    </div>
  );
};

export default TextComponent;
