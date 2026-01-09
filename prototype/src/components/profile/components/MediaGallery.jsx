import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';
import Lightbox from './Lightbox';

const MediaGallery = ({ images = [] }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const mockImages = [
    {
      src: 'https://images.unsplash.com/photo-1570100105319-45d425019752',
      alt: 'Berglandschaft mit Nebel',
      description: 'Eine atemberaubende Berglandschaft im Nebel - fotografiert in den Schweizer Alpen bei Sonnenaufgang.'
    },
    {
      src: 'https://images.unsplash.com/photo-1656006545597-4b8e5adf15de',
      alt: 'Waldweg mit Sonnenstrahlen',
      description: 'Sonnenstrahlen brechen durch das dichte Blätterdach und schaffen eine magische Atmosphäre.'
    },
    {
      src: 'https://images.unsplash.com/photo-1618158702512-cf73d9618127',
      alt: 'Schwarz-Weiß Berglandschaft',
      description: 'Zeitlose Schönheit der Berge - eingefangen in klassischem Schwarz-Weiß.'
    },
    {
      src: 'https://images.unsplash.com/photo-1599646274160-c4654977a23a',
      alt: 'Nahaufnahme von Baumrinde',
      description: 'Die raue Textur alter Baumrinde erzählt Geschichten von Jahrzehnten im Wald.'
    },
    {
      src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
      alt: 'Bergsee bei Sonnenuntergang',
      description: 'Ein kristallklarer Bergsee spiegelt die letzten Sonnenstrahlen des Tages wider.'
    },
    {
      src: 'https://images.unsplash.com/photo-1519904981063-b0cf448d479e',
      alt: 'Herbstwald von oben',
      description: 'Luftaufnahme eines herbstlichen Waldes mit leuchtenden Farben von Gold bis Rot.'
    },
    {
      src: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e',
      alt: 'Waldpfad im Nebel',
      description: 'Ein mystischer Waldpfad verschwindet im morgendlichen Nebel.'
    },
    {
      src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e',
      alt: 'Sternenhimmel über Bergen',
      description: 'Die Milchstraße erstreckt sich majestätisch über den Berggipfeln in einer klaren Nacht.'
    }
  ];

  const displayImages = images.length > 0
    ? images.map((img, idx) => typeof img === 'string' ? { src: img, alt: `Galeriebild ${idx + 1}` } : img)
    : mockImages;

  const openLightbox = (index) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Media Gallery</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {displayImages.map((image, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
            onClick={() => openLightbox(index)}
          >
            <img
              alt={image.alt || `Bild ${index + 1}`}
              className="w-full h-full object-cover transition-transform group-hover:scale-110"
              src={image.src}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
          </motion.div>
        ))}
      </div>

      <Lightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        images={displayImages}
        initialIndex={currentIndex}
      />
    </div>
  );
};

export default MediaGallery;