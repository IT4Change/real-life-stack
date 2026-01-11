import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

const ConfirmEventDialog = ({ isOpen, onClose, onConfirm, selectedDate }) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-slate-700 text-white max-w-md">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Icon */}
              <div className="flex justify-center">
                <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-purple-400" />
                </div>
              </div>

              {/* Title */}
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold text-white">
                  Neues Event erstellen?
                </h2>
                {selectedDate && (
                  <p className="text-sm text-white/70">
                    {format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: de })}
                  </p>
                )}
              </div>

              {/* Description */}
              <p className="text-center text-sm text-white/60">
                Möchtest du für diesen Tag ein neues Event erstellen?
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 bg-slate-800/60 border-white/20 text-white hover:bg-slate-700/80 hover:text-white"
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleConfirm}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600"
                >
                  Event erstellen
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmEventDialog;
