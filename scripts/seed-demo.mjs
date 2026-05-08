const server = process.env.COORDINATOR_URL ?? process.argv[2] ?? 'http://localhost:3000';

async function main() {
  const response = await fetch(`${server}/api/admin/seed-demo-data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  });

  const json = await response.json();
  if (!response.ok) {
    console.error('Seed failed:', JSON.stringify(json));
    process.exit(1);
  }

  const seeded = json.seeded;
  console.log(`Seeded project ${seeded.project.slug} (${seeded.project.id}), packetsCreated=${seeded.packetsCreated}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
