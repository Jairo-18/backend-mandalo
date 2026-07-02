import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserUC } from '../useCases/user.uc';
import { CreateUserDto, RegisterUserDto, UpdateUserDto } from '../dtos/user.dto';
import { PaginatedUsersParamsDto } from '../dtos/crudUser.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { UserPaginatedListItem } from '../interfaces/user.interface';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';
import {
  CreateUserDocs,
  DeleteUserDocs,
  FindOneUserDocs,
  GetPaginatedUsersDocs,
  RegisterUserDocs,
  UpdateUserDocs,
} from '../decorators/user.decorators';

@Controller('user')
@ApiTags('Usuarios')
export class UserController {
  constructor(private readonly _userUC: UserUC) {}

  @Post('register/client')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RegisterUserDocs('cliente')
  async registerClient(
    @Body() body: RegisterUserDto,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.registerClient(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Cliente registrado exitosamente',
      data: { rowId: user.id },
    };
  }

  @Post('register/delivery')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RegisterUserDocs('repartidor')
  async registerDelivery(
    @Body() body: RegisterUserDto,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.registerDelivery(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Repartidor registrado exitosamente',
      data: { rowId: user.id },
    };
  }

  @Post('create')
  @UseGuards(AuthGuard())
  @CreateUserDocs()
  async create(
    @Body() body: CreateUserDto,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.create(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Usuario creado exitosamente',
      data: { rowId: user.id },
    };
  }

  @Get('paginated')
  @UseGuards(AuthGuard())
  @GetPaginatedUsersDocs()
  async getPaginated(
    @Query() params: PaginatedUsersParamsDto,
  ): Promise<ResponsePaginationDto<UserPaginatedListItem>> {
    return this._userUC.paginatedList(params);
  }

  @Get(':id')
  @UseGuards(AuthGuard())
  @FindOneUserDocs()
  async findOne(@Param('id') id: string) {
    const user = await this._userUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: user,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard())
  @UpdateUserDocs()
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._userUC.update(id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Usuario actualizado exitosamente',
    };
  }

  @Delete(':id')
  @UseGuards(AuthGuard())
  @DeleteUserDocs()
  async delete(@Param('id') id: string): Promise<DeleteRecordResponseDto> {
    await this._userUC.delete(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Usuario eliminado exitosamente',
    };
  }
}
