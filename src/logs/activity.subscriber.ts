import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent, RemoveEvent } from 'typeorm';
import { Log } from './logs.entity';
import { RequestContext } from '../common/request-context/request-context';

// Entities we don't want to log automatically (log table itself, auth tokens etc.)
const EXCLUDED_ENTITIES = new Set<string>(['Log']);

@EventSubscriber()
export class ActivitySubscriber implements EntitySubscriberInterface<any> {
  // No constructor; TypeORM/Nest will instantiate automatically using pattern-based discovery

  /** Skip logging for internal or excluded entities */
  private shouldSkip(target: any): boolean {
    if (!target) return true;
    const name = target.name || target.constructor?.name;
    if (!name) return true;
    if (EXCLUDED_ENTITIES.has(name)) return true;
    return false;
  }

  /** Build common log properties from request context */
  private buildContext(action: string, entity: any, values: Record<string, any>, oldValues?: Record<string, any>) {
    const ctx = RequestContext.get();
    const user = ctx?.user;
    // Exclude SUPER_ADMIN actions as per requirement
    if (user?.role === 'SUPER_ADMIN') return null;

    const entityType = entity.constructor?.name || 'Unknown';
    const entityId = values?.id || values?.uuid || values?.ID || values?.code || undefined;
    return {
      action,
      module: entityType.toUpperCase(),
      level: 'info' as const,
      schoolId: user?.schoolId || values?.schoolId || oldValues?.schoolId,
      performedBy: user
        ? {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            schoolId: user.schoolId,
          }
        : undefined,
      entityId,
      entityType,
      oldValues,
      newValues: values,
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    } as any; // cast to allow DeepPartial<Log>
  }

  listenTo() {
    // We listen to all entities dynamically; filtering done in handlers
    return Object;
  }

  async afterInsert(event: InsertEvent<any>) {
    if (this.shouldSkip(event.metadata?.target)) return;
    const logData = this.buildContext('CREATE', event.entity, { ...event.entity });
    if (!logData) return;
  await event.manager.getRepository(Log).insert(logData as any);
  }

  async afterUpdate(event: UpdateEvent<any>) {
    if (this.shouldSkip(event.metadata?.target)) return;
    if (!event.entity) return; // updated via query builder maybe

    const databaseEntity = event.databaseEntity ? { ...event.databaseEntity } : undefined;
    const updatedEntity = event.entity ? { ...event.entity } : undefined;

    // Derive changed fields only
    const changed: Record<string, any> = {};
    if (updatedEntity && databaseEntity) {
      Object.keys(updatedEntity).forEach((key) => {
        if (['updatedAt', 'createdAt', 'timestamp'].includes(key)) return;
        if (JSON.stringify(updatedEntity[key]) !== JSON.stringify(databaseEntity[key])) {
          changed[key] = updatedEntity[key];
        }
      });
    }

    // If nothing changed, skip
    if (Object.keys(changed).length === 0) return;

    const logData = this.buildContext('UPDATE', event.entity, changed, databaseEntity);
    if (!logData) return;
  await event.manager.getRepository(Log).insert(logData as any);
  }

  async afterRemove(event: RemoveEvent<any>) {
    if (this.shouldSkip(event.metadata?.target)) return;
    const logData = this.buildContext('DELETE', event.entity || { id: event.entityId }, { id: event.entityId }, event.databaseEntity as any);
    if (!logData) return;
  await event.manager.getRepository(Log).insert(logData as any);
  }
}
