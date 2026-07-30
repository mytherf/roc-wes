/**
 * OPC UA 仿真服务端（软件模拟设备）
 *
 * 用于在没有真实 OPC UA 服务器的情况下验证「UI 配置 → 独立网关 → OPC UA 设备」全链路。
 * 基于 node-opcua（纯 JS）内置一个 OPC UA Server，暴露若干随时间变化的变量，
 * 网关用 OPC UA Client 读取后即可看到动态数据。
 *
 * 启动：npm run opc-simulator   （默认监听 opc.tcp://127.0.0.1:19504，可用环境变量 SIM_OPC_PORT / SIM_OPC_HOST 覆盖）
 *
 * 暴露的节点（NodeId，网关订阅时 pointId 即为其字符串形式）：
 * - ns=2;s=Ramp      斜坡（0~100 锯齿波，Double）
 * - ns=2;s=Sine      正弦（0~100，Double）
 * - ns=2;s=Triangle  三角波（100~900，Double）
 * - ns=2;s=Counter   计数器（每秒 +1，Int32）
 * - ns=2;s=Status    开关（每 3s 翻转，Boolean）
 *
 * 安全策略：None（仅用于本地仿真，匿名访问）。
 */
import { OPCUAServer, Variant, DataType } from 'node-opcua'

const PORT = Number(process.env.SIM_OPC_PORT || 19504)
const HOST = process.env.SIM_OPC_HOST || '127.0.0.1'

/** 由字符串生成 0~2π 相位偏移，使不同节点波形错开 */
function phase(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 628
  return h / 100
}

/** 斜坡：10s 周期 0~100 锯齿波 */
function ramp(t: number): number {
  return Math.round(((t / 100) % 100) * 10) / 10
}

/** 正弦：0~100 */
function sine(seed: string, t: number): number {
  return Math.round((50 + 50 * Math.sin(t / 1000 + phase(seed))) * 10) / 10
}

/** 三角波：12s 周期 100~900 */
function triangle(seed: string, t: number): number {
  const period = 12000
  const p = ((t + phase(seed) * 1000) % period) / period
  const tri = p < 0.5 ? p * 2 : 2 - p * 2
  return Math.round(100 + tri * 800)
}

async function main() {
  const server = new OPCUAServer({
    port: PORT,
    resourcePath: '/UA/Simulator',
    allowAnonymous: true,
    buildInfo: {
      productName: 'roc-wes OPC UA Simulator',
      buildNumber: '1.0.0',
      buildDate: new Date(),
    },
  })

  await server.initialize()

  const addressSpace = server.engine.addressSpace!
  // 注册自定义命名空间（首个自定义命名空间索引为 2，节点即 ns=2;s=XXX）
  const namespace = addressSpace.registerNamespace('urn:roc-wes:opc-simulator')
  const folder = namespace.addFolder(addressSpace.rootFolder.objects, { browseName: 'Simulator' })

  // 值随读取时刻实时计算（getter 模式，无需定时器）
  namespace.addVariable({
    componentOf: folder,
    browseName: 'Ramp',
    nodeId: 's=Ramp',
    dataType: 'Double',
    value: { get: () => new Variant({ dataType: DataType.Double, value: ramp(Date.now()) }) },
  })
  namespace.addVariable({
    componentOf: folder,
    browseName: 'Sine',
    nodeId: 's=Sine',
    dataType: 'Double',
    value: { get: () => new Variant({ dataType: DataType.Double, value: sine('Sine', Date.now()) }) },
  })
  namespace.addVariable({
    componentOf: folder,
    browseName: 'Triangle',
    nodeId: 's=Triangle',
    dataType: 'Double',
    value: { get: () => new Variant({ dataType: DataType.Double, value: triangle('Triangle', Date.now()) }) },
  })
  namespace.addVariable({
    componentOf: folder,
    browseName: 'Counter',
    nodeId: 's=Counter',
    dataType: 'Int32',
    value: { get: () => new Variant({ dataType: DataType.Int32, value: Math.floor(Date.now() / 1000) % 100000 }) },
  })
  namespace.addVariable({
    componentOf: folder,
    browseName: 'Status',
    nodeId: 's=Status',
    dataType: 'Boolean',
    value: { get: () => new Variant({ dataType: DataType.Boolean, value: Math.floor(Date.now() / 3000) % 2 === 0 }) },
  })

  await server.start()
  console.log(`[opc-simulator] OPC UA 仿真服务端已启动: opc.tcp://${HOST}:${PORT}/UA/Simulator`)
  console.log('[opc-simulator] 可用节点: ns=2;s=Ramp / Sine / Triangle / Counter / Status')
}

main().catch((err) => {
  console.error('[opc-simulator] 启动失败:', err)
  process.exit(1)
})
