import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import archiver from 'archiver';
import * as path from 'path';
import * as fs from 'fs';
import { GoogleDriveService } from './google-drive.service';
import { PassThrough } from 'stream';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async createBackupStream(): Promise<{
    archive: archiver.Archiver;
    filename: string;
  }> {
    const sqlDump = await this.generateSqlDump();

    const archive = archiver('zip', { zlib: { level: 9 } });

    const filename = `mandalo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

    archive.append(sqlDump, { name: 'data.sql' });

    const uploadsDir =
      process.platform === 'win32'
        ? path.join(process.cwd(), 'uploads')
        : '/app/uploads';

    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    } else {
      this.logger.warn(`Uploads directory not found at: ${uploadsDir}`);
    }

    return { archive, filename };
  }

  async executeFullBackupAndUpload(): Promise<string> {
    const { archive, filename } = await this.createBackupStream();

    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    const uploadPromise = this.googleDriveService.uploadFile(
      passThrough,
      filename,
    );

    await archive.finalize();
    return uploadPromise;
  }

  /** Borra los backups más viejos de Drive, dejando solo los `keep` más recientes. */
  async cleanupOldBackups(keep: number): Promise<number> {
    const files = await this.googleDriveService.listBackupFiles();
    const toDelete = files.slice(keep);

    for (const file of toDelete) {
      await this.googleDriveService.deleteFile(file.id);
      this.logger.log(`Backup eliminado: ${file.name} (${file.id})`);
    }

    return toDelete.length;
  }

  private readonly BATCH_SIZE = 500;

  private async generateSqlDump(): Promise<string> {
    const metadatas = this.dataSource.entityMetadatas;
    const sortedMetadatas = this.topologicalSort(metadatas);

    let sql = '-- Mandalo Database Dump (Topological Order)\n';
    sql += `-- Generated at: ${new Date().toISOString()}\n\n`;
    sql += 'SET session_replication_role = replica;\n\n';

    for (const meta of sortedMetadatas) {
      const records = await this.dataSource.query(
        `SELECT * FROM "${meta.tableName}"`,
      );
      if (records.length === 0) continue;

      const columns = Object.keys(records[0]);
      const columnList = columns.map((c) => `"${c}"`).join(', ');

      sql += `-- Table: ${meta.tableName}\n`;
      sql += 'BEGIN;\n';

      for (let i = 0; i < records.length; i += this.BATCH_SIZE) {
        const batch = records.slice(i, i + this.BATCH_SIZE);
        const valueRows = batch.map(
          (record) =>
            `(${Object.values(record)
              .map((val) => this.escapeSqlValue(val))
              .join(', ')})`,
        );
        sql += `INSERT INTO "${meta.tableName}" (${columnList}) VALUES\n  ${valueRows.join(',\n  ')}\n  ON CONFLICT DO NOTHING;\n`;
      }

      sql += 'COMMIT;\n\n';
    }

    sql += 'SET session_replication_role = DEFAULT;\n';

    return sql;
  }

  private escapeSqlValue(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return value.toString();
    if (value instanceof Date) return `'${value.toISOString()}'`;
    // Columnas array nativas de Postgres (p. ej. product.images: text[]) NO
    // se restauran con sintaxis JSON ("[...]") — eso da "malformed array
    // literal" al correr el INSERT. Un array de Postgres se escribe con
    // llaves ("{...}"), cada elemento entre comillas dobles propias, con
    // backslash/comillas internas escapadas por su cuenta ANTES de aplicar
    // el escape de comilla simple del SQL de afuera (bug real encontrado
    // 2026-08-11: el backup de prod generaba INSERTs de "product" que
    // fallaban al restaurarlos en dev).
    if (Array.isArray(value)) {
      const arrayLiteral = `{${value
        .map((el) => {
          if (el === null || el === undefined) return 'NULL';
          const escaped = String(el)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
          return `"${escaped}"`;
        })
        .join(',')}}`;
      return `'${arrayLiteral.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'object')
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private topologicalSort(metadatas: any[]): any[] {
    const dependencies: Record<string, string[]> = {};

    for (const meta of metadatas) {
      dependencies[meta.name] = [];

      for (const fk of meta.foreignKeys || []) {
        if (
          fk.referencedEntityMetadata &&
          fk.referencedEntityMetadata.name !== meta.name
        ) {
          dependencies[meta.name].push(fk.referencedEntityMetadata.name);
        }
      }

      for (const rel of meta.relations || []) {
        if (
          rel.isOwning &&
          rel.inverseEntityMetadata &&
          rel.inverseEntityMetadata.name !== meta.name
        ) {
          if (
            !dependencies[meta.name].includes(rel.inverseEntityMetadata.name)
          ) {
            dependencies[meta.name].push(rel.inverseEntityMetadata.name);
          }
        }
      }
    }

    const sorted = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (metaName: string) => {
      if (visited.has(metaName)) return;
      if (visiting.has(metaName)) return;

      visiting.add(metaName);

      for (const dep of dependencies[metaName] || []) {
        visit(dep);
      }

      visiting.delete(metaName);
      visited.add(metaName);

      const actualMeta = metadatas.find((m) => m.name === metaName);
      if (actualMeta) sorted.push(actualMeta);
    };

    const sortedMetadatas = [...metadatas].sort((a, b) => {
      const depsA = dependencies[a.name]?.length || 0;
      const depsB = dependencies[b.name]?.length || 0;
      return depsB - depsA;
    });

    for (const meta of sortedMetadatas) {
      visit(meta.name);
    }

    return sorted;
  }
}
