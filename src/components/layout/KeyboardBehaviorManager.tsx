"use client";

import { useEffect } from 'react';

/**
 * Helper to find the scrollable parent container of a focused node.
 * Falls back to main container elements or forms if no scrollable parent is found.
 */
function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (node == null) {
    return null;
  }

  // Check if the element itself is scrollable
  if (node.scrollHeight > node.clientHeight) {
    const overflowY = window.getComputedStyle(node).overflowY;
    const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';
    if (isScrollable) {
      return node;
    }
  }
  
  // Detect common layout containers that need padding
  if (
    node.classList.contains('overflow-y-auto') || 
    node.tagName === 'FORM' || 
    node.getAttribute('role') === 'dialog' ||
    node.classList.contains('dialog-content') ||
    node.tagName === 'MAIN'
  ) {
    return node;
  }

  return getScrollParent(node.parentElement);
}

/**
 * Global Keyboard Behavior Manager
 * Handles:
 * 1. Scrolling focused input fields smoothly into view so they are not covered by virtual keyboards.
 * 2. Temporarily expanding the bottom padding of scrollable parent forms to allow bottom-most inputs (like pincode, city, state) to scroll up fully.
 * 3. Dynamically disabling autocorrect, spellcheck, and autocomplete to hide prediction/suggestion bars.
 * 4. Detecting virtual keyboard status and hiding fixed bottom elements to prevent floating.
 */
export default function KeyboardBehaviorManager() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let paddedElement: HTMLElement | null = null;
    let originalPaddingBottom = '';
    let normalHeight = window.innerHeight;

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

        // 2. Find scrollable parent and append padding to create scroll space
        const scrollParent = getScrollParent(target) || document.body;
        
        if (paddedElement && paddedElement !== scrollParent) {
          paddedElement.style.paddingBottom = originalPaddingBottom;
        }

        if (paddedElement !== scrollParent) {
          paddedElement = scrollParent;
          originalPaddingBottom = scrollParent.style.paddingBottom || '';
          // Add extra scroll space at the bottom so bottom elements can scroll high enough
          scrollParent.style.setProperty('padding-bottom', '300px', 'important');
        }

        // Record normal height right before keyboard opens
        if (window.visualViewport) {
          normalHeight = window.visualViewport.height;
        }

        // 3. Smoothly scroll the focused element into view
        // Small delay ensures the virtual keyboard has started/finished sliding up
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    const handleFocusOut = () => {
      // Small delay to verify if focus moved to another input
      setTimeout(() => {
        const active = document.activeElement;
        const isStillInput = active && (
          active.tagName === 'INPUT' || 
          active.tagName === 'TEXTAREA' || 
          (active as HTMLElement).contentEditable === 'true'
        );

        if (!isStillInput && paddedElement) {
          paddedElement.style.paddingBottom = originalPaddingBottom;
          paddedElement = null;
          originalPaddingBottom = '';
        }
      }, 100);
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // 4. Monitor virtual viewport resizing to detect virtual keyboard opening
    const handleResize = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const active = document.activeElement;
      const isInputFocused = active && (
        active.tagName === 'INPUT' || 
        active.tagName === 'TEXTAREA' || 
        (active as HTMLElement).contentEditable === 'true'
      );

      // If no input is focused, current height is the normal height
      if (!isInputFocused) {
        normalHeight = currentHeight;
      }

      // Check if visual viewport shrunk by more than 150px compared to normal height
      const isKeyboardActive = isInputFocused && (normalHeight - currentHeight > 150);

      if (isKeyboardActive) {
        document.documentElement.classList.add('keyboard-active');
      } else {
        document.documentElement.classList.remove('keyboard-active');
        
        // Keyboard closed: clean up bottom padding and active focus
        if (paddedElement) {
          paddedElement.style.paddingBottom = originalPaddingBottom;
          paddedElement = null;
          originalPaddingBottom = '';
        }

        // Force blur if keyboard closed but input kept focus (device back button behavior)
        if (isInputFocused && active instanceof HTMLElement) {
          active.blur();
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      if (paddedElement) {
        paddedElement.style.paddingBottom = originalPaddingBottom;
      }
    };
  }, []);

  return null;
}
