/**
 * ZK Protocol - TCP + UDP auto-detect
 * No third-party library. Uses only Node.js net + dgram.
 */
const net = require('net');
const dgram = require('dgram');

const CMD_CONNECT     = 1000;
const CMD_EXIT        = 1001;
const CMD_AUTH        = 1102;  // NOT 28! 28 is CMD_TZ_WRQ
const CMD_GET_VERSION = 1100;
const CMD_GET_USERS   = 9;
const CMD_GET_ATTEND  = 13;
const CMD_ACK_OK      = 2000;
const CMD_ACK_ERROR   = 2001;
const CMD_ACK_DATA    = 2002;
const CMD_ACK_UNAUTH  = 2005;
const CMD_DATA        = 1501;
const CMD_PREPARE     = 1500;
const CMD_FREE_DATA   = 1502;
const CMD_DATA_WRRQ   = 1503;  // _CMD_PREPARE_BUFFER (buffered read request)
const CMD_DATA_RDY    = 1504;  // _CMD_READ_BUFFER (read chunk from buffer)

const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

/**
 * Hash CommKey with session ID before sending (from commpro.c MakeKey)
 * The device expects a scrambled key, NOT the raw commkey value.
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

function checksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length - 1; i += 2) sum += buf.readUInt16LE(i);
  if (buf.length % 2) sum += buf[buf.length - 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

function decodeTime(t) {
  const s = t % 60; t = (t - s) / 60;
  const m = t % 60; t = (t - m) / 60;
  const h = t % 24; t = (t - h) / 24;
  const d = (t % 31) + 1; t = (t - (d - 1)) / 31;
  const mo = t % 12; t = (t - mo) / 12;
  return new Date(t + 2000, mo, d, h, m, s);
}

function hex(buf) {
  return buf.toString('hex').match(/../g).join(' ');
}

class ZK {
  constructor(ip, port, timeout, commkey) {
    this.ip = ip;
    this.port = port || 4370;
    this.timeout = timeout || 10000;
    this.commkey = commkey || 0;
    this.proto = null; // 'tcp' or 'udp'
    this.tcp = null;
    this.udp = null;
    this.session = 0;
    this.reply = 0;
    this.debug = false;
  }

  // -- Packet building --

  _payload(cmd, data) {
    const d = data || Buffer.alloc(0);
    const buf = Buffer.alloc(8 + d.length);
    buf.writeUInt16LE(cmd, 0);
    buf.writeUInt16LE(this.session, 4);
    buf.writeUInt16LE(this.reply, 6);
    if (d.length) d.copy(buf, 8);
    buf.writeUInt16LE(checksum(buf), 2);
    this.reply = (this.reply + 1) & 0xffff;
    return buf;
  }

  _tcpPacket(cmd, data) {
    const payload = this._payload(cmd, data);
    const hdr = Buffer.alloc(8);
    TCP_MAGIC.copy(hdr);
    hdr.writeUInt32LE(payload.length, 4);
    return Buffer.concat([hdr, payload]);
  }

  _udpPacket(cmd, data) {
    return this._payload(cmd, data);
  }

  // -- TCP methods --

  _tcpSend(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._tcpPacket(cmd, data);
      if (this.debug) console.log('  >> TCP send: ' + hex(pkt));
      let buf = Buffer.alloc(0);

      const timer = setTimeout(() => { off(); reject(new Error('TCP response timeout')); }, this.timeout);
      const off = () => { clearTimeout(timer); this.tcp.removeListener('data', onD); };
      const onD = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length < 8) return;
        const pLen = buf.readUInt32LE(4);
        if (buf.length < 8 + pLen) return;
        off();
        if (this.debug) console.log('  << TCP recv: ' + hex(buf.slice(0, 8 + pLen)));
        resolve({ cmd: buf.readUInt16LE(8), session: buf.readUInt16LE(12), data: buf.slice(16, 8 + pLen) });
      };
      this.tcp.on('data', onD);
      this.tcp.write(pkt);
    });
  }

  _tcpReadAll(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._tcpPacket(cmd, data);
      if (this.debug) console.log('  >> TCP send: ' + hex(pkt));
      let buf = Buffer.alloc(0);
      let idle = null;

      const fail = setTimeout(() => { off(); resolve(this._extract(buf)); }, this.timeout * 3);
      const off = () => { clearTimeout(fail); if (idle) clearTimeout(idle); this.tcp.removeAllListeners('data'); };
      const onD = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (idle) clearTimeout(idle);

        // Fast path: single-packet response
        if (buf.length >= 16) {
          const pLen = buf.readUInt32LE(4);
          if (buf.length >= 8 + pLen) {
            const rc = buf.readUInt16LE(8);
            if (rc === CMD_ACK_OK || rc === CMD_ACK_DATA || rc === CMD_ACK_ERROR || rc === CMD_ACK_UNAUTH || rc === CMD_DATA) {
              off();
              if (this.debug) console.log('  << TCP recv (' + buf.length + ' bytes, cmd=' + rc + ')');
              resolve(this._extract(buf));
              return;
            }
            // Large data: check for trailing ACK
            if (buf.length > 8 + pLen + 16) {
              const t = buf.length - 16;
              if (buf[t]===0x50 && buf[t+1]===0x50 && buf[t+2]===0x82 && buf[t+3]===0x7d && buf.readUInt16LE(t+8)===CMD_ACK_OK) {
                off();
                if (this.debug) console.log('  << TCP recv (' + buf.length + ' bytes, large data)');
                resolve(this._extract(buf));
                return;
              }
            }
          }
        }
        idle = setTimeout(() => { off(); resolve(this._extract(buf)); }, 3000);
      };
      this.tcp.on('data', onD);
      this.tcp.write(pkt);
    });
  }

  // -- UDP methods --

  _udpSend(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._udpPacket(cmd, data);
      if (this.debug) console.log('  >> UDP send: ' + hex(pkt));

      const timer = setTimeout(() => { off(); reject(new Error('UDP response timeout')); }, this.timeout);
      const off = () => { clearTimeout(timer); this.udp.removeListener('message', onM); };
      const onM = (msg) => {
        off();
        if (this.debug) console.log('  << UDP recv: ' + hex(msg));
        resolve({ cmd: msg.readUInt16LE(0), session: msg.readUInt16LE(4), data: msg.slice(8) });
      };
      this.udp.on('message', onM);
      this.udp.send(pkt, 0, pkt.length, this.port, this.ip);
    });
  }

  _udpReadAll(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._udpPacket(cmd, data);
      if (this.debug) console.log('  >> UDP send: ' + hex(pkt));
      let chunks = [];
      let idle = null;

      const fail = setTimeout(() => { off(); resolve(this._combineUdp(chunks)); }, this.timeout * 3);
      const off = () => { clearTimeout(fail); if (idle) clearTimeout(idle); this.udp.removeAllListeners('message'); };
      const onM = (msg) => {
        chunks.push(msg);
        if (idle) clearTimeout(idle);
        // Check for ACK_OK (end of data)
        if (msg.length >= 8 && msg.readUInt16LE(0) === CMD_ACK_OK) {
          off();
          resolve(this._combineUdp(chunks));
          return;
        }
        idle = setTimeout(() => { off(); resolve(this._combineUdp(chunks)); }, 3000);
      };
      this.udp.on('message', onM);
      this.udp.send(pkt, 0, pkt.length, this.port, this.ip);
    });
  }

  // -- Extract data from TCP buffer --
  // Handles multi-packet buffers: PREPARE + DATA + ACK, or ACK_DATA (small data)
  // Strips ALL TCP framing headers [50 50 82 7d][len][cmd][chk][ses][rep]

  _extract(buf) {
    if (buf.length < 16) return Buffer.alloc(0);

    if (this.debug) console.log('  [_extract] total buffer: ' + buf.length + ' bytes');

    // Parse ALL TCP packets in the buffer
    const packets = [];
    let pos = 0;
    while (pos + 16 <= buf.length) {
      // Look for TCP magic
      if (buf[pos] === 0x50 && buf[pos+1] === 0x50 && buf[pos+2] === 0x82 && buf[pos+3] === 0x7d) {
        const pLen = buf.readUInt32LE(pos + 4);
        const cmd = buf.readUInt16LE(pos + 8);
        const dataStart = pos + 16; // after TCP(8) + payload header(8)
        const dataEnd = pos + 8 + pLen;
        packets.push({ cmd, pos, dataStart, dataEnd, pLen });
        if (this.debug) console.log('  [_extract] packet at ' + pos + ': cmd=' + cmd + ' pLen=' + pLen);
        pos = dataEnd > pos + 16 ? dataEnd : pos + 16;
      } else {
        pos++;
      }
    }

    if (packets.length === 0) return Buffer.alloc(0);

    // Case 1: Single CMD_ACK_DATA packet (small data)
    if (packets.length === 1 && packets[0].cmd === CMD_ACK_DATA) {
      return buf.slice(packets[0].dataStart, packets[0].dataEnd);
    }

    // Case 2: Single CMD_ACK_OK (no data)
    if (packets.length === 1 && packets[0].cmd === CMD_ACK_OK) {
      return Buffer.alloc(0);
    }

    // Case 3: Multi-packet (PREPARE/DATA + possibly more DATA + ACK_OK)
    // Collect raw data between/after framed packets, excluding PREPARE headers and ACK_OK
    const dataParts = [];
    for (let i = 0; i < packets.length; i++) {
      const pkt = packets[i];

      if (pkt.cmd === CMD_ACK_OK || pkt.cmd === CMD_ACK_ERROR || pkt.cmd === CMD_ACK_UNAUTH) {
        continue; // skip control packets
      }

      if (pkt.cmd === CMD_PREPARE) {
        // PREPARE has 4-byte size in its data, skip it
        // Raw data follows after this packet
        const rawStart = pkt.dataEnd;
        const rawEnd = (i + 1 < packets.length) ? packets[i + 1].pos : buf.length;
        if (rawEnd > rawStart) {
          dataParts.push(buf.slice(rawStart, rawEnd));
        }
      } else if (pkt.cmd === CMD_DATA) {
        // DATA packet: skip 4-byte size header in data, rest is raw records
        const skip = pkt.dataEnd - pkt.dataStart > 4 ? 4 : 0;
        const rawStart = pkt.dataStart + skip;
        const rawEnd = (i + 1 < packets.length) ? packets[i + 1].pos : buf.length;
        if (rawEnd > rawStart) {
          dataParts.push(buf.slice(rawStart, rawEnd));
        }
      } else if (pkt.cmd === CMD_ACK_DATA) {
        // Small data packet
        if (pkt.dataEnd > pkt.dataStart) {
          dataParts.push(buf.slice(pkt.dataStart, pkt.dataEnd));
        }
      }
    }

    if (dataParts.length === 0) return Buffer.alloc(0);
    const result = Buffer.concat(dataParts);
    if (this.debug) console.log('  [_extract] extracted: ' + result.length + ' bytes from ' + dataParts.length + ' parts');
    return result;
  }

  // -- Combine UDP datagrams --

  _combineUdp(chunks) {
    if (!chunks.length) return Buffer.alloc(0);

    const first = chunks[0];
    const cmd = first.readUInt16LE(0);

    // Small data in first packet
    if (cmd === CMD_ACK_OK && first.length <= 8) return Buffer.alloc(0);
    if (cmd === CMD_ACK_ERROR || cmd === CMD_ACK_UNAUTH) return Buffer.alloc(0);
    if (cmd === CMD_ACK_DATA) return first.slice(8);

    // Large data: first packet has size, rest are raw data, last is ACK_OK
    if (cmd === CMD_DATA || cmd === CMD_PREPARE) {
      const parts = [];
      for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        if (c.length >= 8 && c.readUInt16LE(0) === CMD_ACK_OK) break;
        parts.push(c);
      }
      return Buffer.concat(parts);
    }

    // Fallback: return data from first packet
    return first.length > 8 ? first.slice(8) : Buffer.alloc(0);
  }

  // -- Protocol-agnostic send --

  _cmd(cmd, data) {
    return this.proto === 'tcp' ? this._tcpSend(cmd, data) : this._udpSend(cmd, data);
  }

  _cmdData(cmd, data) {
    return this.proto === 'tcp' ? this._tcpReadAll(cmd, data) : this._udpReadAll(cmd, data);
  }

  // ====== PUBLIC API ======

  async connect() {
    this.session = 0;
    this.reply = 0;
    const errors = [];

    // Try TCP
    try {
      console.log('[zk] trying TCP ' + this.ip + ':' + this.port + '...');
      await this._tryTCP();
      this.proto = 'tcp';
      console.log('[zk] TCP connected! session=' + this.session);
      return;
    } catch (e) {
      errors.push('TCP: ' + e.message);
      console.log('[zk] TCP failed: ' + e.message);
    }

    // Try UDP
    this.session = 0;
    this.reply = 0;
    try {
      console.log('[zk] trying UDP ' + this.ip + ':' + this.port + '...');
      await this._tryUDP();
      this.proto = 'udp';
      console.log('[zk] UDP connected! session=' + this.session);
      return;
    } catch (e) {
      errors.push('UDP: ' + e.message);
      console.log('[zk] UDP failed: ' + e.message);
    }

    throw new Error('Cannot connect.\n  ' + errors.join('\n  '));
  }

  // Authenticate with CommKey after CMD_CONNECT returns UNAUTH
  async _auth(sendFn) {
    const keyBuf = makeCommKey(this.commkey, this.session);
    if (this.debug) console.log('  >> AUTH commkey=' + this.commkey + ' session=' + this.session + ' hashed=' + hex(keyBuf));
    const res = await sendFn(CMD_AUTH, keyBuf);
    if (this.debug) console.log('  << AUTH response cmd=' + res.cmd);
    if (res.cmd === CMD_ACK_OK) return true;
    return false;
  }

  async _tryTCP() {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      const timer = setTimeout(() => { sock.destroy(); reject(new Error('TCP connect timeout')); }, this.timeout);

      sock.once('error', (e) => { clearTimeout(timer); reject(new Error('TCP: ' + e.message)); });
      sock.connect(this.port, this.ip, async () => {
        clearTimeout(timer);
        this.tcp = sock;
        try {
          const res = await this._tcpSend(CMD_CONNECT);
          if (res.cmd === CMD_ACK_OK) {
            this.session = res.session;
            resolve();
          } else if (res.cmd === CMD_ACK_UNAUTH) {
            // Device requires CommKey authentication
            this.session = res.session;
            console.log('[zk] TCP: device requires auth (session=' + this.session + ')');
            const ok = await this._auth(this._tcpSend.bind(this));
            if (ok) {
              resolve();
            } else {
              sock.destroy(); this.tcp = null;
              reject(new Error('AUTH failed (wrong CommKey? current=' + this.commkey + ')'));
            }
          } else {
            reject(new Error('Rejected cmd=' + res.cmd));
          }
        } catch (e) {
          sock.destroy();
          this.tcp = null;
          reject(e);
        }
      });
    });
  }

  async _tryUDP() {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      const timer = setTimeout(() => { sock.close(); reject(new Error('UDP connect timeout')); }, this.timeout);

      sock.once('error', (e) => { clearTimeout(timer); sock.close(); reject(new Error('UDP: ' + e.message)); });

      sock.bind(0, () => {
        this.udp = sock;
        this._udpSend(CMD_CONNECT)
          .then(async res => {
            clearTimeout(timer);
            if (res.cmd === CMD_ACK_OK) {
              this.session = res.session;
              resolve();
            } else if (res.cmd === CMD_ACK_UNAUTH) {
              // Device requires CommKey authentication
              this.session = res.session;
              console.log('[zk] UDP: device requires auth (session=' + this.session + ')');
              try {
                const ok = await this._auth(this._udpSend.bind(this));
                if (ok) {
                  resolve();
                } else {
                  sock.close(); this.udp = null;
                  reject(new Error('AUTH failed (wrong CommKey? current=' + this.commkey + ')'));
                }
              } catch (e) {
                sock.close(); this.udp = null;
                reject(e);
              }
            } else {
              reject(new Error('Rejected cmd=' + res.cmd));
            }
          })
          .catch(e => { clearTimeout(timer); sock.close(); this.udp = null; reject(e); });
      });
    });
  }

  async disconnect() {
    try { await this._cmd(CMD_EXIT); } catch (_) {}
    if (this.tcp) { this.tcp.destroy(); this.tcp = null; }
    if (this.udp) { try { this.udp.close(); } catch(_) {} this.udp = null; }
    this.proto = null;
  }

  /**
   * Buffered read: wraps inner command in CMD 1503 (like pyzk read_with_buffer).
   * Modern ZK devices (ZK6/ZK8, including DG-600) require this instead of direct CMD.
   * Payload format: pack('<bhii', 1, innerCmd, fct, ext) = 11 bytes
   */
  async readWithBuffer(innerCmd, fct = 0, ext = 0) {
    const payload = Buffer.alloc(11);
    payload.writeInt8(1, 0);
    payload.writeInt16LE(innerCmd, 1);
    payload.writeInt32LE(fct, 3);
    payload.writeInt32LE(ext, 7);

    if (this.debug) console.log('  [readWithBuffer] cmd=' + innerCmd + ' fct=' + fct + ' payload=' + hex(payload));

    // Send CMD 1503 and read initial response
    const res = await this._cmd(CMD_DATA_WRRQ, payload);

    if (this.debug) console.log('  [readWithBuffer] response: cmd=' + res.cmd + ' dataLen=' + (res.data ? res.data.length : 0) + (res.data && res.data.length > 0 ? ' hex=' + hex(res.data.slice(0, Math.min(20, res.data.length))) : ''));

    // Small data: CMD_DATA (1501) or CMD_ACK_DATA (2002) - data inline
    if (res.cmd === CMD_DATA || res.cmd === CMD_ACK_DATA) {
      if (this.debug) console.log('  [readWithBuffer] small data path: ' + (res.data ? res.data.length : 0) + ' bytes');
      return res.data || Buffer.alloc(0);
    }

    // Large data: CMD_ACK_OK with size info → chunked read via CMD 1504
    if (res.cmd === CMD_ACK_OK && res.data && res.data.length >= 4) {
      // Parse total data size from response
      // Format: [1-byte flag?] [uint32 LE size] or just [uint32 LE size]
      let totalSize;
      if (res.data.length >= 9) {
        // pyzk: struct '<I5x' -> first 4 bytes are size, rest is padding
        totalSize = res.data.readUInt32LE(1);
        if (totalSize === 0 || totalSize > 10 * 1024 * 1024) {
          totalSize = res.data.readUInt32LE(0);
        }
      } else {
        totalSize = res.data.readUInt32LE(0);
      }

      if (totalSize === 0 || totalSize > 10 * 1024 * 1024) {
        if (this.debug) console.log('  [readWithBuffer] invalid totalSize=' + totalSize);
        return Buffer.alloc(0);
      }

      if (this.debug) console.log('  [readWithBuffer] large data: totalSize=' + totalSize);

      // Read chunks via CMD 1504
      const MAX_CHUNK = 16384;
      const chunks = [];
      let offset = 0;

      while (offset < totalSize) {
        const reqSize = Math.min(MAX_CHUNK, totalSize - offset);
        const chunkReq = Buffer.alloc(8);
        chunkReq.writeInt32LE(offset, 0);
        chunkReq.writeInt32LE(reqSize, 4);

        const chunkData = await this._cmdData(CMD_DATA_RDY, chunkReq);
        if (!chunkData || !chunkData.length) break;
        chunks.push(chunkData);
        offset += chunkData.length;

        if (this.debug) console.log('  [readWithBuffer] chunk: got=' + chunkData.length + ' progress=' + offset + '/' + totalSize);
      }

      // Free device buffer
      try { await this._cmd(CMD_FREE_DATA); } catch (_) {}

      return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
    }

    // CMD_ACK_OK with no data (empty result)
    if (res.cmd === CMD_ACK_OK) return Buffer.alloc(0);

    // Error
    if (this.debug) console.log('  [readWithBuffer] unexpected response: cmd=' + res.cmd);
    return Buffer.alloc(0);
  }

  async getVersion() {
    const res = await this._cmd(CMD_GET_VERSION);
    return res.data ? res.data.toString('ascii').replace(/\0+$/, '') : '';
  }

  async getUsers() {
    // Try CMD 1503 buffered read (modern ZK devices), fallback to direct CMD 9
    let raw;
    try {
      raw = await this.readWithBuffer(CMD_GET_USERS, 5); // FCT_USER = 5
      if (this.debug) console.log('  [getUsers] readWithBuffer: ' + (raw ? raw.length : 0) + ' bytes');
    } catch (e) {
      if (this.debug) console.log('  [getUsers] readWithBuffer failed: ' + e.message);
    }
    if (!raw || !raw.length) {
      try {
        raw = await this._cmdData(CMD_GET_USERS);
        if (this.debug) console.log('  [getUsers] direct CMD: ' + (raw ? raw.length : 0) + ' bytes');
      } catch (e) {
        if (this.debug) console.log('  [getUsers] direct CMD failed: ' + e.message);
      }
    }
    if (!raw || !raw.length) return [];

    if (this.debug) {
      console.log('  [getUsers] raw=' + raw.length + ' bytes');
      console.log('  [getUsers] first 80 hex: ' + hex(raw.slice(0, Math.min(80, raw.length))));
    }

    // Try parsing with different offsets (with/without 4-byte size header)
    // and different record sizes (72, 28). Pick whichever produces valid results.
    const attempts = [];
    for (const skip of [0, 4]) {
      for (const sz of [72, 28]) {
        if (raw.length <= skip) continue;
        const data = raw.slice(skip);
        if (data.length < sz) continue;
        const users = this._parseUsers(data, sz);
        if (users.length > 0) {
          // Score: prefer results where UIDs are small numbers and names are readable
          const avgUid = users.reduce((s, u) => s + u.uid, 0) / users.length;
          const hasNames = users.filter(u => u.name && u.name.length > 1 && !/^User /.test(u.name)).length;
          const score = (avgUid < 1000 ? 100 : 0) + hasNames * 10 + users.length;
          attempts.push({ skip, sz, users, score });
          if (this.debug) console.log('  [getUsers] skip=' + skip + ' sz=' + sz + ' users=' + users.length + ' avgUid=' + Math.round(avgUid) + ' names=' + hasNames + ' score=' + score);
        }
      }
    }

    // Pick the best attempt
    attempts.sort((a, b) => b.score - a.score);
    const best = attempts[0];
    if (!best) return [];

    if (this.debug) {
      console.log('  [getUsers] BEST: skip=' + best.skip + ' sz=' + best.sz);
      best.users.forEach(u => console.log('  [user] uid=' + u.uid + ' name="' + u.name + '" role=' + u.role));
    }

    return best.users;
  }

  _parseUsers(data, sz) {
    const users = [];
    for (let i = 0; i + sz <= data.length; i += sz) {
      try {
        if (sz === 72) {
          const uid = data.readUInt16LE(i);
          const role = data[i + 2];
          const name = data.slice(i + 11, i + 35).toString('ascii').split('\0').shift().trim();
          const cardno = data.readUInt32LE(i + 35);
          const userId = data.slice(i + 48, i + 57).toString('ascii').split('\0').shift().trim();
          users.push({ uid, role, name: name || ('User ' + uid), cardno, userId: userId || String(uid) });
        } else {
          const uid = data.readUInt16LE(i);
          const role = data[i + 2];
          const name = data.slice(i + 8, i + 16).toString('ascii').split('\0').shift().trim();
          const cardno = data.readUInt32LE(i + 16);
          users.push({ uid, role, name: name || ('User ' + uid), cardno });
        }
      } catch (_) { break; }
    }
    return users;
  }

  async getAttendances() {
    // Try CMD 1503 buffered read (modern ZK devices), fallback to direct CMD 13
    let raw;
    try {
      raw = await this.readWithBuffer(CMD_GET_ATTEND); // fct=0, ext=0
      if (this.debug) console.log('  [getAttendances] readWithBuffer: ' + (raw ? raw.length : 0) + ' bytes');
    } catch (e) {
      if (this.debug) console.log('  [getAttendances] readWithBuffer failed: ' + e.message);
    }
    if (!raw || !raw.length) {
      try {
        raw = await this._cmdData(CMD_GET_ATTEND);
        if (this.debug) console.log('  [getAttendances] direct CMD: ' + (raw ? raw.length : 0) + ' bytes');
      } catch (e) {
        if (this.debug) console.log('  [getAttendances] direct CMD failed: ' + e.message);
      }
    }
    if (!raw || !raw.length) return [];

    if (this.debug) {
      console.log('  [getAttendances] raw=' + raw.length + ' bytes');
      console.log('  [getAttendances] first 80 hex: ' + hex(raw.slice(0, Math.min(80, raw.length))));
    }

    // Auto-detect format: try skip (with/without 4-byte size header),
    // record size (40 or 16), and timestamp offset variants
    // DG-600 uses 40-byte with status@26 BEFORE timestamp@27 (differs from pyzk standard ts@26)
    const now = Date.now();
    const attempts = [];
    for (const skip of [0, 4]) {
      if (raw.length <= skip) continue;
      const data = raw.slice(skip);

      for (const fmt of [
        { sz: 40, tsOff: 27 },  // DG-600: status@26, timestamp@27, punch@31
        { sz: 40, tsOff: 26 },  // pyzk standard: timestamp@26, status@30, punch@31
        { sz: 16, tsOff: 4 },   // compact: uid(u32)@0, timestamp@4, punch@9
      ]) {
        if (data.length < fmt.sz) continue;
        const records = this._parseAttendances(data, fmt.sz, fmt.tsOff);
        if (records.length > 0) {
          const validTimes = records.filter(r => {
            const t = new Date(r.recordTime).getTime();
            return t > 1577836800000 && t < now + 86400000; // 2020-01-01 to tomorrow
          }).length;
          const avgUid = records.reduce((s, r) => s + Number(r.deviceUserId), 0) / records.length;
          const validUids = records.filter(r => Number(r.deviceUserId) > 0).length;
          const score = validTimes * 20 + validUids * 5 + (avgUid < 1000 && avgUid > 0 ? 50 : 0) + records.length + (skip === 4 ? 5 : 0);
          attempts.push({ skip, sz: fmt.sz, tsOff: fmt.tsOff, records, score });
          if (this.debug) console.log('  [getAttendances] skip=' + skip + ' sz=' + fmt.sz + ' tsOff=' + fmt.tsOff + ' records=' + records.length + ' validTimes=' + validTimes + ' validUids=' + validUids + ' score=' + score);
        }
      }
    }

    attempts.sort((a, b) => b.score - a.score);
    const best = attempts[0];
    if (!best) return [];

    if (this.debug) {
      console.log('  [getAttendances] BEST: skip=' + best.skip + ' sz=' + best.sz + ' tsOff=' + best.tsOff + ' records=' + best.records.length);
      best.records.slice(-5).forEach(r => console.log('  [att] uid=' + r.deviceUserId + ' time=' + r.recordTime));
    }

    return best.records;
  }

  _parseAttendances(data, sz, tsOffset) {
    const records = [];
    for (let i = 0; i + sz <= data.length; i += sz) {
      try {
        let uid, state, time;
        if (sz === 40) {
          // For uid: prefer user_id string at offset 2 (24 bytes), fallback to uint16 at offset 0
          const userIdStr = data.slice(i + 2, i + 26).toString('ascii').split('\0').shift().trim();
          uid = parseInt(userIdStr);
          if (isNaN(uid) || uid <= 0) uid = data.readUInt16LE(i);
          time = decodeTime(data.readUInt32LE(i + tsOffset));
          state = data[i + 31]; // punch always at offset 31
        } else {
          // 16-byte: uid(u32)@0, timestamp@4, status@8, punch@9
          uid = data.readUInt16LE(i);
          time = decodeTime(data.readUInt32LE(i + tsOffset));
          state = data[i + 9];
        }
        records.push({ deviceUserId: String(uid), recordTime: time.toISOString(), type: state });
      } catch (_) { break; }
    }
    return records;
  }
}

module.exports = ZK;
