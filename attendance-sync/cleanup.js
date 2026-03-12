/**
 * Cleanup corrupted Firestore attendance data
 * Deletes all docs from attendance_device_users and attendance_records
 * so the next sync will upload fresh, correct data.
 *
 * Usage: node cleanup.js
 */
const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
});
const db = admin.firestore();

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log('  ' + name + ': empty (nothing to delete)');
    return 0;
  }

  let count = 0;
  // Batch delete (max 500 per batch)
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 450)) {
      batch.delete(doc.ref);
      count++;
    }
    await batch.commit();
  }
  console.log('  ' + name + ': deleted ' + count + ' docs');
  return count;
}

async function main() {
  console.log('Cleaning up Firestore attendance data...\n');

  await deleteCollection('attendance_device_users');
  await deleteCollection('attendance_records');
  await deleteCollection('attendance_sync_status');

  console.log('\nDone! Firestore attendance data cleared.');
  console.log('Next: connect to device and run "node index.js" to sync fresh data.');
  process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
