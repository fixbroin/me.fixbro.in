"use client";

import { useEffect } from 'react';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

/**
 * Global Keyboard Behavior Manager
 * Handles:
 * 1. Automatically scrolling focused input fields smoothly to the center of the viewport.
 * 2. Disabling autocorrect, spellcheck, and autocomplete globally on text inputs
 *    based on the admin config setting `enableKeyboardSuggestions`.
 */
export default function KeyboardBehaviorManager() {
  const { config: appConfig } = useApplicationConfig();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.contentEditable === 'true';

      if (isInput) {
        // Disable suggestions and predictive autocorrect if disabled in admin config
        const suggestionsEnabled = appConfig?.enableKeyboardSuggestions !== false;

        if (!suggestionsEnabled && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          const type = target.getAttribute('type');
          if (!type || ['text', 'search', 'tel', 'email', 'url', 'number', 'password'].includes(type)) {
            if (!target.hasAttribute('autocomplete')) {
              target.setAttribute('autocomplete', 'off');
            }
            if (!target.hasAttribute('autocorrect')) {
              target.setAttribute('autocorrect', 'off');
            }
            if (!target.hasAttribute('spellcheck')) {
              target.setAttribute('spellcheck', 'false');
            }
          }
        }

        // Smoothly scroll the focused input field to the center of the viewport
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [appConfig]);

  return null;
}
