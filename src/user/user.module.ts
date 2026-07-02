import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';
import { CrudUserService } from './services/crudUser.service';
import { UserUC } from './useCases/user.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [UserController],
  providers: [UserService, CrudUserService, UserUC],
  exports: [UserService],
})
export class UserModule {}
