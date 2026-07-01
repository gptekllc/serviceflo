import { useCallback, useEffect, useRef, useState } from "react";

type PptxViewerInstance = {
  destroy(): void;
  renderSlide(index?: number): Promise<void>;
  slideCount: number;
  currentSlideIndex: number;
};

export function PptxDeckViewer({
  url,
  title,
  controls = true,
  keyboard = true,
  slideIndex: controlledSlideIndex,
  onSlideCountChange,
}: {
  url: string;
  title: string;
  controls?: boolean;
  keyboard?: boolean;
  slideIndex?: number;
  onSlideCountChange?: (slideCount: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PptxViewerInstance | null>(null);
  const onSlideCountChangeRef = useRef(onSlideCountChange);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  useEffect(() => {
    onSlideCountChangeRef.current = onSlideCountChange;
  }, [onSlideCountChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) return;

    const abort = new AbortController();
    let active = true;

    setStatus("loading");
    setError(null);
    setSlideIndex(0);
    setSlideCount(0);
    host.replaceChildren();

    void (async () => {
      try {
        const [{ PptxViewer, RECOMMENDED_ZIP_LIMITS }, response] = await Promise.all([
          import("@aiden0z/pptx-renderer"),
          fetch(url, { signal: abort.signal }),
        ]);
        if (!response.ok) throw new Error(`Could not load PowerPoint (${response.status})`);

        const viewer = await PptxViewer.open(await response.arrayBuffer(), host, {
          renderMode: "slide",
          fitMode: "contain",
          lazyMedia: true,
          lazySlides: true,
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          pdfjs: false,
          onSlideChange: (index) => {
            if (active) setSlideIndex(index);
          },
        });

        if (!active) {
          viewer.destroy();
          return;
        }

        viewerRef.current = viewer;
        setSlideCount(viewer.slideCount);
        onSlideCountChangeRef.current?.(viewer.slideCount);
        setSlideIndex(viewer.currentSlideIndex);
        setStatus("ready");
      } catch (err) {
        if (!active || abort.signal.aborted) return;
        setStatus("error");
        setError((err as Error).message);
      }
    })();

    return () => {
      active = false;
      abort.abort();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      host.replaceChildren();
    };
  }, [url]);

  const goTo = useCallback(
    async (index: number) => {
      const viewer = viewerRef.current;
      if (!viewer || slideCount <= 0) return;
      const next = Math.min(slideCount - 1, Math.max(0, index));
      await viewer.renderSlide(next);
      setSlideIndex(next);
    },
    [slideCount],
  );

  useEffect(() => {
    if (controlledSlideIndex === undefined || status !== "ready") return;
    void goTo(controlledSlideIndex);
  }, [controlledSlideIndex, goTo, status]);

  useEffect(() => {
    if (!keyboard) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        void goTo(slideIndex + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        void goTo(slideIndex - 1);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goTo, keyboard, slideIndex]);

  const canGoBack = status === "ready" && slideIndex > 0;
  const canGoForward = status === "ready" && slideCount > 0 && slideIndex < slideCount - 1;

  return (
    <div className="group/pptx relative h-full min-h-0 w-full overflow-hidden bg-black">
      <div ref={hostRef} className="h-full min-h-0 w-full overflow-hidden" aria-label={title} />

      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-black text-center text-white/70">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
              PowerPoint
            </div>
            <div className="mt-3 text-lg font-semibold">
              {status === "loading" ? "Loading presentation..." : "Presentation unavailable"}
            </div>
            {error && <div className="mt-2 max-w-xl text-sm text-white/50">{error}</div>}
          </div>
        </div>
      )}

      {controls && status === "ready" && slideCount > 1 && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 border border-white/15 bg-black/70 px-2 py-1.5 text-xs font-semibold text-white/85 opacity-0 transition-opacity group-hover/pptx:opacity-100 group-focus-within/pptx:opacity-100">
          <button
            type="button"
            onClick={() => void goTo(slideIndex - 1)}
            disabled={!canGoBack}
            className="border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-35"
          >
            Prev
          </button>
          <div className="min-w-14 text-center tabular-nums">
            {slideIndex + 1}/{slideCount}
          </div>
          <button
            type="button"
            onClick={() => void goTo(slideIndex + 1)}
            disabled={!canGoForward}
            className="border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-35"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
