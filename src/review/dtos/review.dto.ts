import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ReviewTargetType } from '../../shared/entities/review.entity';

/** 0.5, 1, 1.5 … 5 (medias estrellas). */
export const RATING_VALUES = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

export const REVIEW_COMMENT_MAX = 250;

export class CreateReviewDto {
  @ApiProperty({ enum: ReviewTargetType, example: ReviewTargetType.BUSINESS })
  @IsEnum(ReviewTargetType)
  targetType: ReviewTargetType;

  @ApiProperty({ description: 'De 0.5 a 5, en pasos de 0.5', example: 4.5 })
  @Type(() => Number)
  @IsIn(RATING_VALUES, {
    message: 'La calificación va de 0.5 a 5 estrellas, en medias estrellas.',
  })
  rating: number;

  @ApiPropertyOptional({ maxLength: REVIEW_COMMENT_MAX })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @MaxLength(REVIEW_COMMENT_MAX, {
    message: `El comentario puede tener máximo ${REVIEW_COMMENT_MAX} caracteres.`,
  })
  comment?: string;
}
