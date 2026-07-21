"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_PROMPT_DISMISSED_AT_KEY = "gosafety_install_prompt_dismissed_at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return true;
  }

  const iosStandalone =
    typeof window.navigator !== "undefined" &&
    "standalone" in window.navigator &&
    window.navigator.standalone === true;

  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

function isInDismissCooldown() {
  if (typeof window === "undefined") {
    return true;
  }

  const dismissedAtRaw = window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_AT_KEY);
  if (!dismissedAtRaw) {
    return false;
  }

  const dismissedAt = Number(dismissedAtRaw);
  if (!Number.isFinite(dismissedAt)) {
    window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_AT_KEY);
    return false;
  }

  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export default function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    setIsDismissed(isInDismissCooldown());

    if (isStandaloneMode()) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsDismissed(true);
      setIsInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        const now = Date.now();
        window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_AT_KEY, String(now));
        setIsDismissed(true);
      }
    } finally {
      setDeferredPrompt(null);
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    const now = Date.now();
    window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_AT_KEY, String(now));
    setIsDismissed(true);
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || isDismissed) {
    return null;
  }

  return (
    <aside className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 md:inset-x-auto md:right-4">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur md:w-[360px]">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Install GoSafety</p>
            <p className="text-xs text-slate-600">
              Add to your home screen for faster access and offline support.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Dismiss install prompt"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <Button
          type="button"
          onClick={handleInstall}
          disabled={isInstalling}
          className="h-10 w-full"
        >
          {isInstalling ? "Waiting for confirmation..." : "Install app"}
        </Button>
      </div>
    </aside>
  );
}
