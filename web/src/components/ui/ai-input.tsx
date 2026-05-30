import React from "react";
import { cx } from "class-variance-authority";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./color-orb.css";

// ── ColorOrb ────────────────────────────────────────────────────────────────

interface OrbProps {
  dimension?: string;
  className?: string;
  tones?: { base?: string; accent1?: string; accent2?: string; accent3?: string };
  spinDuration?: number;
}

export const ColorOrb: React.FC<OrbProps> = ({
  dimension = "192px",
  className,
  tones,
  spinDuration = 20,
}) => {
  const fallbackTones = {
    base: "oklch(28% 0.04 160)",
    accent1: "oklch(62% 0.14 155)",
    accent2: "oklch(48% 0.12 162)",
    accent3: "oklch(55% 0.08 150)",
  };
  const palette = { ...fallbackTones, ...tones };
  const dim = parseInt(dimension.replace("px", ""), 10);
  const blurStrength = dim < 50 ? Math.max(dim * 0.008, 1) : Math.max(dim * 0.015, 4);
  const contrastStrength = dim < 50 ? Math.max(dim * 0.004, 1.2) : Math.max(dim * 0.008, 1.5);
  const pixelDot = dim < 50 ? Math.max(dim * 0.004, 0.05) : Math.max(dim * 0.008, 0.1);
  const shadowRange = dim < 50 ? Math.max(dim * 0.004, 0.5) : Math.max(dim * 0.008, 2);
  const maskRadius = dim < 30 ? "0%" : dim < 50 ? "5%" : dim < 100 ? "15%" : "25%";
  const adjustedContrast = dim < 30 ? 1.1 : dim < 50 ? Math.max(contrastStrength * 1.2, 1.3) : contrastStrength;

  return (
    <div
      className={cn("color-orb", className)}
      style={{
        width: dimension,
        height: dimension,
        "--base": palette.base,
        "--accent1": palette.accent1,
        "--accent2": palette.accent2,
        "--accent3": palette.accent3,
        "--spin-duration": `${spinDuration}s`,
        "--blur": `${blurStrength}px`,
        "--contrast": adjustedContrast,
        "--dot": `${pixelDot}px`,
        "--shadow": `${shadowRange}px`,
        "--mask": maskRadius,
      } as React.CSSProperties}
    />
  );
};

// ── Context ──────────────────────────────────────────────────────────────────

const SPEED_FACTOR = 1;

interface ContextShape {
  showForm: boolean;
  successFlag: boolean;
  isLoading: boolean;
  triggerOpen: () => void;
  triggerClose: () => void;
  onSend: (msg: string) => void;
}

const FormContext = React.createContext({} as ContextShape);
const useFormContext = () => React.useContext(FormContext);

// ── MorphPanel ───────────────────────────────────────────────────────────────

interface MorphPanelProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

export interface MorphPanelHandle {
  open: () => void;
}

const FORM_WIDTH = 520;
const FORM_HEIGHT = 240;

export const MorphPanel = React.forwardRef<MorphPanelHandle, MorphPanelProps>(
function MorphPanel({ onSend, isLoading = false }, ref) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [successFlag, setSuccessFlag] = React.useState(false);

  const triggerClose = React.useCallback(() => {
    setShowForm(false);
    textareaRef.current?.blur();
  }, []);

  const triggerOpen = React.useCallback(() => {
    setShowForm(true);
    setTimeout(() => { textareaRef.current?.focus(); });
  }, []);

  React.useImperativeHandle(ref, () => ({ open: triggerOpen }), [triggerOpen]);

  const handleSuccess = React.useCallback(() => {
    triggerClose();
    setSuccessFlag(true);
    setTimeout(() => setSuccessFlag(false), 1500);
  }, [triggerClose]);

  React.useEffect(() => {
    function clickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node) && showForm) {
        triggerClose();
      }
    }
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, [showForm, triggerClose]);

  const ctx = React.useMemo(
    () => ({ showForm, successFlag, isLoading, triggerOpen, triggerClose, onSend }),
    [showForm, successFlag, isLoading, triggerOpen, triggerClose, onSend],
  );

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: FORM_WIDTH, height: FORM_HEIGHT }}
    >
      <motion.div
        ref={wrapperRef}
        data-panel
        className={cx(
          "relative bottom-8 z-[3] flex flex-col items-center overflow-hidden",
          "border border-[var(--glass-stroke)]",
          "bg-[var(--glass-light)] backdrop-blur-[var(--blur)]",
          "max-sm:bottom-5",
        )}
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={false}
        animate={{
          width: showForm ? FORM_WIDTH : "auto",
          height: showForm ? FORM_HEIGHT : 44,
          borderRadius: showForm ? 14 : 20,
        }}
        transition={{
          type: "spring",
          stiffness: 550 / SPEED_FACTOR,
          damping: 45,
          mass: 0.7,
          delay: showForm ? 0 : 0.08,
        }}
      >
        <FormContext.Provider value={ctx}>
          <DockBar />
          <InputForm ref={textareaRef} onSuccess={handleSuccess} />
        </FormContext.Provider>
      </motion.div>
    </div>
  );
});

// ── DockBar ──────────────────────────────────────────────────────────────────

function DockBar() {
  const { showForm, isLoading, triggerOpen } = useFormContext();
  return (
    <footer className="mt-auto flex h-[44px] items-center justify-center whitespace-nowrap select-none">
      <div className="flex items-center justify-center gap-2 px-3">
        <div className="flex w-fit items-center gap-2">
          <AnimatePresence mode="wait">
            {showForm ? (
              <motion.div
                key="blank"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                className="h-5 w-5"
              />
            ) : (
              <motion.div
                key="orb"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ColorOrb dimension="22px" tones={{ base: "oklch(22% 0.04 160)", accent1: "oklch(62% 0.14 155)", accent2: "oklch(48% 0.12 162)", accent3: "oklch(55% 0.08 150)" }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Button
          type="button"
          className={cx(
            "flex h-fit flex-1 justify-end rounded-full px-3 py-1",
            "text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--sage-glow)]",
            "font-[var(--font-sans)] text-[0.88rem] tracking-[0.01em]",
          )}
          variant="ghost"
          onClick={triggerOpen}
          disabled={isLoading}
        >
          <span className="truncate">{isLoading ? "thinking…" : "Ask halo"}</span>
        </Button>
      </div>
    </footer>
  );
}

// ── InputForm ────────────────────────────────────────────────────────────────

const InputForm = React.forwardRef<
  HTMLTextAreaElement,
  { onSuccess: () => void }
>(function InputForm({ onSuccess }, ref) {
  const { triggerClose, showForm, onSend } = useFormContext();
  const btnRef = React.useRef<HTMLButtonElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const message = (data.get("message") as string | null)?.trim();
    if (message) onSend(message);
    onSuccess();
  }

  function handleKeys(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") triggerClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      btnRef.current?.click();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute bottom-0"
      style={{ width: FORM_WIDTH, height: FORM_HEIGHT, pointerEvents: showForm ? "all" : "none" }}
    >
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 550 / SPEED_FACTOR, damping: 45, mass: 0.7 }}
            className="flex h-full flex-col p-1"
          >
            <div className="flex items-center justify-between py-1 px-2">
              <p
                className="z-[2] ml-[38px] flex items-center gap-1.5 select-none"
                style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--ink-3)" }}
              >
                halo
              </p>
              <button
                type="submit"
                ref={btnRef}
                className="flex cursor-pointer items-center justify-center gap-1 rounded-[10px] bg-transparent pr-1 select-none"
                style={{ color: "var(--ink-3)" }}
              >
                <KeyHint>⌘</KeyHint>
                <KeyHint className="w-fit">Enter</KeyHint>
              </button>
            </div>
            <textarea
              ref={ref}
              placeholder="Ask halo anything…"
              name="message"
              className="h-full w-full resize-none scroll-py-2 rounded-md p-4 outline-0"
              style={{
                background: "transparent",
                fontFamily: "var(--font-sans)",
                fontSize: "0.95rem",
                color: "var(--ink-1)",
                lineHeight: 1.6,
              }}
              required
              onKeyDown={handleKeys}
              spellCheck={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-2 left-3"
          >
            <ColorOrb dimension="22px" tones={{ base: "oklch(22% 0.04 160)", accent1: "oklch(62% 0.14 155)", accent2: "oklch(48% 0.12 162)", accent3: "oklch(55% 0.08 150)" }} />
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
});

// ── KeyHint ──────────────────────────────────────────────────────────────────

function KeyHint({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cx(
        "flex h-6 w-fit items-center justify-center rounded-sm px-[6px] font-sans",
        className,
      )}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.68rem",
        color: "var(--ink-3)",
        border: "1px solid var(--glass-stroke)",
      }}
    >
      {children}
    </kbd>
  );
}

export default MorphPanel;
