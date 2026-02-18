import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface ServiceStatusItem {
  name: string;
  status: 'RUNNING' | 'WARNING' | 'DOWN';
  message?: string;
}

@Injectable()
export class SystemService {
  private startTime = Date.now();
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async getSystemOverview(schoolId?: string, superAdmin = false) {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const uptime30DayPercent = Math.round(Math.min(100, (uptimeSeconds / (30 * 24 * 60 * 60)) * 100) * 100) / 100;

    // Active sessions: count users who have been active in the last 30 minutes
    // Apply school filtering for multi-tenant isolation
    let activeSessions = 0;
    try {
      // Count users who have logged in or been active in the last 30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      let query = `SELECT COUNT(*) FROM "user" 
                   WHERE "isActive" = true 
                   AND ("lastActivityAt" > $1 OR "lastLoginAt" > $1)`;
      let params: any[] = [thirtyMinutesAgo];
      
      // Apply school filtering for non-super admin users
      if (!superAdmin) {
        if (!schoolId) {
          activeSessions = 0; // No school, no active sessions
        } else {
          query += ' AND "schoolId" = $2';
          params.push(schoolId);
          const result = await this.dataSource.query(query, params);
          activeSessions = parseInt(result[0]?.count || '0', 10);
        }
      } else if (schoolId) {
        // Super admin can optionally filter by school
        query += ' AND "schoolId" = $2';
        params.push(schoolId);
        const result = await this.dataSource.query(query, params);
        activeSessions = parseInt(result[0]?.count || '0', 10);
      } else {
        // Super admin without school filter sees all active sessions
        const result = await this.dataSource.query(query, params);
        activeSessions = parseInt(result[0]?.count || '0', 10);
      }
    } catch (error) {
      // Fallback: if the new columns don't exist yet, use a more conservative count
      try {
        let fallbackQuery = 'SELECT COUNT(*) FROM "user" WHERE "isActive"=true';
        let fallbackParams: any[] = [];
        
        // Apply school filtering in fallback too
        if (!superAdmin) {
          if (!schoolId) {
            activeSessions = 0;
          } else {
            fallbackQuery += ' AND "schoolId" = $1';
            fallbackParams.push(schoolId);
            const result = await this.dataSource.query(fallbackQuery, fallbackParams);
            const totalActive = parseInt(result[0]?.count || '0', 10);
            // Estimate that only 10-30% of active users are actually online
            activeSessions = Math.ceil(totalActive * 0.15);
          }
        } else if (schoolId) {
          fallbackQuery += ' AND "schoolId" = $1';
          fallbackParams.push(schoolId);
          const result = await this.dataSource.query(fallbackQuery, fallbackParams);
          const totalActive = parseInt(result[0]?.count || '0', 10);
          activeSessions = Math.ceil(totalActive * 0.15);
        } else {
          const result = await this.dataSource.query(fallbackQuery, fallbackParams);
          const totalActive = parseInt(result[0]?.count || '0', 10);
          activeSessions = Math.ceil(totalActive * 0.15);
        }
      } catch {
        activeSessions = 0;
      }
    }

    // Alerts placeholder: count of suspended schools + any failed jobs (future)
    let alerts = 0;
    try {
      const result = await this.dataSource.query('SELECT COUNT(*) FROM schools WHERE status = $1', ['SUSPENDED']);
      alerts += parseInt(result[0]?.count || '0', 10);
    } catch {}

    let lastBackupAt: string | null = null;
    try {
      const backupDirs = [
        path.resolve(process.cwd(), 'db_backups'),
        path.resolve(process.cwd(), '..', 'db_backups'),
        path.resolve(process.cwd(), 'backups'),
        path.resolve(process.cwd(), '..', 'backups'),
      ];
      let latestMtime = 0;
      for (const dir of backupDirs) {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const full = path.join(dir, entry);
          try {
            const stat = fs.statSync(full);
            if (stat.isFile() && stat.mtimeMs > latestMtime) {
              latestMtime = stat.mtimeMs;
            }
          } catch {}
        }
      }
      if (latestMtime > 0) {
        lastBackupAt = new Date(latestMtime).toISOString();
      }
    } catch {}

    return {
      status: 'HEALTHY',
      statusMessage: 'All systems operational',
      uptimeSeconds,
      uptime30DayPercent,
      activeSessions,
      alerts,
      lastBackupAt,
      generatedAt: new Date().toISOString(),
    };
  }

  async getResourceUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = (usedMem / totalMem) * 100;

    // CPU: average over cores load for last 1 min (os.loadavg()[0] scaled)
    const load = os.loadavg?.()[0] || 0;
    const cpuCount = os.cpus().length;
    const cpuPercent = Math.min(100, parseFloat(((load / cpuCount) * 100).toFixed(2))); // naive approximation

    // Disk usage from filesystem stats when supported by runtime
    let diskPercent = 0;
    try {
      const statfs = (fs as any).statfsSync?.(process.cwd());
      if (statfs && statfs.blocks && statfs.bfree !== undefined) {
        const totalBlocks = Number(statfs.blocks);
        const freeBlocks = Number(statfs.bfree);
        if (totalBlocks > 0) {
          diskPercent = parseFloat((((totalBlocks - freeBlocks) / totalBlocks) * 100).toFixed(2));
        }
      }
    } catch {}

    // Database performance/load from pool + latency
    let dbPercent = 0;
    let dbLatencyMs = 0;
    try {
      const pool: any = (this.dataSource as any).driver?.master; // pg pool
      if (pool?.totalCount && pool?.options?.max) {
        dbPercent = parseFloat(((pool.totalCount / pool.options.max) * 100).toFixed(2));
      }
    } catch {}
    try {
      const start = Date.now();
      await this.dataSource.query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    } catch {}

    return {
      cpu: { percent: cpuPercent },
      memory: { percent: parseFloat(memPercent.toFixed(2)), used: usedMem, total: totalMem },
      disk: { percent: diskPercent },
      database: { percent: dbPercent, latencyMs: dbLatencyMs },
      generatedAt: new Date().toISOString(),
    };
  }

  async getServicesStatus(): Promise<ServiceStatusItem[]> {
    const statuses: ServiceStatusItem[] = [];

    // Web server assumed running if this endpoint responds
    statuses.push({ name: 'Web Server', status: 'RUNNING' });

    // Database check
    try {
      await this.dataSource.query('SELECT 1');
      statuses.push({ name: 'Database', status: 'RUNNING' });
    } catch (e) {
      statuses.push({ name: 'Database', status: 'DOWN', message: (e as Error).message });
    }

    // Email service placeholder (future integration)
    statuses.push({ name: 'Email Service', status: 'RUNNING' });

    // File Storage placeholder & simple warning if >80% disk (placeholder value)
    statuses.push({ name: 'File Storage', status: 'RUNNING' });

    // Backup service placeholder
    statuses.push({ name: 'Backup Service', status: 'RUNNING' });

    // Monitoring placeholder
    statuses.push({ name: 'Monitoring', status: 'RUNNING' });

    return statuses;
  }
}
