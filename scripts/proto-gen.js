/**
 * Genera los stubs de TypeScript del .proto con protoc y el plugin `ts-proto`
 * en modo NestJS. protoc se baja de
 * github.com/protocolbuffers/protobuf/releases; si no está en el PATH:
 *   PROTOC=C:/ruta/protoc.exe pnpm proto:gen
 * Los stubs generados se versionan: el build de Docker no necesita protoc.
 */
const { execFileSync } = require('child_process');
const { mkdirSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const bin = join(root, 'node_modules', '.bin');
const isWin = process.platform === 'win32';
const protoc = process.env.PROTOC || 'protoc';
const plugin = join(bin, isWin ? 'protoc-gen-ts_proto.cmd' : 'protoc-gen-ts_proto');
const out = join(root, 'src', 'distributed', 'generated');

mkdirSync(out, { recursive: true });
execFileSync(
  protoc,
  [
    `--plugin=protoc-gen-ts_proto=${plugin}`,
    `--ts_proto_out=${out}`,
    '--ts_proto_opt=nestJs=true,addGrpcMetadata=false,snakeToCamel=true',
    '--proto_path=proto',
    'proto/pedidos.proto',
  ],
  { cwd: root, stdio: 'inherit' },
);
console.log(`Stubs generados en ${out}`);
