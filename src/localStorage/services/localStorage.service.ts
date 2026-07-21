import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

/** Subcarpetas lógicas de /uploads (una por tipo de imagen). */
export type UploadFolder = 'users' | 'organizational' | 'products' | 'payments';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];

/**
 * Almacenamiento de imágenes en el disco del servidor (copiado de samawe).
 * Recibe el buffer de multer, lo optimiza con sharp (webp) y lo guarda en el
 * directorio de uploads; `ServeStaticModule` (app.module) lo sirve público en
 * `/uploads/...`. En el VPS el directorio es un bind mount de Dokploy para
 * que las imágenes sobrevivan a los redeploys.
 */
@Injectable()
export class LocalStorageService {
  /**
   * Directorio base donde se guardan las imágenes.
   * En producción: /app/uploads (bind mount persistente en Dokploy)
   * En desarrollo (Windows): ./uploads (relativo al cwd, gitignored)
   */
  private readonly uploadsDir: string;

  /** URL base pública del servidor (arma las URLs que se guardan en la DB). */
  private readonly baseUrl: string;

  constructor(private readonly _configService: ConfigService) {
    this.uploadsDir =
      process.platform === 'win32'
        ? path.join(process.cwd(), 'uploads')
        : '/app/uploads';

    const configuredUrl = this._configService.get<string>('app.baseUrl');
    this.baseUrl =
      configuredUrl ||
      `http://localhost:${this._configService.get<number>('app.port') || 3000}`;
  }

  /**
   * Guarda una imagen optimizada (webp) y retorna la información para la DB.
   * @returns `imageUrl` (URL pública absoluta) y `publicId` (ruta relativa
   * dentro de uploads, p. ej. `users/uuid.webp`, para poder borrarla luego).
   */
  async saveImage(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<{ imageUrl: string; publicId: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Archivo no válido o vacío');
    }
    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se aceptan: jpg, png, webp, gif',
      );
    }
    return this.writeImage(file, folder);
  }

  /**
   * Igual que `saveImage` pero también acepta PDF (SOAT / tecnomecánica: en
   * la práctica llegan como certificado digital de una sola página y obligar
   * a fotografiar el papel impreso da peor calidad). Un PDF se guarda tal
   * cual (no pasa por `sharp`, que no puede rasterizarlo); una imagen sigue
   * el mismo camino de optimización que `saveImage`.
   */
  async saveDocument(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<{ imageUrl: string; publicId: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Archivo no válido o vacío');
    }
    if (!DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se aceptan: jpg, png, webp, gif o pdf',
      );
    }
    if (file.mimetype === 'application/pdf') {
      return this.writePdf(file, folder);
    }
    return this.writeImage(file, folder);
  }

  private async writeImage(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<{ imageUrl: string; publicId: string }> {
    const targetDir = path.join(this.uploadsDir, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = `${uuidv4()}.webp`;
    const filePath = path.join(targetDir, filename);

    // Los archivos grandes permiten más ancho (fotos de producto/portada).
    const maxWidth = file.buffer.length > 2 * 1024 * 1024 ? 1920 : 1200;

    // A diferencia de samawe se ESPERA la escritura: la URL que se devuelve
    // se consulta inmediatamente desde la app y no debe dar 404.
    await sharp(file.buffer)
      .webp({ quality: 80, effort: 6 })
      .resize({ width: maxWidth, withoutEnlargement: true })
      .toFile(filePath);

    const publicId = `${folder}/${filename}`;
    const imageUrl = `${this.baseUrl}/uploads/${publicId}`;

    return { imageUrl, publicId };
  }

  private async writePdf(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<{ imageUrl: string; publicId: string }> {
    const targetDir = path.join(this.uploadsDir, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = `${uuidv4()}.pdf`;
    const filePath = path.join(targetDir, filename);
    await fs.promises.writeFile(filePath, file.buffer);

    const publicId = `${folder}/${filename}`;
    const imageUrl = `${this.baseUrl}/uploads/${publicId}`;

    return { imageUrl, publicId };
  }

  /** Elimina un archivo del disco usando su publicId (p. ej. `users/uuid.webp`). */
  async deleteImage(publicId: string): Promise<void> {
    if (!publicId) return;

    const filePath = path.join(this.uploadsDir, publicId);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error eliminando imagen del disco:', error);
    }
  }

  /**
   * Extrae el publicId de una URL guardada en la DB, solo si es una imagen
   * subida a este servidor (contiene `/uploads/`). Para URLs externas
   * (p. ej. el avatar de Google) devuelve null y no se borra nada.
   */
  publicIdFromUrl(url?: string | null): string | null {
    if (!url) return null;
    const marker = '/uploads/';
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  }
}
