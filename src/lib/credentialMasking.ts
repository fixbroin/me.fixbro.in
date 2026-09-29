/**
 * Utility functions for masking sensitive credentials (API keys, secrets, passwords)
 * to ensure only Super Admins can view and copy them.
 */

export const MASK_PLACEHOLDER = '••••••••••••••••••••••••';

/**
 * Returns the raw secret if user is a Super Admin, or a masked placeholder if not.
 */
export const maskSecret = (value: string | null | undefined, isSuperAdmin: boolean = false): string => {
  if (isSuperAdmin) {
    return value || '';
  }
  if (!value) {
    return '';
  }
  return MASK_PLACEHOLDER;
};

/**
 * Partially masks an API key (showing first few characters like rzp_live_ or pk_live_) for non-super-admins.
 */
export const maskApiKey = (
  value: string | null | undefined, 
  isSuperAdminOrPrefix: boolean | number = false, 
  visiblePrefixLen: number = 8
): string => {
  let isSuperAdmin = false;
  let prefixLen = visiblePrefixLen;

  if (typeof isSuperAdminOrPrefix === 'boolean') {
    isSuperAdmin = isSuperAdminOrPrefix;
  } else if (typeof isSuperAdminOrPrefix === 'number') {
    prefixLen = isSuperAdminOrPrefix;
    isSuperAdmin = false;
  }

  if (isSuperAdmin) {
    return value || '';
  }
  if (!value) {
    return '';
  }
  const prefix = value.slice(0, prefixLen);
  return `${prefix}••••••••••••••••`;
};

/**
 * Checks if a string contains masked bullet characters to prevent accidentally overwriting real secrets in database saves.
 */
export const isMaskedValue = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return value.includes('••••');
};
