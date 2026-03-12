const ZK = require('./zk');
const fb = require('./firebase');
const fs = require('fs');
const path = require('path');

const IP = '192.168.1.201';
const PORT = 4370;
const COMMKEY = 0; // CommKey cua may cham cong (mac dinh 0)
const INTERVAL = 5 * 60 * 1000;
const LOG_DIR = path.join(__dirname, 'logs');

let zk = null;

function log(msg) {
  const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = '[' + ts + '] ' + msg;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
    fs.appendFileSync(path.join(LOG_DIR, new Date().toISOString().slice(0,10) + '.log'), line + '\n');
  } catch (_) {}
}

async function sync() {
  log('-- sync --');
  try {
    const users = await zk.getUsers();
    log('users: ' + users.length);
    if (users.length) await fb.uploadUsers(users);
  } catch (e) { log('users err: ' + e.message); }

  try {
    const recs = await zk.getAttendances();
    log('records: ' + recs.length);
    if (recs.length) log('uploaded: ' + await fb.uploadRecords(recs));
  } catch (e) { log('records err: ' + e.message); }

  await fb.setStatus({ lastSyncTime: new Date().toISOString(), connected: true });
  log('-- done --');
}

async function main() {
  log('=== attendance-sync v5 (raw ZK, TCP+UDP) ===');

  try { fb.init(); } catch (e) { log('FATAL firebase: ' + e.message); process.exit(1); }

  zk = new ZK(IP, PORT, 10000, COMMKEY);
  for (let i = 1; i <= 3; i++) {
    try {
      log('connect (' + i + '/3)...');
      await zk.connect();
      log('connected via ' + zk.proto.toUpperCase());
      break;
    } catch (e) {
      log('attempt ' + i + ': ' + e.message);
      if (i === 3) { log('FATAL'); await fb.setStatus({ connected: false, lastError: e.message }); process.exit(1); }
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  try { log('firmware: ' + await zk.getVersion()); } catch (_) {}

  await sync();

  setInterval(async () => {
    try { await sync(); } catch (e) {
      log('err: ' + e.message);
      try { await zk.disconnect(); await zk.connect(); log('reconnected'); } catch (re) {
        log('reconnect fail: ' + re.message);
        await fb.setStatus({ connected: false, lastError: re.message });
      }
    }
  }, INTERVAL);

  fb.onCommands(async cmd => {
    log('cmd: ' + cmd.action);
    try {
      if (cmd.action === 'sync_now') await sync();
      await fb.updateCommand(cmd.id, 'completed', 'OK');
    } catch (e) { await fb.updateCommand(cmd.id, 'error', e.message); }
  });

  const stop = async () => {
    log('stopping...');
    try { await fb.setStatus({ connected: false }); } catch (_) {}
    try { await zk.disconnect(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log('running. Ctrl+C to stop.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
