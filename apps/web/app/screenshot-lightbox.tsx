'use client';

import { useEffect, useId, useState } from 'react';

type ScreenshotLightboxProps = {
  src: string;
  alt: string;
  title: string;
  caption: string;
  imageClassName?: string;
  frameClassName?: string;
};

export function ScreenshotLightbox({ src, alt, title, caption, imageClassName = 'w-full', frameClassName = '' }: ScreenshotLightboxProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const captionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block w-full overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${frameClassName}`}
        aria-label={`Enlarge screenshot: ${title}`}
      >
        <img src={src} alt={alt} className={imageClassName} />
        <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white opacity-95 shadow-lg backdrop-blur transition group-hover:border-accent group-hover:text-accent group-focus-visible:border-accent group-focus-visible:text-accent">
          Enlarge
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={captionId}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-4 border-b border-line p-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-white">{title}</h2>
                <p id={captionId} className="mt-1 text-sm text-slate-300">{caption}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-slate-200 hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                autoFocus
              >
                Close
              </button>
            </div>
            <div className="overflow-auto bg-ink p-3 sm:p-5">
              <img src={src} alt={alt} className="mx-auto h-auto max-h-[78vh] w-auto max-w-full rounded-lg" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
