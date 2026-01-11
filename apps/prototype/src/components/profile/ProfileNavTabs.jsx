import React, { useState, useEffect } from 'react';
import { Link as ScrollLink, Events } from 'react-scroll';
import { motion } from 'framer-motion';

const ProfileNavTabs = ({ components, scrollContainerRef }) => {
  const [activeTab, setActiveTab] = useState(components[0]?.key || '');

  useEffect(() => {
    const handleSetActive = (to) => {
      setActiveTab(to);
    };

    Events.scrollEvent.register('begin', () => {});
    Events.scrollEvent.register('end', () => {});

    return () => {
      Events.scrollEvent.remove('begin');
      Events.scrollEvent.remove('end');
    };
  }, []);

  return (
    <div className="border-b border-white/20 px-6 overflow-x-auto overflow-y-hidden">
      <nav className="-mb-px flex space-x-6" aria-label="Tabs">
        {components.map((component) => (
          <ScrollLink
            key={component.key}
            to={component.key}
            spy={true}
            smooth={true}
            duration={500}
            offset={-20}
            containerId="profile-scroll-container"
            onSetActive={() => setActiveTab(component.key)}
            className="relative whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm cursor-pointer transition-colors"
            activeClass="border-purple-400 text-white"
            style={{
              borderColor: activeTab === component.key ? '' : 'transparent',
              color: activeTab === component.key ? '' : 'rgba(255, 255, 255, 0.6)'
            }}
          >
            {component.name}
          </ScrollLink>
        ))}
      </nav>
    </div>
  );
};

export default ProfileNavTabs;