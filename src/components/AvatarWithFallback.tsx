import React, { useState } from 'react';

interface AvatarWithFallbackProps {
  src: string;
  alt: string;
  fallbackLabel: string;
  className?: string;
}

export const AvatarWithFallback: React.FC<AvatarWithFallbackProps> = ({
  src,
  alt,
  fallbackLabel,
  className = 'w-14 h-14 rounded-lg',
}) => {
  const [imgError, setImgError] = useState(false);

  if (imgError || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-[#2A241E] border border-white/10 text-[#E5DEC9] font-display font-bold select-none shrink-0 ${className}`}
        aria-label={alt}
      >
        <span>{fallbackLabel.slice(0, 2)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={`object-cover shrink-0 border border-white/10 ${className}`}
    />
  );
};
