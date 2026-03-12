/**
 * Auto-find CommKey for DG-600
 * Tries common CommKey values: 0, 1, 123, 1234, 12345, 123456, 888888, 999999, etc.
 *
 * Usage: node find-commkey.js
 *        node find-commkey.js 5000 6000    (try range 5000-6000)
 */
const net = require('net');

const IP   = '192.168.1.201';
const PORT = 4370;
const TIMEOUT = 5000;

const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const CMD_CONNECT    = 1000;
const CMD_AUTH       = 1102;  // NOT 28!
const CMD_EXIT       = 1001;
const CMD_ACK_OK     = 2000;
const CMD_ACK_UNAUTH = 2005;

function checksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length - 1; i += 2) sum += buf.readUInt16LE(i);
  if (buf.length % 2) sum += buf[buf.length - 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

/**
 * Hash CommKey with session ID (from commpro.c MakeKey)
 * Device expects scrambled key, NOT raw value.
 */
function makeCommKey(key, sessionId, ticks) {
  ticks = ticks || 50;
  key = Number(key);
  sessionId = Number(sessionId);

  // Bit-reverse the key
  let k = 0;
  for (let i = 0; i < 32; i++) {
    if (key & (1 << i)) {
      k = ((k << 1) | 1) >>> 0;
    } else {
      k = (k << 1) >>> 0;
    }
  }
  k = (k + sessionId) >>> 0;

  // Pack as uint32 LE
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(k, 0);

  // XOR with 'ZKSO'
  buf[0] ^= 0x5A; // 'Z'
  buf[1] ^= 0x4B; // 'K'
  buf[2] ^= 0x53; // 'S'
  buf[3] ^= 0x4F; // 'O'

  // Swap the two uint16 halves
  const h0 = buf.readUInt16LE(0);
  const h1 = buf.readUInt16LE(2);
  buf.writeUInt16LE(h1, 0);
  buf.writeUInt16LE(h0, 2);

  // XOR with ticks
  const B = ticks & 0xFF;
  return Buffer.from([buf[0] ^ B, buf[1] ^ B, B, buf[3] ^ B]);
}

function buildPacket(cmd, session, reply, data) {
  const d = data || Buffer.alloc(0);
  const payload = Buffer.alloc(8 + d.length);
  payload.writeUInt16LE(cmd, 0);
  payload.writeUInt16LE(session, 4);
  payload.writeUInt16LE(reply, 6);
  if (d.length) d.copy(payload, 8);
  payload.writeUInt16LE(checksum(payload), 2);

  const hdr = Buffer.alloc(8);
  TCP_MAGIC.copy(hdr);
  hdr.writeUInt32LE(payload.length, 4);
  return Buffer.concat([hdr, payload]);
}

function tcpSend(sock, pkt) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('timeout')); }, TIMEOUT);
    const off = () => { clearTimeout(timer); sock.removeListener('data', onD); };
    const onD = (chunk) => {
      if (chunk.length < 16) return;
      off();
      resolve({ cmd: chunk.readUInt16LE(8), session: chunk.readUInt16LE(12) });
    };
    sock.on('data', onD);
    sock.write(pkt);
  });
}

async function tryCommKey(key) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve(null); }, TIMEOUT);

    sock.once('error', () => { clearTimeout(timer); sock.destroy(); resolve(null); });
    sock.connect(PORT, IP, async () => {
      clearTimeout(timer);
      try {
        // Step 1: CMD_CONNECT
        const connectPkt = buildPacket(CMD_CONNECT, 0, 0, null);
        const res1 = await tcpSend(sock, connectPkt);

        if (res1.cmd === CMD_ACK_OK) {
          // No CommKey needed!
          sock.destroy();
          resolve({ key, status: 'NO_AUTH_NEEDED' });
          return;
        }

        if (res1.cmd !== CMD_ACK_UNAUTH) {
          sock.destroy();
          resolve(null);
          return;
        }

        // Step 2: CMD_AUTH with hashed CommKey
        const session = res1.session;
        const hashedKey = makeCommKey(key, session);
        const authPkt = buildPacket(CMD_AUTH, session, 1, hashedKey);
        const res2 = await tcpSend(sock, authPkt);

        // Disconnect
        try {
          const exitPkt = buildPacket(CMD_EXIT, session, 2, null);
          sock.write(exitPkt);
        } catch (_) {}

        setTimeout(() => sock.destroy(), 500);

        if (res2.cmd === CMD_ACK_OK) {
          resolve({ key, status: 'OK' });
        } else {
          resolve(null);
        }
      } catch (e) {
        sock.destroy();
        resolve(null);
      }
    });
  });
}

async function main() {
  console.log('========================================');
  console.log(' FIND COMMKEY - DG-600 (' + IP + ')');
  console.log('========================================\n');

  let keys;

  // Check if user wants to scan a range
  if (process.argv.length >= 4) {
    const from = parseInt(process.argv[2]) || 0;
    const to   = parseInt(process.argv[3]) || from + 1000;
    console.log('Scanning range: ' + from + ' -> ' + to + '\n');
    keys = [];
    for (let i = from; i <= to; i++) keys.push(i);
  } else {
    // Common CommKey values used by ZKTeco / Ronald Jack devices
    keys = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      12, 18, 28, 88, 99, 100,
      111, 123, 168, 222, 234, 321, 333, 456, 520, 666, 789, 888, 999,
      1111, 1234, 1357, 1688, 2345, 2468, 3456, 4321, 4567, 4370,
      5555, 5678, 6666, 6789, 7777, 7890, 8888, 9999,
      11111, 12345, 22222, 33333, 44444, 55555, 66666, 77777, 88888, 99999,
      111111, 123456, 181015, 234567, 345678, 456789, 654321, 666666, 777777, 888888, 999999,
      1234567, 12345678
    ];
    console.log('Trying ' + keys.length + ' common CommKey values...\n');
  }

  let found = null;
  let tested = 0;

  for (const key of keys) {
    tested++;
    const progress = '  [' + tested + '/' + keys.length + '] key=' + key;
    process.stdout.write(progress + '...');

    const result = await tryCommKey(key);
    if (result) {
      console.log(' >>> FOUND! <<<');
      found = result;
      break;
    } else {
      process.stdout.write(' fail\n');
    }

    // Small delay between attempts to not overwhelm the device
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n========================================');
  if (found) {
    console.log(' RESULT: CommKey = ' + found.key);
    if (found.status === 'NO_AUTH_NEEDED') {
      console.log(' (Device does not require CommKey authentication)');
    }
    console.log('\n Next steps:');
    console.log('   1. Edit index.js: set COMMKEY = ' + found.key);
    console.log('   2. Run: node test.js key ' + found.key);
    console.log('   3. Run: node index.js');
  } else {
    console.log(' CommKey NOT FOUND in tested values.');
    console.log('\n Try:');
    console.log('   1. node find-commkey.js 0 9999   (scan 0-9999)');
    console.log('   2. node find-commkey.js 10000 99999');
    console.log('   3. Check device: Menu > Comm > CommKey');
  }
  console.log('========================================');

  process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
