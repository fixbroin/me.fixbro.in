"use client";

import { useEffect } from 'react';

/**
 * Global Keyboard Behavior Manager
 * Handles disabling autocorrect, spellcheck, and autocomplete globally on text inputs
 * to prevent predictive text suggestion bars from showing on top of virtual keyboards.
 */
export default function KeyboardBehaviorManager() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.contentEditable === 'true';

      if (isInput) {
        // Disable suggestions and predictive autocorrect to hide virtual keyboard suggestion bars
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
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
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, []);

  return null;
}
