
import React, { useState, useEffect } from 'react';
import { Link as ScrollLink, Events } from 'react-scroll';
import { motion } from 'framer-motion';

const ProfileNavDots = ({ components, scrollContainerRef }) => {
  const [activeDot, setActiveDot] = useState(components[0]?.key || '');

  useEffect(() => {
    Events.scrollEvent.register('begin', () => {});
    Events.scrollEvent.register('end', () => {});

    return () => {
      Events.scrollEvent.remove('begin');
      Events.scrollEvent.remove('end');
    };
  }, []);

  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
      <div className="flex flex-col items-center gap-2 p-1 bg-slate-800/70 backdrop-blur-sm rounded-full">
        {components.map((component) => (
          <ScrollLink
            key={component.key}
            to={component.key}
            spy={true}
            smooth={true}
            duration={500}
            offset={-20}
            containerId="profile-scroll-container"
            onSetActive={() => setActiveDot(component.key)}
            className="w-2 h-2 rounded-full bg-gray-400 cursor-pointer transition-all hover:bg-purple-500 relative group"
            activeClass="bg-pink-500 scale-150"
          >
            <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {component.name}
            </span>
          </ScrollLink>
        ))}
      </div>
    </div>
  );
};

export default ProfileNavDots;
