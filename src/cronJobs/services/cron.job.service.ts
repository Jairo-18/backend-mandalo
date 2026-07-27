import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BackupUC } from '../../backup/useCases/backup.uc';

@Injectable()
export class CronJobService {
  private readonly logger = new Logger(CronJobService.name);
  private readonly KEEP_LAST_BACKUPS = 2;

  private isBackupRunning = false;
  private isCleanupRunning = false;

  constructor(
    private readonly _backupUC: BackupUC,
    private readonly _configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleBackup() {
    if (this._configService.get<string>('app.env') !== 'production') return;

    if (this.isBackupRunning) {
      this.logger.warn('Backup ya en ejecución, se omite esta iteración');
      return;
    }

    this.isBackupRunning = true;
    try {
      await this._backupUC.performBackupAndUpload();
      this.logger.log(
        `[${new Date().toISOString()}] Backup generado y subido a Google Drive correctamente`,
      );
    } catch (error) {
      this.logger.error(`Backup fallido: ${error.message}`, error.stack);
    } finally {
      this.isBackupRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleBackupCleanup() {
    if (this._configService.get<string>('app.env') !== 'production') return;

    if (this.isCleanupRunning) {
      this.logger.warn(
        'Limpieza de backups ya en ejecución, se omite esta iteración',
      );
      return;
    }

    this.isCleanupRunning = true;
    try {
      const deleted = await this._backupUC.cleanupOldBackups(
        this.KEEP_LAST_BACKUPS,
      );
      this.logger.log(
        `Limpieza de backups: ${deleted} archivo(s) eliminado(s), se conservan los últimos ${this.KEEP_LAST_BACKUPS}`,
      );
    } catch (error) {
      this.logger.error(
        `Limpieza de backups fallida: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isCleanupRunning = false;
    }
  }
}
