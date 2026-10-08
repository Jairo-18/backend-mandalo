import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { UserAddressUC } from '../useCases/userAddress.uc';
import {
  CreateUserAddressDto,
  UpdateUserAddressDto,
} from '../dtos/userAddress.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import {
  CreateUserAddressDocs,
  DeleteUserAddressDocs,
  ListMyAddressesDocs,
  UpdateUserAddressDocs,
} from '../decorators/userAddress.decorators';

/**
 * Direcciones de entrega del usuario autenticado: el userId sale del JWT,
 * cada quien administra solo las suyas (mismo patrón que /product).
 */
@Controller('user-address')
@ApiTags('Direcciones del usuario')
@UseGuards(AuthGuard())
export class UserAddressController {
  constructor(private readonly _userAddressUC: UserAddressUC) {}

  @Get()
  @ListMyAddressesDocs()
  async listMine(@GetUser() user: User) {
    const addresses = await this._userAddressUC.listMine(user);
    return {
      statusCode: HttpStatus.OK,
      data: addresses,
    };
  }

  @Post('create')
  @CreateUserAddressDocs()
  async create(
    @GetUser() user: User,
    @Body() body: CreateUserAddressDto,
  ): Promise<CreatedRecordResponseDto> {
    const address = await this._userAddressUC.create(user, body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Dirección guardada exitosamente',
      data: { rowId: String(address.id) },
    };
  }

  @Patch(':id')
  @UpdateUserAddressDocs()
  async update(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserAddressDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._userAddressUC.update(user, id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Dirección actualizada exitosamente',
    };
  }

  /** Sube/reemplaza la foto de la dirección (multipart, campo `file`). */
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._userAddressUC.setPhoto(user, id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Foto de la dirección guardada',
      data,
    };
  }

  @Delete(':id/photo')
  async removePhoto(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._userAddressUC.removePhoto(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Foto de la dirección eliminada',
    };
  }

  @Delete(':id')
  @DeleteUserAddressDocs()
  async delete(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._userAddressUC.delete(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Dirección eliminada exitosamente',
    };
  }
}
