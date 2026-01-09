import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

const Lightbox = ({ isOpen, onClose, images = [], initialIndex = 0 }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(1);
    setImageLoaded(false);
    setPosition({ x: 0, y: 0 });
  }, [initialIndex, isOpen]);

  // Preload next and previous images
  useEffect(() => {
    if (!isOpen || images.length <= 1) return;

    const preloadImage = (index) => {
      if (index >= 0 && index < images.length) {
        const img = new Image();
        img.src = images[index].src;
      }
    };

    // Preload next image
    preloadImage((currentIndex + 1) % images.length);
    // Preload previous image
    preloadImage((currentIndex - 1 + images.length) % images.length);
  }, [currentIndex, images, isOpen]);

  useEffect(() => {
    if (!isOpen || images.length === 0) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images.length]);

  const handlePrevious = () => {
    setImageLoaded(false);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNext = () => {
    setImageLoaded(false);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  };

  const handleMouseDown = (e) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-full w-screen h-screen p-0 m-0 bg-black/95 backdrop-blur-md border-none rounded-none !z-[9999]"
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>
            {currentImage.alt || 'Bild Lightbox'} - {currentIndex + 1} von {images.length}
          </DialogTitle>
          <DialogDescription>
            {currentImage.description || 'Vollbild-Ansicht der Bildergalerie'}
          </DialogDescription>
        </VisuallyHidden>
        <div className="relative w-full h-full flex flex-col">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/50 to-transparent p-6">
            <div className="flex items-center justify-between">
              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
                  className="text-white hover:text-white hover:bg-white/20 rounded-full disabled:opacity-30"
                >
                  <ZoomOut className="h-5 w-5" />
                </Button>
                <span className="text-white text-sm min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="text-white hover:text-white hover:bg-white/20 rounded-full disabled:opacity-30"
                >
                  <ZoomIn className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-white">
                  <span className="text-lg font-semibold">
                    {currentIndex + 1} / {images.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-white hover:text-white hover:bg-white/20 rounded-full"
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>
            </div>
          </div>

          {/* Main Image Area */}
          <div
            className="flex-1 flex items-center justify-center p-6 overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          >
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              <img
                key={currentIndex}
                src={currentImage.src}
                alt={currentImage.alt || currentImage.description || 'Image'}
                className="max-w-full max-h-[calc(100vh-12rem)] object-contain select-none"
                style={{
                  transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                  opacity: imageLoaded ? 1 : 0.5,
                  transition: isDragging ? 'none' : 'transform 0.2s'
                }}
                onLoad={() => setImageLoaded(true)}
                draggable={false}
              />
            </div>
          </div>

          {/* Navigation Buttons */}
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-40 text-white hover:text-white hover:bg-white/20 rounded-full w-12 h-12"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-40 text-white hover:text-white hover:bg-white/20 rounded-full w-12 h-12"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Bottom Bar with Description */}
          {currentImage.description && (
            <div className="absolute bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-6">
              <div className="max-w-3xl mx-auto">
                <p className="text-white text-base leading-relaxed text-center">
                  {currentImage.description}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Lightbox;
