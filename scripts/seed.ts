import { demoOpportunities } from '../src/lib/demo-data';
import { ingestAndPersist } from '../src/lib/operations';

async function main(): Promise<void> {
  const result = await ingestAndPersist(demoOpportunities());
  console.log(
    JSON.stringify(
      {
        imported: result.records.length,
        scored: result.scored,
        hardRejected: result.hardRejected,
        duplicates: result.duplicates,
      },
      null,
      2,
    ),
  );
}

void main();
