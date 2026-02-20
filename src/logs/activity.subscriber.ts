import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
  ObjectLiteral,
  EntityMetadata,
} from 'typeorm';
import { Log } from './logs.entity';
import { RequestContext } from '../common/request-context/request-context';

// Entities we don't want to log automatically (log table itself, auth tokens etc.)
const EXCLUDED_ENTITIES = new Set<string>(['Log']);
const REDACTED_KEYS = new Set([
  'password',
  'hashedPassword',
  'refreshToken',
  'token',
  'secret',
  'salt',
]);

@EventSubscriber()
export class ActivitySubscriber implements EntitySubscriberInterface<any> {
  // No constructor; TypeORM/Nest will instantiate automatically using pattern-based discovery

  /** Skip logging for internal or excluded entities */
  private shouldSkip(name?: string): boolean {
    if (!name) return true;
    if (EXCLUDED_ENTITIES.has(name)) return true;
    return false;
  }

  private toEntityName(metadata?: EntityMetadata, fallback?: any): string {
    return metadata?.name || metadata?.targetName || fallback?.constructor?.name || 'Unknown';
  }

  private toEntityId(metadata: EntityMetadata | undefined, ...records: any[]): string | undefined {
    for (const record of records) {
      if (!record) continue;
      if (typeof record === 'string' || typeof record === 'number') return String(record);

      if (metadata?.primaryColumns?.length) {
        for (const col of metadata.primaryColumns) {
          const value = (record as any)?.[col.propertyName];
          if (value !== undefined && value !== null) return String(value);
        }
      }

      const fallbackId =
        (record as any)?.id ??
        (record as any)?.uuid ??
        (record as any)?.ID ??
        (record as any)?.code;
      if (fallbackId !== undefined && fallbackId !== null) return String(fallbackId);
    }
    return undefined;
  }

  private toSchoolId(...records: any[]): string | undefined {
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      const schoolId = (record as any).schoolId || (record as any).school?.id || (record as any).user?.schoolId;
      if (schoolId) return String(schoolId);
    }
    return undefined;
  }

  private sanitizeValue(value: any, depth = 0): any {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== 'object') return value;

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => this.sanitizeValue(item, depth + 1));
    }

    if (depth >= 2) {
      const compactId =
        value.id ?? value.uuid ?? value.code ?? value.name ?? value.title ?? value.email ?? value.username;
      return compactId !== undefined ? compactId : '[Object]';
    }

    const out: Record<string, any> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw === 'function' || raw === undefined) continue;
      if (REDACTED_KEYS.has(key)) {
        out[key] = '[REDACTED]';
        continue;
      }
      out[key] = this.sanitizeValue(raw, depth + 1);
    }
    return out;
  }

  private buildContext(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    metadata: EntityMetadata | undefined,
    entityLike: any,
    newValues: Record<string, any> | undefined,
    oldValues?: Record<string, any>,
    entityIdHint?: string | number | Record<string, any>,
  ) {
    const ctx = RequestContext.get();
    const user = ctx?.user;

    const entityType = this.toEntityName(metadata, entityLike);
    const entityId = this.toEntityId(metadata, entityIdHint, newValues, oldValues, entityLike);
    const schoolId =
      this.toSchoolId(user, newValues, oldValues, entityLike) ||
      undefined;

    return {
      action,
      module: entityType.toUpperCase(),
      level: 'info' as const,
      schoolId,
      performedBy: user
        ? {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
          }
        : undefined,
      entityId,
      entityType,
      oldValues,
      newValues,
      metadata: {
        source: 'TYPEORM_SUBSCRIBER',
        tableName: metadata?.tableName,
      },
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    } as any; // cast to allow DeepPartial<Log>
  }

  listenTo() {
    // We listen to all entities dynamically; filtering done in handlers
    return Object;
  }

  async afterInsert(event: InsertEvent<any>) {
    const entityName = this.toEntityName(event.metadata, event.entity);
    if (this.shouldSkip(entityName)) return;

    const rawEntity = event.entity || (event as any).generatedMaps?.[0] || {};
    const newValues = this.sanitizeValue(rawEntity) as Record<string, any>;
    const logData = this.buildContext(
      'CREATE',
      event.metadata,
      rawEntity,
      newValues,
      undefined,
      (event as any).entityId,
    );
    if (!logData) return;
    await event.manager.getRepository(Log).insert(logData as any);
  }

  async afterUpdate(event: UpdateEvent<any>) {
    const entityName = this.toEntityName(event.metadata, event.entity || event.databaseEntity);
    if (this.shouldSkip(entityName)) return;

    const oldValues = event.databaseEntity ? (this.sanitizeValue(event.databaseEntity) as Record<string, any>) : undefined;
    const updatedEntity = event.entity ? (this.sanitizeValue(event.entity) as Record<string, any>) : undefined;

    const changed: Record<string, any> = {};
    if (updatedEntity && oldValues) {
      Object.keys(updatedEntity).forEach((key) => {
        if (['updatedAt', 'createdAt', 'timestamp'].includes(key)) return;
        if (JSON.stringify(updatedEntity[key]) !== JSON.stringify(oldValues[key])) {
          changed[key] = updatedEntity[key];
        }
      });
    } else if (event.updatedColumns?.length && event.entity) {
      for (const col of event.updatedColumns) {
        const key = col.propertyName;
        const nextValue = (updatedEntity as any)?.[key];
        if (nextValue !== undefined) {
          changed[key] = nextValue;
        }
      }
    } else if (updatedEntity) {
      Object.assign(changed, updatedEntity);
    }

    // Updates executed via repository.update/query builder may not include changed fields.
    // In that case still record an update action so we retain actor/timestamp audit evidence.
    if (Object.keys(changed).length === 0) return;

    const logData = this.buildContext(
      'UPDATE',
      event.metadata,
      event.entity || event.databaseEntity,
      changed,
      oldValues,
      (event as any).entityId,
    );
    if (!logData) return;
    await event.manager.getRepository(Log).insert(logData as any);
  }

  async afterRemove(event: RemoveEvent<any>) {
    const entityName = this.toEntityName(event.metadata, event.entity || event.databaseEntity);
    if (this.shouldSkip(entityName)) return;

    const oldValues =
      event.databaseEntity || event.entity
        ? (this.sanitizeValue(event.databaseEntity || event.entity) as Record<string, any>)
        : undefined;
    const newValues = this.sanitizeValue({
      id: this.toEntityId(event.metadata, event.entityId, event.entity, event.databaseEntity),
    }) as Record<string, any>;

    const logData = this.buildContext(
      'DELETE',
      event.metadata,
      event.entity || event.databaseEntity || (event.entityId as ObjectLiteral),
      newValues,
      oldValues,
      event.entityId as any,
    );
    if (!logData) return;
    await event.manager.getRepository(Log).insert(logData as any);
  }
}
