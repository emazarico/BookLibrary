import React, { useEffect, useState } from 'react';
import { useResolvedCover } from '../../services/coverStore';
import { getBookCoverStyle } from '../../utils/cover';

interface BookCoverProps {
  title: string;
  author: string;
  coverUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  interactive?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BookCoverProps['size']>, string> = {
  xs: 'w-9 h-13',
  sm: 'w-14 h-20',
  md: 'w-24 h-36',
  lg: 'w-28 h-42',
  xl: 'w-36 h-54 sm:w-44 sm:h-64',
};

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  author,
  coverUrl,
  size = 'md',
  interactive = true,
  className = '',
}) => {
  const cleanUrl = useResolvedCover(coverUrl);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
  }, [cleanUrl]);

  const cloth = getBookCoverStyle(title, author);
  const showImage = Boolean(cleanUrl) && !imgFailed;
  const showPageEdge = size === 'md' || size === 'lg' || size === 'xl';

  return (
    <div className={`book-cover-stage inline-block shrink-0 ${SIZE_CLASSES[size]} ${className}`}>
      <div
        className={`relative w-full h-full rounded-r-md rounded-l-[3px] ${
          interactive ? 'book-cover-3d' : 'shadow-md'
        }`}
      >
        {/* Subtle realistic page-block edge on the right */}
        {showPageEdge && (
          <div
            aria-hidden="true"
            className="book-page-edge absolute top-[3px] bottom-[3px] -right-[4px] w-[4px] rounded-r-[2px] opacity-90 pointer-events-none"
          />
        )}

        <div className="relative w-full h-full rounded-r-md rounded-l-[3px] overflow-hidden bg-stone-200 dark:bg-stone-800">
          {/* Bespoke Clothbound Cover Layer (visible immediately while loading and on error/missing cover) */}
          <div
            className={`relative z-0 w-full h-full flex flex-col justify-between p-2.5 select-none overflow-hidden transition-opacity duration-200 ${
              showImage && imgLoaded ? 'opacity-0' : 'opacity-100'
            }`}
            style={{
              background: `linear-gradient(155deg, ${cloth.bgFrom} 0%, ${cloth.bgTo} 100%)`,
              color: cloth.ink,
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 140"
              className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
            >
              {cloth.motif === 'arch' && (
                <path
                  d="M18 126 V52 A32 32 0 0 1 82 52 V126 Z"
                  fill="none"
                  stroke={cloth.accent}
                  strokeWidth="2.5"
                />
              )}
              {cloth.motif === 'circle' && (
                <>
                  <circle cx="50" cy="70" r="32" fill="none" stroke={cloth.accent} strokeWidth="2" />
                  <circle cx="50" cy="70" r="20" fill="none" stroke={cloth.accent} strokeWidth="1" />
                </>
              )}
              {cloth.motif === 'lines' && (
                <>
                  <line x1="14" y1="18" x2="86" y2="18" stroke={cloth.accent} strokeWidth="2" />
                  <line x1="14" y1="122" x2="86" y2="122" stroke={cloth.accent} strokeWidth="2" />
                </>
              )}
              {cloth.motif === 'diamond' && (
                <polygon
                  points="50,24 82,70 50,116 18,70"
                  fill="none"
                  stroke={cloth.accent}
                  strokeWidth="2"
                />
              )}
            </svg>

            <div className="relative flex items-center gap-1">
              <span
                className="inline-block w-3 h-[2px] rounded-full"
                style={{ backgroundColor: cloth.accent }}
              />
            </div>

            <div className="relative my-auto">
              <p
                className={`font-serif-display font-semibold leading-tight line-clamp-3 ${
                  size === 'xs'
                    ? 'text-[7px]'
                    : size === 'sm'
                      ? 'text-[9px]'
                      : size === 'md'
                        ? 'text-xs'
                        : 'text-sm'
                }`}
              >
                {title}
              </p>
            </div>

            {size !== 'xs' && (
              <div className="relative pt-1 border-t border-white/15">
                <p
                  className={`uppercase tracking-wider truncate opacity-85 ${
                    size === 'sm' ? 'text-[7px]' : 'text-[9px]'
                  }`}
                >
                  {author}
                </p>
              </div>
            )}
          </div>

          {/* Jacket Image Overlay (sits above clothbound layer and fades in when loaded) */}
          {showImage && (
            <img
              src={cleanUrl}
              alt={`${title} cover`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgFailed(true)}
              className={`absolute inset-0 z-20 w-full h-full object-cover select-none transition-opacity duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* Realistic spine crease sheen */}
          <div aria-hidden="true" className="book-spine-sheen absolute inset-0 z-30 pointer-events-none" />
        </div>
      </div>
    </div>
  );
};
