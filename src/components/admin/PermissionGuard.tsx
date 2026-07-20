"use client";

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';

interface PermissionGuardProps {
  moduleId: string;
  action: 'read' | 'create' | 'write' | 'delete';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A wrapper component that only renders its children if the current admin 
 * has the specified permission for the given module.
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({ 
  moduleId, 
  action, 
  children, 
  fallback = null 
}) => {
  const { adminPermissions, isSuperAdmin } = useAuth();

  // Super Admin always has all permissions
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  const hasPermission = hasActionPermission(adminPermissions, moduleId, action);

  if (hasPermission) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default PermissionGuard;
