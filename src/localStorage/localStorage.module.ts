import { Module } from '@nestjs/common';
import { LocalStorageService } from './services/localStorage.service';

@Module({
  providers: [LocalStorageService],
  exports: [LocalStorageService],
})
export class LocalStorageModule {}
