import { BadRequestException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from 'ffmpeg-static';

/** Duración máxima del video de producto (con medio segundo de holgura). */
export const MAX_VIDEO_SECONDS = 10;
const DURATION_TOLERANCE_SECONDS = 0.5;

/**
 * Tamaño final: 4:3 HORIZONTAL (960×720). Es casi la proporción del área de
 * fotos del detalle del producto (todo el ancho × 280), así el video la
 * llena de lado a lado. Antes era cuadrado (720×720) y quedaba con franjas.
 */
const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 720;

/** Tope por proceso de ffmpeg: un video de 10 s tarda unos pocos segundos. */
const FFMPEG_TIMEOUT_MS = 90_000;

type FfmpegResult = { code: number | null; stderr: string };

function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg no está disponible en este servidor'));
      return;
    }
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Solo interesa el encabezado (duración) y el final (errores).
      stderr = (stderr + chunk.toString()).slice(-20_000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/** "Duration: 00:00:09.87" del encabezado de ffmpeg → segundos. */
function parseDuration(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * Video de producto listo para servir: valida la duración (≤ 10 s), lo
 * recorta a 4:3 HORIZONTAL al centro, lo baja a 960×720 / 30 fps en H.264 + AAC con
 * `faststart` (arranca a reproducir sin bajarlo entero) y saca una miniatura
 * JPG del primer medio segundo. Un video de 10 s queda en ~1–2 MB.
 *
 * Devuelve las rutas de los archivos temporales; quien llama los mueve a
 * uploads y borra el directorio temporal con `cleanup`.
 */
export async function processProductVideo(buffer: Buffer): Promise<{
  videoPath: string;
  thumbnailPath: string;
  durationSeconds: number;
  cleanup: () => Promise<void>;
}> {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mandalo-video-'));
  const cleanup = () => fs.promises.rm(workDir, { recursive: true, force: true });

  try {
    const inputPath = path.join(workDir, `in-${uuidv4()}`);
    await fs.promises.writeFile(inputPath, buffer);

    // Sin salida, ffmpeg solo imprime el encabezado (y sale con código 1).
    const probe = await runFfmpeg(['-hide_banner', '-i', inputPath]);
    const durationSeconds = parseDuration(probe.stderr);
    if (durationSeconds == null || !/Stream #.*Video/.test(probe.stderr)) {
      throw new BadRequestException('El archivo no es un video válido.');
    }
    if (durationSeconds > MAX_VIDEO_SECONDS + DURATION_TOLERANCE_SECONDS) {
      throw new BadRequestException(
        `El video puede durar máximo ${MAX_VIDEO_SECONDS} segundos (el tuyo dura ${Math.round(durationSeconds)}).`,
      );
    }

    const videoPath = path.join(workDir, 'out.mp4');
    const encode = await runFfmpeg([
      '-hide_banner',
      '-y',
      '-i', inputPath,
      '-t', String(MAX_VIDEO_SECONDS + DURATION_TOLERANCE_SECONDS),
      '-vf',
      // Recorte 4:3 al centro: si es más ancho que 4:3 se cortan los lados;
      // si es más alto (vertical) se corta arriba y abajo.
      `crop='if(gt(a,4/3),ih*4/3,iw)':'if(gt(a,4/3),ih,iw*3/4)',scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '26',
      '-profile:v', 'main',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '2',
      '-movflags', '+faststart',
      videoPath,
    ]);
    if (encode.code !== 0 || !fs.existsSync(videoPath)) {
      throw new BadRequestException('No se pudo procesar el video. Intenta con otro.');
    }

    const thumbnailPath = path.join(workDir, 'thumb.jpg');
    const thumb = await runFfmpeg([
      '-hide_banner',
      '-y',
      '-ss', durationSeconds > 1 ? '0.5' : '0',
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '3',
      thumbnailPath,
    ]);
    if (thumb.code !== 0 || !fs.existsSync(thumbnailPath)) {
      throw new BadRequestException('No se pudo procesar el video. Intenta con otro.');
    }

    return { videoPath, thumbnailPath, durationSeconds, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
