import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { OrganizationalController } from './controllers/organizational.controller';
import { OrganizationalService } from './services/organizational.service';
import { OrganizationalUC } from './useCases/organizational.uc';
import { UserModule } from '../user/user.module';
import { LocalStorageModule } from '../localStorage/localStorage.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    UserModule,
    LocalStorageModule,
  ],
  controllers: [OrganizationalController],
  providers: [OrganizationalService, OrganizationalUC],
  exports: [OrganizationalService],
})
export class OrganizationalModule {}
