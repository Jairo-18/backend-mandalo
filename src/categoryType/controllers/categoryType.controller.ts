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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { CategoryTypeUC } from '../useCases/categoryType.uc';
import {
  CreateCategoryTypeDto,
  PaginatedCategoryTypesParamsDto,
  UpdateCategoryTypeDto,
} from '../dtos/categoryType.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { CategoryType } from '../../shared/entities/categoryType.entity';
import {
  CreateCategoryTypeDocs,
  DeleteCategoryTypeDocs,
  FindOneCategoryTypeDocs,
  GetPaginatedCategoryTypesDocs,
  UpdateCategoryTypeDocs,
} from '../decorators/categoryType.decorators';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

// Escrituras solo ADMIN; las lecturas quedan con JWT porque el panel del
// NEGO también las usa (Select de categoría en su form de producto).
@Controller('category-type')
@ApiTags('Categorías de producto')
@UseGuards(AuthGuard())
export class CategoryTypeController {
  constructor(private readonly _categoryTypeUC: CategoryTypeUC) {}

  @Post('create')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @CreateCategoryTypeDocs()
  async create(
    @Body() body: CreateCategoryTypeDto,
  ): Promise<CreatedRecordResponseDto> {
    const categoryType = await this._categoryTypeUC.create(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Categoría creada exitosamente',
      data: { rowId: categoryType.id },
    };
  }

  @Get('paginated')
  @GetPaginatedCategoryTypesDocs()
  async getPaginated(
    @Query() params: PaginatedCategoryTypesParamsDto,
  ): Promise<ResponsePaginationDto<CategoryType>> {
    return this._categoryTypeUC.paginatedList(params);
  }

  @Get(':id')
  @FindOneCategoryTypeDocs()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const categoryType = await this._categoryTypeUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: categoryType,
    };
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @UpdateCategoryTypeDocs()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCategoryTypeDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._categoryTypeUC.update(id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Categoría actualizada exitosamente',
    };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @DeleteCategoryTypeDocs()
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._categoryTypeUC.delete(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Categoría eliminada exitosamente',
    };
  }
}
