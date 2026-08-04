import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

/** Reporte de accidente (multipart, hasta 5 fotos en el campo `photos`). */
export class ReportAccidentDto {
  @ApiProperty({ example: 42, description: 'Pedido que tenía en curso' })
  @Type(() => Number)
  @IsInt()
  invoiceId: number;

  @ApiProperty({ example: 'Me caí', maxLength: 50 })
  @IsString()
  @IsNotEmpty({ message: 'Indica qué tipo de accidente fue' })
  @MaxLength(50)
  reasonCode: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/** Listado paginado de accidentes (solo ADMIN). */
export class PaginatedAccidentsParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({
    description: 'true = solo pendientes de revisar, false = solo atendidos',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyPending?: boolean;
}
