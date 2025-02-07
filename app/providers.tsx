"use client";

import { clientEnv, isAnalyticsEnabled } from "@/env/client";
import { ThemeProvider } from "next-themes";
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { ReactNode } from "react";

// Only initialize PostHog if analytics is enabled and we're in a browser environment
if (typeof window !== 'undefined') {
  try {
    // Only attempt to initialize if both key and host are available
    if (isAnalyticsEnabled()) {
      const posthogKey = clientEnv.NEXT_PUBLIC_POSTHOG_KEY;
      const posthogHost = clientEnv.NEXT_PUBLIC_POSTHOG_HOST;

      posthog.init(posthogKey!, {
        api_host: posthogHost!,
        person_profiles: 'always',
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') posthog.debug();
        },
        // Disable autocapture entirely to prevent sensitive data collection
        autocapture: false,
      });
    }
  } catch (error) {
    // Silently fail if PostHog initialization fails
    console.warn('PostHog initialization failed:', error);
  }
}

export function Providers({ children }: { children: ReactNode }) {
  // Only wrap with PostHogProvider if analytics is enabled and initialized
  const content = (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );

  // Conditionally wrap with PostHogProvider
  return isAnalyticsEnabled() && posthog.config ? (
    <PostHogProvider client={posthog}>
      {content}
    </PostHogProvider>
  ) : content;
}