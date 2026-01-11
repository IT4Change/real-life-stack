
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const ProfileControls = ({ config, onChange }) => {
  const itemTypes = [
    { value: 'person', label: 'Person' },
    { value: 'event', label: 'Veranstaltung' },
    { value: 'offer', label: 'Angebot' },
    { value: 'quest', label: 'Quest' },
    { value: 'project', label: 'Projekt' }
  ];

  const navigationTypes = [
    { value: 'tabs', label: 'Tabs' },
    { value: 'dots', label: 'Dots' },
    { value: 'none', label: 'Keine' }
  ];

  const componentOptions = [
    { key: 'text', label: 'Text (Markdown)' },
    { key: 'mediaGallery', label: 'Media Gallery' },
    { key: 'eventFunctions', label: 'Event Functions' },
    { key: 'comments', label: 'Comments / Reactions' },
    { key: 'crowdfunding', label: 'Crowdfunding' },
    { key: 'members', label: 'Members / Visitors' },
    { key: 'comingEvents', label: 'Coming Events' },
    { key: 'projects', label: 'Projects' },
    { key: 'quests', label: 'Quests / Tasks' },
    { key: 'badges', label: 'Badges' },
    { key: 'contactInfo', label: 'Contact Information' },
    { key: 'shareButtons', label: 'Share Buttons' }
  ];

  const updateConfig = (updates) => {
    onChange({ ...config, ...updates });
  };

  const updateComponents = (key, checked) => {
    onChange({
      ...config,
      components: {
        ...config.components,
        [key]: checked
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="fixed left-4 top-4 bottom-4 w-80 bg-purple-900/95 backdrop-blur-lg rounded-lg shadow-2xl z-50 overflow-hidden border border-white/20"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/20 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
          <h2 className="text-lg font-semibold">Profil Konfiguration</h2>
          <p className="text-sm opacity-90">Teste verschiedene Layouts und Komponenten</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Item Type */}
          <div>
            <Label className="text-sm font-medium text-white mb-3 block">Item-Typ</Label>
            <div className="space-y-2">
              {itemTypes.map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="itemType"
                    value={type.value}
                    checked={config.itemType === type.value}
                    onChange={(e) => updateConfig({ itemType: e.target.value })}
                    className="text-purple-400"
                  />
                  <span className="text-sm text-white/90">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Navigation Type */}
          <div>
            <Label className="text-sm font-medium text-white mb-3 block">Navigation</Label>
            <div className="space-y-2">
              {navigationTypes.map((nav) => (
                <label key={nav.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="navigation"
                    value={nav.value}
                    checked={config.navigation === nav.value}
                    onChange={(e) => updateConfig({ navigation: e.target.value })}
                    className="text-purple-400"
                  />
                  <span className="text-sm text-white/90">{nav.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Components */}
          <div>
            <Label className="text-sm font-medium text-white mb-3 block">Subkomponenten</Label>
            <div className="space-y-3">
              {componentOptions.map((option) => (
                <div key={option.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={option.key}
                    checked={config.components[option.key]}
                    onCheckedChange={(checked) => updateComponents(option.key, checked)}
                  />
                  <Label
                    htmlFor={option.key}
                    className="text-sm cursor-pointer text-white/90"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="pt-4 border-t border-white/20">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateConfig({
                  components: Object.keys(config.components).reduce((acc, key) => ({
                    ...acc,
                    [key]: true
                  }), {})
                })}
                className="flex-1"
              >
                Alle an
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateConfig({
                  components: Object.keys(config.components).reduce((acc, key) => ({
                    ...acc,
                    [key]: false
                  }), {})
                })}
                className="flex-1"
              >
                Alle aus
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProfileControls;
