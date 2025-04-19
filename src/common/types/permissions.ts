// src/common/types/permissions.ts
export enum Resource {
    STUDENT = 'student',
    COURSE = 'course',
    PAYMENT = 'payment',
    // Add other resources as needed
  }
  
  export enum Action {
    CREATE = 'create',
    READ = 'read',
    UPDATE = 'update',
    DELETE = 'delete',
    MANAGE = 'manage', // Full control
    SELF_READ = 'self_read',
    SELF_UPDATE = 'self_update',
    SELF_DELETE = 'self_delete',
  }
  
  export type Permission = {
    resource: Resource;
    actions: Action[];
  };
  
  export enum Role {
    ADMIN = 'admin',
    TEACHER = 'teacher',
    FINANCE = 'finance',
    STUDENT = 'student',
    PARENT = 'parent',
  }
  
  export const RolePermissions: Record<Role, Permission[]> = {
    [Role.ADMIN]: [
      { resource: Resource.STUDENT, actions: [Action.MANAGE] },
      { resource: Resource.COURSE, actions: [Action.MANAGE] },
      { resource: Resource.PAYMENT, actions: [Action.MANAGE] },
      // Add other admin permissions
    ],
    [Role.TEACHER]: [
      { resource: Resource.STUDENT, actions: [Action.SELF_UPDATE] },
      { resource: Resource.COURSE, actions: [Action.READ, Action.UPDATE] },
      // Add other teacher permissions
    ],
    [Role.FINANCE]: [
      { resource: Resource.PAYMENT, actions: [Action.MANAGE] },
      { resource: Resource.STUDENT, actions: [Action.READ] },
      // Add other finance permissions
    ],
    [Role.STUDENT]: [
      { resource: Resource.STUDENT, actions: [Action.SELF_READ, Action.SELF_UPDATE] },
      // Add other student permissions
    ],
    [Role.PARENT]: [
      { resource: Resource.STUDENT, actions: [Action.SELF_READ] },
      // Add other parent permissions
    ],
  };