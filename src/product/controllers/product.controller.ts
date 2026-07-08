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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ProductUC } from '../useCases/product.uc';
import {
  CreateProductDto,
  PaginatedProductsParamsDto,
  RemoveProductImageDto,
  UpdateProductDto,
} from '../dtos/product.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { Product } from '../../shared/entities/product.entity';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import {
  AddProductImageDocs,
  CreateProductDocs,
  DeleteProductDocs,
  FindOneProductDocs,
  GetPaginatedProductsDocs,
  RemoveProductImageDocs,
  UpdateProductDocs,
} from '../decorators/product.decorators';

/**
 * Productos del negocio del usuario autenticado (rol NEGO): el backend
 * resuelve el negocio desde el JWT, así que cada cuenta solo administra
 * los productos de SU organizational.
 */
@Controller('product')
@ApiTags('Productos')
@UseGuards(AuthGuard())
export class ProductController {
  constructor(private readonly _productUC: ProductUC) {}

  @Post('create')
  @CreateProductDocs()
  async create(
    @GetUser() user: User,
    @Body() body: CreateProductDto,
  ): Promise<CreatedRecordResponseDto> {
    const product = await this._productUC.create(user, body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Producto creado exitosamente',
      data: { rowId: String(product.id) },
    };
  }

  @Get('paginated')
  @GetPaginatedProductsDocs()
  async getPaginated(
    @GetUser() user: User,
    @Query() params: PaginatedProductsParamsDto,
  ): Promise<ResponsePaginationDto<Product>> {
    return this._productUC.paginatedList(user, params);
  }

  @Get(':id')
  @FindOneProductDocs()
  async findOne(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const product = await this._productUC.findOne(user, id);
    return {
      statusCode: HttpStatus.OK,
      data: product,
    };
  }

  @Patch(':id')
  @UpdateProductDocs()
  async update(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProductDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._productUC.update(user, id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Producto actualizado exitosamente',
    };
  }

  @Delete(':id')
  @DeleteProductDocs()
  async delete(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._productUC.delete(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Producto eliminado exitosamente',
    };
  }

  /** Agrega una foto al producto (multipart/form-data, campo `file`). */
  @Post(':id/image')
  @AddProductImageDocs()
  @UseInterceptors(FileInterceptor('file'))
  async addImage(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._productUC.addImage(user, id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Foto agregada exitosamente',
      data,
    };
  }

  /** Quita una foto del producto (query `url` con la URL guardada). */
  @Delete(':id/image')
  @RemoveProductImageDocs()
  async removeImage(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RemoveProductImageDto,
  ) {
    const data = await this._productUC.removeImage(user, id, query.url);
    return {
      statusCode: HttpStatus.OK,
      message: 'Foto eliminada exitosamente',
      data,
    };
  }
}
