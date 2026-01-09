import React, { useRef, useCallback } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { Button } from '@/components/ui/button';
import { Paperclip, X } from 'lucide-react';

const DraggableMediaItem = ({ file, index, moveItem, onRemove }) => {
  const ref = useRef(null);

  const [, drop] = useDrop({
    accept: 'media',
    hover(item) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      moveItem(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: 'media',
    item: { id: file.id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className="relative group aspect-square cursor-move"
    >
      <img src={file.url} alt={file.name} className="w-full h-full object-cover rounded-md" />
      <button
        onClick={() => onRemove(file.id)}
        className="absolute top-1 right-1 bg-black/60 rounded-full p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

const MediaWidget = ({ value = [], onChange, label }) => {
  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    onChange([...value, ...newFiles]);
  };

  const handleRemove = (fileId) => {
    onChange(value.filter(f => f.id !== fileId));
  };

  const moveItem = useCallback((dragIndex, hoverIndex) => {
    const dragItem = value[dragIndex];
    const newItems = [...value];
    newItems.splice(dragIndex, 1);
    newItems.splice(hoverIndex, 0, dragItem);
    onChange(newItems);
  }, [value, onChange]);

  const [, drop] = useDrop(() => ({ accept: 'media' }));

  return (
    <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700 space-y-4 relative">
      <p className="font-medium text-slate-200">{label}</p>
      <div
        ref={drop}
        className="p-4 border-2 border-dashed border-slate-600 rounded-lg text-center"
      >
        <input
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <Button type="button" variant="ghost" asChild>
            <div>
              <Paperclip className="w-5 h-5 mx-auto mb-2 text-slate-400" />
              <p className="text-sm text-slate-300">
                Dateien per Drag & Drop hierher ziehen oder <span className="text-purple-400 font-semibold">hochladen</span>
              </p>
            </div>
          </Button>
        </label>
      </div>
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {value.map((file, index) => (
            <DraggableMediaItem
              key={file.id}
              index={index}
              file={file}
              moveItem={moveItem}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaWidget;