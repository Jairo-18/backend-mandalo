import { AppDataSource } from '../../typeorm.config';

async function main() {
  const ds = AppDataSource;
  await ds.initialize();
  const byState = await ds.query(
    `SELECT s.code, count(*) AS n
       FROM invoice i JOIN "stateType" s ON s.id = i."stateTypeId"
      GROUP BY s.code ORDER BY s.code`,
  );
  console.log('Pedidos por estado:');
  for (const r of byState) console.log(`  ${r.code}: ${r.n}`);

  const details = await ds.query(`SELECT count(*) AS n FROM "invoiceDetail"`);
  const orgTags = await ds.query(`SELECT count(*) AS n FROM "organizationalTag"`);
  const withProof = await ds.query(
    `SELECT count(*) AS n FROM invoice WHERE "paymentProofUrl" IS NOT NULL`,
  );
  const withDeli = await ds.query(
    `SELECT count(*) AS n FROM invoice WHERE "deliveryUserId" IS NOT NULL`,
  );
  console.log(`Renglones (invoiceDetail): ${details[0].n}`);
  console.log(`org-tags (N:M): ${orgTags[0].n}`);
  console.log(`Pedidos con comprobante: ${withProof[0].n}`);
  console.log(`Pedidos con repartidor asignado: ${withDeli[0].n}`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
