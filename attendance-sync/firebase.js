const admin = require('firebase-admin');
const path = require('path');

let db = null;

function init() {
  if (db) return;
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
  });
  db = admin.firestore();
}

function dk(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

async function uploadRecords(records) {
  if (!records.length) return 0;
  let n = 0;
  for (let i = 0; i < records.length; i += 450) {
    const batch = db.batch();
    for (const r of records.slice(i, i + 450)) {
      const t = new Date(r.recordTime || Date.now());
      const uid = String(r.deviceUserId || '');
      batch.set(db.collection('attendance_records').doc(uid + '_' + t.getTime()), {
        deviceUserId: uid,
        checkTime: admin.firestore.Timestamp.fromDate(t),
        dateKey: dk(t),
        type: r.type || 0,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      n++;
    }
    await batch.commit();
  }
  return n;
}

async function uploadUsers(users) {
  if (!users.length) return;
  const batch = db.batch();
  for (const u of users) {
    // Use userId (enrollment number shown on device) as doc ID
    // This matches the user_id string in attendance records
    const userId = String(u.userId || u.uid || '');
    if (!userId) continue;
    batch.set(db.collection('attendance_device_users').doc(userId), {
      uid: String(u.uid || ''),
      userId,
      name: u.name || ('User ' + userId), role: u.role || 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

async function setStatus(data) {
  await db.collection('attendance_sync_status').doc('current').set({
    ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function onCommands(cb) {
  return db.collection('attendance_commands')
    .where('status', '==', 'pending')
    .onSnapshot(snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'added') cb({ id: c.doc.id, ...c.doc.data() });
      });
    });
}

async function updateCommand(id, status, result) {
  await db.collection('attendance_commands').doc(id).update({
    status, result: result || '',
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = { init, uploadRecords, uploadUsers, setStatus, onCommands, updateCommand };
