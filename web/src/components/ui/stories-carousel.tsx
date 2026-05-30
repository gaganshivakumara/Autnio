import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface StoryData {
  id: string;
  image: string;
  label: string;
  title: string;
  body: string;
  avatar?: string;
  avatarFallback?: string;
}

// ── Stories ──────────────────────────────────────────────────────────────────

interface StoriesProps {
  stories: StoryData[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  className?: string;
}

export function Stories({ stories, autoPlay = false, autoPlayInterval = 3000, className }: StoriesProps) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  React.useEffect(() => {
    if (!autoPlay || !api) return;
    timerRef.current = setTimeout(() => {
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, autoPlayInterval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [api, current, autoPlay, autoPlayInterval]);

  return (
    <div className={cn("w-full", className)}>
      <Carousel setApi={setApi} opts={{ align: "start", loop: false }}>
        <CarouselContent className="-ml-3">
          {stories.map((story, i) => (
            <CarouselItem
              key={story.id}
              className="pl-3 basis-[280px] sm:basis-[320px] md:basis-[360px]"
            >
              <StoryCard story={story} isActive={i === current} onClick={() => api?.scrollTo(i)} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 mt-6">
        {stories.map((_, i) => (
          <button
            key={i}
            onClick={() => api?.scrollTo(i)}
            className={cn(
              "h-1 rounded-full transition-all duration-300",
              i === current
                ? "w-6 bg-[var(--green-moss)]"
                : "w-1.5 bg-[var(--glass-stroke)] hover:bg-[var(--ink-3)]",
            )}
            style={{ border: "none", cursor: "pointer", padding: 0 }}
            aria-label={`Go to story ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── StoryCard ─────────────────────────────────────────────────────────────────

interface StoryCardProps {
  story: StoryData;
  isActive: boolean;
  onClick: () => void;
}

function StoryCard({ story, isActive, onClick }: StoryCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl cursor-pointer select-none",
        "transition-all duration-500",
        isActive ? "opacity-100 scale-100" : "opacity-60 scale-[0.97]",
      )}
      style={{
        height: 420,
        border: `1px solid ${isActive ? "var(--glass-stroke)" : "transparent"}`,
      }}
    >
      {/* Background image */}
      <img
        src={story.image}
        alt={story.title}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(10,18,12,0.92) 0%, rgba(10,18,12,0.3) 55%, transparent 100%)",
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-5">
        {/* Top: number label */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {story.label}
        </div>

        {/* Bottom: title + body */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <h3
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              fontSize: "1.35rem",
              lineHeight: 1.18,
              letterSpacing: "-0.005em",
              color: "#fff",
              margin: 0,
            }}
          >
            {story.title}
          </h3>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              fontSize: "0.875rem",
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.62)",
              margin: 0,
            }}
          >
            {story.body}
          </p>

          {/* Avatar row */}
          {story.avatar && (
            <div className="flex items-center gap-2 mt-1">
              <Avatar className="h-6 w-6">
                <AvatarImage src={story.avatar} />
                <AvatarFallback style={{ fontSize: "0.65rem", background: "var(--sage-glow)", color: "var(--ink-1)" }}>
                  {story.avatarFallback ?? "H"}
                </AvatarFallback>
              </Avatar>
              <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
                halo
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
