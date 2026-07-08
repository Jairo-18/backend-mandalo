import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UserAddressController } from './controllers/userAddress.controller';
import { UserAddressService } from './services/userAddress.service';
import { UserAddressUC } from './useCases/userAddress.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [UserAddressController],
  providers: [UserAddressService, UserAddressUC],
  exports: [UserAddressService],
})
export class UserAddressModule {}
