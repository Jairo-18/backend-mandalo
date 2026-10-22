import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { FavoriteController } from './controllers/favorite.controller';
import { FavoriteService } from './services/favorite.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [FavoriteController],
  providers: [FavoriteService],
})
export class FavoriteModule {}
