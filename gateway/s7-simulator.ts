/**
 * 西门子 S7 仿真服务端（软件模拟 PLC，纯 JS 实现 S7comm 协议）
 *
 * 用于在没有真实西门子 PLC 的情况下验证「UI 配置 → 独立网关(nodes7) → S7 设备」全链路。
 * 本服务直接用 node:net 实现 S7comm（ISO-on-TCP / TPKT / COTP / S7 PDU）的最小只读服务端，
 * 足以应答 nodes7 客户端的连接握手与读变量请求；寄存器值随时间变化（三角波扫描）。
 *
 * 启动：npm run s7-simulator   （默认监听 127.0.0.1:19503，可用环境变量 SIM_S7_PORT / SIM_S7_HOST 覆盖）
 *
 * 支持的 S7 报文：
 * - COTP 连接请求(CR/0xE0) → 连接确认(CC/0xD0)
 * - S7 Setup Communication(0xF0) → Setup 应答（协商 PDU=960）
 * - S7 Read Var(0x04) → 按请求长度返回模拟值（1 字节/2 字节 INT/4 字节 REAL）
 *
 * 取值约定：网关 pointId 即 nodes7 地址（如 DB1,REAL0,1 / DB1,INT0,1 / M0,1），
 * 仿真按「区域+DB号+字节偏移」为种子生成 100~900 的三角波，并按请求字节数编码：
 *   1 字节 → BYTE；2 字节 → INT16；4 字节 → IEEE-754 REAL。
 */
import net from 'node:net'

const PORT = Number(process.env.SIM_S7_PORT || 19503)
const HOST = process.env.SIM_S7_HOST || '127.0.0.1'

/** 由种子生成 0~2π 相位偏移，使不同地址波形错开 */
function phase(seed: number): number {
  return ((seed * 37) % 628) / 100
}

/** 三角波：12s 周期在 100~900 之间线性往返 */
function triangle(seed: number, t: number): number {
  const period = 12000
  const p = ((t + phase(seed) * 1000) % period) / period
  const tri = p < 0.5 ? p * 2 : 2 - p * 2
  return 100 + tri * 800
}

/** 按请求字节数把三角波值编码为大端字节 */
function encodeValue(seed: number, byteLen: number, t: number): Buffer {
  const v = triangle(seed, t)
  const buf = Buffer.alloc(byteLen)
  if (byteLen === 1) {
    buf.writeUInt8(Math.round(v) & 0xff, 0)
  } else if (byteLen === 2) {
    buf.writeInt16BE(Math.round(v), 0)
  } else if (byteLen === 4) {
    buf.writeFloatBE(v, 0)
  } else {
    // 其它长度：用整数值字节循环填充
    const iv = Math.round(v) & 0xff
    for (let i = 0; i < byteLen; i++) buf.writeUInt8(iv, i)
  }
  return buf
}

/** 处理一个 S7 Read Var 请求，返回完整响应报文 */
function buildReadResponse(req: Buffer): Buffer {
  const pduRef = req.readUInt16BE(11)
  const itemCount = req.readUInt8(18)
  const t = Date.now()

  const dataChunks: Buffer[] = []
  for (let i = 0; i < itemCount; i++) {
    const off = 19 + i * 12
    const byteLen = req.readUInt16BE(off + 4)
    const dbNumber = req.readUInt16BE(off + 6)
    const addr32 = req.readUInt32BE(off + 8)
    const area = addr32 >>> 24
    const byteOffset = (addr32 & 0x00ffffff) >>> 3

    // 种子：区域 + DB + 偏移，保证不同点波形各异
    const seed = area * 100000 + dbNumber * 1000 + byteOffset
    const value = encodeValue(seed, byteLen, t)

    const lenBits = byteLen * 8
    const item = Buffer.alloc(4 + byteLen + (byteLen % 2 ? 1 : 0))
    item.writeUInt8(0xff, 0) // 返回码：成功
    item.writeUInt8(0x04, 1) // 传输尺寸：字节型（长度按比特计）
    item.writeUInt16BE(lenBits, 2)
    value.copy(item, 4)
    // 奇数字节时末尾填充 0（item 已 alloc 为偶数长度，默认即为 0）
    dataChunks.push(item)
  }

  const dataSection = Buffer.concat(dataChunks)
  const paramLen = 2
  const tpktLen = 21 + dataSection.length

  const resp = Buffer.alloc(tpktLen)
  // TPKT
  resp.writeUInt8(0x03, 0)
  resp.writeUInt16BE(tpktLen, 2)
  // COTP DT
  resp.writeUInt8(0x02, 4)
  resp.writeUInt8(0xf0, 5)
  resp.writeUInt8(0x80, 6)
  // S7 header（ack-data，12 字节）
  resp.writeUInt8(0x32, 7)
  resp.writeUInt8(0x03, 8) // ROSCTR = ack-data
  resp.writeUInt16BE(0, 9) // 冗余标识
  resp.writeUInt16BE(pduRef, 11) // 回显 PDU 引用（序列号，供客户端匹配）
  resp.writeUInt16BE(paramLen, 13)
  resp.writeUInt16BE(dataSection.length, 15)
  resp.writeUInt8(0, 17) // 错误类
  resp.writeUInt8(0, 18) // 错误码
  // S7 parameter
  resp.writeUInt8(0x04, 19) // 功能：读变量
  resp.writeUInt8(itemCount, 20)
  // S7 data
  dataSection.copy(resp, 21)
  return resp
}

/** S7 Setup Communication 应答 */
function buildSetupResponse(req: Buffer): Buffer {
  const pduRef = req.readUInt16BE(11)
  const resp = Buffer.from([
    0x03, 0x00, 0x00, 0x1b, // TPKT，长度 27
    0x02, 0xf0, 0x80, // COTP DT
    0x32, 0x03, 0x00, 0x00, 0x00, 0x00, // S7 header 前段（pduRef 随后写入）
    0x00, 0x08, // 参数长度 = 8
    0x00, 0x00, // 数据长度 = 0
    0x00, 0x00, // 错误类/码
    0xf0, 0x00, // 功能：Setup + 保留
    0x00, 0x08, // 最大 AMQ（主叫）= 8
    0x00, 0x08, // 最大 AMQ（被叫）= 8
    0x03, 0xc0, // PDU 长度 = 960
  ])
  resp.writeUInt16BE(pduRef, 11)
  return resp
}

/** COTP 连接确认（CC） */
const CONN_CONFIRM = Buffer.from([
  0x03, 0x00, 0x00, 0x16, // TPKT，长度 22
  0x11, 0xd0, 0x00, 0x02, 0x00, 0x02, 0x00, // COTP CC（dst-ref=客户端 src-ref）
  0xc0, 0x01, 0x0a, // TPDU 尺寸
  0xc1, 0x02, 0x01, 0x00, // 源 TSAP
  0xc2, 0x02, 0x01, 0x02, // 目的 TSAP
])

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0)
  console.log(`[s7-simulator] 客户端已连接: ${socket.remoteAddress}`)

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    // TPKT 分帧：循环取出完整报文
    while (buffer.length >= 4) {
      const tpktLen = buffer.readUInt16BE(2)
      if (tpktLen < 4 || buffer.length < tpktLen) break
      const packet = buffer.subarray(0, tpktLen)
      buffer = buffer.subarray(tpktLen)
      handlePacket(socket, packet)
    }
  })

  socket.on('error', (err) => {
    console.error('[s7-simulator] 连接错误:', err.message)
  })
  socket.on('close', () => {
    console.log('[s7-simulator] 客户端断开')
  })
})

function handlePacket(socket: net.Socket, packet: Buffer) {
  const cotpType = packet.readUInt8(5)
  if (cotpType === 0xe0) {
    // COTP 连接请求 → 连接确认
    socket.write(CONN_CONFIRM)
    return
  }
  if (cotpType === 0xf0 && packet.length > 17 && packet.readUInt8(7) === 0x32) {
    const func = packet.readUInt8(17)
    if (func === 0xf0) {
      socket.write(buildSetupResponse(packet))
    } else if (func === 0x04) {
      socket.write(buildReadResponse(packet))
    }
    // 其它功能（如写 0x05）本仿真暂不处理
  }
}

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[s7-simulator] 端口 ${PORT} 已被占用，请更换 SIM_S7_PORT`)
  } else {
    console.error('[s7-simulator] 服务错误:', err.message)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[s7-simulator] S7 仿真服务端已启动: ${HOST}:${PORT} (rack=0 slot=1/2)`)
  console.log('[s7-simulator] 示例点：DB1,REAL0,1 / DB1,INT0,1 / DB1,WORD2,1 / M0,1')
})
