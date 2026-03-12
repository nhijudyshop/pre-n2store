/**
 * Test connection to DG-600
 * Shows detailed output for debugging
 *
 * Usage: node test.js
 *        node test.js debug       (show raw hex bytes)
 *        node test.js key 1234    (try CommKey 1234)
 */
const ZK = require('./zk');

const IP   = '192.168.1.201';
const PORT = 4370;

async function main() {
  // Parse CommKey from args: node test.js key 1234
  let commkey = 0;
  const keyIdx = process.argv.indexOf('key');
  if (keyIdx !== -1 && process.argv[keyIdx + 1]) {
    commkey = parseInt(process.argv[keyIdx + 1]) || 0;
  }

  console.log('============================');
  console.log(' TEST: ' + IP + ':' + PORT);
  console.log(' CommKey: ' + commkey);
  console.log('============================\n');

  const zk = new ZK(IP, PORT, 10000, commkey);

  // Enable debug mode if requested
  if (process.argv.includes('debug')) {
    zk.debug = true;
    console.log('DEBUG MODE: showing raw hex\n');
  }

  // Connect (auto-detect TCP/UDP)
  try {
    await zk.connect();
    console.log('Protocol: ' + zk.proto.toUpperCase());
    console.log('Session:  ' + zk.session + '\n');
  } catch (e) {
    console.error('\n*** CONNECT FAILED ***');
    console.error(e.message);
    console.error('\nChecklist:');
    console.error('  1. ping ' + IP + '  (must reply)');
    console.error('  2. Windows Firewall: allow TCP+UDP port ' + PORT);
    console.error('  3. Close ZKTeco/Ronald Jack desktop software');
    console.error('  4. Device menu: Comm > CommKey = 0');
    console.error('  5. Restart the device (power off/on)');
    console.error('  6. Run: node test.js debug  (show raw bytes)');
    process.exit(1);
  }

  // Firmware version
  try {
    console.log('Firmware: ' + await zk.getVersion());
  } catch (e) {
    console.log('Firmware: N/A (' + e.message + ')');
  }

  // Users
  try {
    const users = await zk.getUsers();
    console.log('\nUsers: ' + users.length);
    users.forEach(u =>
      console.log('  [' + u.uid + '] ' + u.name + (u.role === 14 ? ' (admin)' : ''))
    );
  } catch (e) {
    console.log('\nUsers error: ' + e.message);
  }

  // Attendance records
  try {
    const records = await zk.getAttendances();
    console.log('\nAttendance: ' + records.length + ' records');
    if (records.length > 0) {
      console.log('Last 10:');
      records.slice(-10).forEach(r =>
        console.log('  User ' + r.deviceUserId.padStart(3) + '  ' + r.recordTime + '  state=' + r.type)
      );
    }
  } catch (e) {
    console.log('\nAttendance error: ' + e.message);
  }

  await zk.disconnect();
  console.log('\nDONE');
  process.exit(0);
}

main();
