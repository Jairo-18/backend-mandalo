import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Video corto del producto (tipo reel, máx. 10 s, cuadrado 720×720) + su
 * miniatura. Solo se guardan las URLs: los archivos viven en disco
 * (`uploads/products`), igual que las fotos.
 */
export class AddProductVideo1787200000000 implements MigrationInterface {
  name = 'AddProductVideo1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD "videoUrl" varchar(500), ADD "videoThumbnailUrl" varchar(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "videoUrl", DROP COLUMN "videoThumbnailUrl"`,
    );
  }
}
