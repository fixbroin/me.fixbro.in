"use client";

import { useEffect } from 'react';

/**
 * Global Keyboard Behavior Manager
 * Handles:
 * 1. Automatically scrolling focused input fields smoothly to the center of the viewport.
 * 2. Disabling autocorrect, spellcheck, and autocomplete globally on text inputs
 *    to prevent predictive text suggestion bars from showing on top of virtual keyboards.
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
        // 1. Disable suggestions and predictive autocorrect to hide virtual keyboard suggestion bars
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

        // 2. Smoothly scroll the focused input field to the center of the viewport
        // Small delay ensures the keyboard has started sliding up
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, []);

  return null;
}
