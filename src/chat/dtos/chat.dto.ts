import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({ example: 'Estoy afuera 🏠', maxLength: 500 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(500, {
    message: 'El mensaje no puede superar los 500 caracteres',
  })
  body: string;
}
