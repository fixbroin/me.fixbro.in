"use client";

import { useEffect } from 'react';

/**
 * Global Keyboard Behavior Manager
 * Handles:
 * 1. Scrolling focused input fields smoothly into view so they are not covered by virtual keyboards.
 * 2. Dynamically disabling autocorrect, spellcheck, and autocomplete to hide prediction/suggestion bars.
 * 3. Detecting virtual keyboard status and hiding fixed bottom elements to prevent floating.
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

        // 2. Smoothly scroll the focused element into view
        // Small delay ensures the virtual keyboard has started/finished sliding up
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);

    // 3. Monitor virtual viewport resizing to detect virtual keyboard opening
    const handleResize = () => {
      if (!window.visualViewport) return;

      // When the virtual keyboard opens, the visual viewport height shrinks significantly
      const isKeyboardActive = window.screen.height - window.visualViewport.height > 150;

      if (isKeyboardActive) {
        document.documentElement.classList.add('keyboard-active');
      } else {
        document.documentElement.classList.remove('keyboard-active');
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, []);

  return null;
}
