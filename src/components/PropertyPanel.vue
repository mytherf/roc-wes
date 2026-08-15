<!-- ══════════════════════════════════════════════════════════════════════
     PropertyPanel.vue - 属性面板（选中元素的“设置窗口”）

     点击画布上的元素后，这里会展示它的全部可编辑属性：
       1. 画布属性：点击画布空白处 → 背景色 / 网格显隐 / 网格大小与类型
       2. 节点属性：选中节点 → 四个标签页——
          - 基础：ID、名称、类型、标签、图标（预设/上传/尺寸）、货架维度（排/列/层）、位置与尺寸
          - 绑定：把节点绑定到数据源点位，实现实时数据驱动
          - 路线：选择路线、设置速度、启动/停止路线运动
          - 事件：配置条件触发规则（如“温度超限变红”）
       3. 连线属性：标签编辑

     双写模式：所有修改同时写入「X6 节点 data」和「Pinia Store」，
     保证画布实时刷新且工程保存不丢失。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div
    class="property-panel"
    :class="{ collapsed: editorStore.propertyCollapsed, resizing: panelResizing }"
    :style="panelStyle"
  >
    <!-- 宽度拖动手柄（仅展开态）：按住左右拖动调整面板宽度 -->
    <div
      v-if="!editorStore.propertyCollapsed"
      class="panel-resize-handle"
      title="拖动调整面板宽度"
      @mousedown.prevent="startPanelResize"
    ></div>
    <!-- 滚动内层：面板内容在此滚动，拖动手柄用 absolute 定位不受滚动影响 -->
    <div class="panel-scroll">
    <!-- 折叠态：窄条 + 展开图标按钮（仅图标，点击图标展开；与组件库折叠态交互统一） -->
    <template v-if="editorStore.propertyCollapsed">
      <button class="panel-expand-tab" @click="editorStore.togglePropertyCollapsed()" title="展开属性面板">
        🛠️
      </button>
    </template>

    <!-- 展开态：完整属性面板 -->
    <template v-else>
      <div class="panel-header">
        <h3>🛠️ 属性面板</h3>
        <button class="panel-collapse-btn" @click="editorStore.togglePropertyCollapsed()" title="折叠属性面板">
          ▶
        </button>
      </div>

      <!-- 未选中任何元素 -->
      <div v-if="!element && !canvasSelected" class="empty">请选择一个元素</div>

      <!-- ====== 画布属性（点击画布空白处） ====== -->
      <div v-else-if="canvasSelected">
        <div class="field">
          <label>类型</label>
          <span>画布</span>
        </div>
        <div class="field">
          <label>节点数量</label>
          <span>{{ nodeCount }}</span>
        </div>
        <div class="field">
          <label>连线数量</label>
          <span>{{ edgeCount }}</span>
        </div>

        <div class="section-divider">画布设置</div>

        <div class="field">
          <label>背景颜色</label>
          <input type="color" class="color-input" v-model="canvasBgColor" @input="updateCanvasBackground" />
        </div>

        <div class="field checkbox-field">
          <label class="checkbox-label">
            <input type="checkbox" v-model="canvasGridVisible" @change="updateGridVisible" />
            <span>显示网格</span>
          </label>
        </div>

        <div class="field">
          <label>网格大小</label>
          <input type="number" min="1" v-model.number="canvasGridSize" @input="updateGridSize" :disabled="!canvasGridVisible" />
        </div>

        <div class="field">
          <label>网格类型</label>
          <select v-model="canvasGridType" @change="updateGridType" :disabled="!canvasGridVisible">
            <option value="dot">点状</option>
            <option value="mesh">网格线</option>
            <option value="fixedDot">固定点</option>
            <option value="doubleMesh">双层网格</option>
          </select>
        </div>
      </div>

      <!-- 已选中元素 -->
      <div v-else-if="element">
        <!-- ====== 节点：三个标签页 ====== -->
        <template v-if="element.type === 'node'">
          <!-- 标签栏 -->
          <div class="panel-tabs">
            <div class="panel-tab" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础</div>
            <div class="panel-tab" :class="{ active: activeTab === 'binding' }" @click="activeTab = 'binding'">绑定</div>
            <div class="panel-tab" :class="{ active: activeTab === 'route' }" @click="activeTab = 'route'">路线</div>
            <div class="panel-tab" :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">事件</div>
          </div>

          <!-- ====== 基础属性 tab ====== -->
          <div v-show="activeTab === 'basic'">
            <div class="field field-compact">
              <label>ID</label>
              <span class="id-value" :title="element.data.id">{{ element.data.id }}</span>
            </div>
            <!-- 名称（所有节点常显；节点未预置 name 字段时输入即创建） -->
            <div class="field field-compact">
              <label>名称</label>
              <input :value="element.data.name ?? ''" placeholder="未设置" @input="onNameInput" />
            </div>
            <div class="field field-compact">
              <label>类型</label>
              <span>{{ nodeTypeLabel }}</span>
            </div>
            <div class="field field-compact">
              <label>标签</label>
              <input v-model="element.data.label" @input="updateNodeLabel" />
            </div>

            <!-- ====== 节点图标（默认图标 / 预设 / 上传自定义 / 尺寸） ====== -->
            <template v-if="iconEditable">
              <div class="section-divider">图标</div>
              <div class="icon-picker" ref="iconPickerRef">
                <!-- 当前图标 + 点击展开预设选择面板 -->
                <div class="icon-current">
                  <button
                    type="button"
                    class="icon-picker-trigger"
                    :aria-expanded="iconPickerOpen"
                    aria-haspopup="true"
                    title="点击选择预设图标"
                    @click="toggleIconPicker"
                  >
                    <span class="icon-preview" aria-hidden="true">
                      <NodeIcon :icon="currentIcon" :size="Math.min(iconSizeModel, 24)" />
                    </span>
                    <span class="icon-current-info">
                      <span class="icon-current-label">
                        {{ isCustomImage ? '自定义图片' : isDefaultIcon ? '默认图标' : '预设图标' }}
                      </span>
                    </span>
                    <span class="icon-picker-caret" :class="{ open: iconPickerOpen }" aria-hidden="true">▾</span>
                  </button>
                  <button v-if="!isDefaultIcon" class="icon-reset-btn" @click="resetIcon">恢复默认</button>
                </div>

                <!-- 预设图标下拉面板（点击触发按钮展开，选中或点击外部关闭） -->
                <div v-show="iconPickerOpen" class="icon-picker-panel">
                  <div class="icon-grid" role="radiogroup" aria-label="选择预设图标">
                    <button
                      v-for="ic in PRESET_ICONS"
                      :key="ic"
                      type="button"
                      class="icon-grid-item"
                      :class="{ active: element.data.icon === ic }"
                      :title="'选择图标 ' + ic"
                      :aria-pressed="element.data.icon === ic"
                      @click="selectIcon(ic)"
                    >{{ ic }}</button>
                  </div>
                </div>
              </div>

              <input
                ref="iconFileInput"
                type="file"
                :accept="ICON_UPLOAD_ACCEPT"
                class="icon-file-input"
                aria-label="上传自定义图标图片"
                @change="onIconFileChange"
              />
              <div class="icon-upload-row">
                <button class="icon-upload-btn" :disabled="iconUploading" @click="triggerIconUpload">
                  {{ iconUploading ? '处理中…' : '⬆ 上传图片' }}
                </button>
                <!-- 帮助按钮：点击弹出上传格式说明气泡，点击外部关闭 -->
                <span class="icon-help-wrap" ref="iconHelpWrapRef">
                  <button
                    type="button"
                    class="icon-help-btn"
                    :aria-expanded="iconUploadHelpOpen"
                    title="上传格式说明"
                    @click="iconUploadHelpOpen = !iconUploadHelpOpen"
                  >?</button>
                  <div v-if="iconUploadHelpOpen" class="icon-help-pop" role="note">
                    PNG / JPG / WebP / SVG，≤2MB，自动压缩至 128px 内
                  </div>
                </span>
              </div>
              <div v-if="iconError" class="icon-error" role="alert">{{ iconError }}</div>

              <div class="field">
                <label>图标尺寸 <span class="hint">({{ iconSizeModel }}px)</span></label>
                <input
                  type="range"
                  :min="ICON_SIZE_MIN"
                  :max="ICON_SIZE_MAX"
                  step="1"
                  v-model.number="iconSizeModel"
                  @input="updateNodeIconSize"
                />
              </div>
            </template>

            <!-- 货架维度属性：排/列/层 -->
            <template v-if="element.data.rows !== undefined">
              <div class="field">
                <label>排 (rows)</label>
                <input type="number" min="1" v-model.number="element.data.rows" @input="updateNodeDataField('rows')" />
              </div>
            </template>
            <template v-if="element.data.cols !== undefined">
              <div class="field">
                <label>列 (cols)</label>
                <input type="number" min="1" v-model.number="element.data.cols" @input="updateNodeDataField('cols')" />
              </div>
            </template>
            <template v-if="element.data.floors !== undefined">
              <div class="field">
                <label>层 (floors)</label>
                <input type="number" min="1" v-model.number="element.data.floors" @input="updateNodeDataField('floors')" />
              </div>
            </template>

            <!-- 自定义数据（卡片节点等） -->
            <template v-if="element.data.data">
              <div class="field">
                <label>标题</label>
                <input v-model="element.data.data.title" @input="updateNodeData" />
              </div>
              <div class="field">
                <label>状态</label>
                <select v-model="element.data.data.status" @change="updateNodeData">
                  <option value="正常">正常</option>
                  <option value="告警">告警</option>
                  <option value="故障">故障</option>
                  <option value="停止">停止</option>
                </select>
              </div>
            </template>

            <!-- 位置（X/Y 同行显示） -->
            <div class="section-divider">位置</div>
            <div class="field-row">
              <div class="field field-compact">
                <label>X</label>
                <input type="number" v-model.number="posX" @input="onPositionInput" />
              </div>
              <div class="field field-compact">
                <label>Y</label>
                <input type="number" v-model.number="posY" @input="onPositionInput" />
              </div>
            </div>

            <!-- 尺寸（宽度/高度同行显示） -->
            <div class="section-divider">尺寸</div>
            <div class="field-row">
              <div class="field field-compact">
                <label>宽度</label>
                <input type="number" min="40" v-model.number="nodeWidth" @input="onSizeInput" />
              </div>
              <div class="field field-compact">
                <label>高度</label>
                <input type="number" min="40" v-model.number="nodeHeight" @input="onSizeInput" />
              </div>
            </div>

          </div>

          <!-- ====== 路线 tab（所有节点通用） ====== -->
          <div v-show="activeTab === 'route'">
            <div class="field checkbox-field">
              <label class="checkbox-label">
                <input type="checkbox" v-model="routeEnabled" @change="onRouteEnabledChange" />
                <span>启用路线运动</span>
              </label>
              <!-- 帮助按钮：路线运动使用说明气泡 -->
              <span class="field-help-wrap">
                <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'route'" title="路线运动说明" @click="toggleFieldHelp('route')">?</button>
                <div v-if="fieldHelpOpen === 'route'" class="field-help-pop" role="note">
                  勾选「启用路线运动」后可为节点绑定路线并控制运动。
                </div>
              </span>
            </div>

            <template v-if="routeEnabled">
              <div class="field">
                <label>选择路线</label>
                <select v-model="nodeRouteId" @change="onRouteSelect">
                  <option value="">未设置</option>
                  <option v-for="r in routeStore.routes" :key="r.id" :value="r.id">{{ r.name }}（{{ r.points.length }} 航点）</option>
                </select>
              </div>

              <div class="field">
                <label>移动速度 <span class="hint">({{ routeSpeed }} px/s)</span></label>
                <input type="range" min="20" max="300" step="10" v-model.number="routeSpeed" @input="onRouteSpeedChange" />
              </div>

              <!-- 循环执行：节点级覆盖（未改过时用路线自身的 loop 默认值），运行中勾选/取消实时生效 -->
              <div class="field">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="routeLoop" @change="onRouteLoopChange" />
                  <span>循环执行</span>
                </label>
              </div>

              <!-- 路线运动控制：双按钮四态（空闲/运行中/已暂停/已结束）。
                   主按钮：运行→暂停→继续；次按钮：运行中结束 / 结束后重置回首航点 -->
              <div class="route-actions">
                <button
                  class="route-btn"
                  :class="{ active: routePaused, running: routeMoving && !routePaused }"
                  @click="onPrimaryRouteAction"
                  :disabled="!nodeRouteId"
                  :title="routeMoving && !routePaused ? '暂停（保留位置，可继续）' : routePaused ? '从暂停处继续' : '从首航点开始运行'"
                >
                  {{ routeMoving && !routePaused ? '⏸ 暂停' : routePaused ? '▶ 继续' : '▶ 运行' }}
                </button>
                <button
                  class="route-btn"
                  @click="onSecondaryRouteAction"
                  :disabled="secondaryRouteDisabled"
                  :title="routeMoving ? '结束运行（节点停在当前位置）' : '回到首航点（不启动）'"
                >
                  {{ routeMoving ? '⏹ 结束' : '↺ 重置' }}
                </button>
              </div>
              <!-- 状态行：四态实时展示（修复自然结束后按钮状态不更新的问题） -->
              <div class="route-state">状态：{{ routeStateLabel }}</div>
            </template>
          </div>

          <!-- ====== 数据绑定 tab ====== -->
          <div v-show="activeTab === 'binding'">
            <div class="field">
              <label>数据源
                <!-- 帮助按钮：数据源选择说明气泡（跟在标签文字后，内含跳转入口） -->
                <span class="field-help-wrap">
                  <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'source'" title="数据源说明" @click="toggleFieldHelp('source')">?</button>
                  <div v-if="fieldHelpOpen === 'source'" class="field-help-pop" role="note">
                    必须选择「数据源管理」中已创建的数据源。<button type="button" class="no-source-btn" @click="gotoDataSourceManager">前往数据源管理</button>
                  </div>
                </span>
              </label>
              <select v-model="bindingSourceId" @change="updateBinding">
                <option value="">未选择数据源</option>
                <option
                  v-for="ds in dataSourceStore.dataSources"
                  :key="ds.id"
                  :value="ds.id"
                >{{ ds.name }}（{{ typeLabel(ds.type) }}）</option>
              </select>
            </div>
            <div v-if="selectedDataSource" class="source-info">
              <div class="source-url" :title="selectedDataSource.url">{{ selectedDataSource.url }}</div>
              <div v-if="selectedDataSource.description" class="source-desc">{{ selectedDataSource.description }}</div>
            </div>
            <div class="field">
              <label>点ID
                <!-- 帮助按钮：点组说明气泡（跟在标签文字后） -->
                <span class="field-help-wrap">
                  <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'point'" title="点ID 说明" @click="toggleFieldHelp('point')">?</button>
                  <div v-if="fieldHelpOpen === 'point'" class="field-help-pop" role="note">
                    点ID 与转换函数为一组，按组添加/删除。主点组（第一个）固定不可删，驱动节点画面；附加点组实时值见节点详情。
                  </div>
                </span>
              </label>
            </div>
            <!-- 绑定点组列表：每组 = 点ID + 转换函数；主点组（第一个）固定不可删 -->
            <div v-for="(g, idx) in bindingGroups" :key="idx" class="binding-group-card">
              <div class="binding-group-head">
                <span class="binding-group-tag" :class="{ primary: idx === 0 }">{{ idx === 0 ? '主点' : `附加点 ${idx}` }}</span>
                <button v-if="idx > 0" type="button" class="extra-point-remove" title="删除该点组" @click="removePointGroup(idx)">×</button>
              </div>
              <!-- 点ID 行：标签 + 输入框 -->
              <div class="binding-group-row">
                <label class="binding-row-label">点ID</label>
                <input
                  v-model="g.pointId"
                  @input="updateBinding"
                  :placeholder="idx === 0 ? '例如: sensor.temp.001' : '例如: sensor.humi.001'"
                />
              </div>
              <!-- 转换函数行：标签 + 输入框（可选）+ 弹出编辑按钮（打开大编辑对话框） -->
              <div class="binding-group-row">
                <label class="binding-row-label">转换函数</label>
                <input
                  v-model="g.transformSource"
                  @input="updateBinding"
                  placeholder="(可选) (raw) => Math.round(raw)"
                />
                <button
                  type="button"
                  class="transform-expand-btn"
                  title="弹出大编辑框（查看/编辑长函数）"
                  @click="openTransformDialog(idx)"
                >⤢</button>
              </div>
            </div>
            <button type="button" class="add-extra-point-btn" @click="addPointGroup">＋ 添加点组（点ID + 转换函数）</button>
            <div class="binding-status">
              <span v-if="hasPrimaryPoint && !bindingSourceId" class="status-warning">⚠ 请选择数据源，绑定方可生效</span>
              <span v-else-if="hasPrimaryPoint" class="status-active">✅ 已启用数据绑定</span>
              <span v-else class="status-inactive">⏸ 未启用（请填写主点ID）</span>
            </div>
          </div>

          <!-- ====== 事件 tab ====== -->
          <div v-show="activeTab === 'events'">
            <div v-if="eventsDraft.length === 0" class="empty-hint">暂无事件规则，点击下方按钮添加。</div>

            <div v-for="(rule, idx) in eventsDraft" :key="rule.id" class="event-rule">
              <div class="rule-header">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="rule.enabled" />
                  <span>启用</span>
                </label>
                <button class="rule-remove" @click="removeEventRule(idx)">删除</button>
              </div>
              <div class="field">
                <label>规则名称</label>
                <input v-model="rule.name" placeholder="例如：温度越限告警" />
              </div>
              <div class="field">
                <label>监听字段
                  <!-- 帮助按钮：监听字段说明气泡（跟在标签文字后） -->
                  <span class="field-help-wrap">
                    <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'watch'" title="监听字段说明" @click="toggleFieldHelp('watch')">?</button>
                    <div v-if="fieldHelpOpen === 'watch'" class="field-help-pop" role="note">
                      选择要监听的绑定点ID；节点可能绑定多个点，运行值从 data.values[点ID].value 读取。
                    </div>
                  </span>
                </label>
                <!-- 点ID 下拉选择：field 统一为绑定点ID，选项来自当前节点的绑定点组（可能多个） -->
                <select v-model="rule.field">
                  <option
                    v-for="g in watchFieldOptions"
                    :key="g"
                    :value="g"
                  >{{ g }}</option>
                </select>
              </div>
              <div class="field">
                <label>触发条件</label>
                <select v-model="rule.condition">
                  <option value="changed">值变化</option>
                  <option value="gt">大于 (&gt;)</option>
                  <option value="lt">小于 (&lt;)</option>
                  <option value="gte">大于等于 (≥)</option>
                  <option value="lte">小于等于 (≤)</option>
                  <option value="eq">等于 (=)</option>
                  <option value="neq">不等于 (≠)</option>
                </select>
              </div>
              <div v-if="rule.condition !== 'changed'" class="field">
                <label>阈值</label>
                <input v-model="rule.threshold" placeholder="例如：80" />
              </div>
              <div class="field">
                <label>触发动作</label>
                <select v-model="rule.actionType">
                  <option value="console">控制台日志</option>
                  <option value="alert">弹出告警</option>
                  <option value="http">HTTP 请求</option>
                </select>
              </div>
              <div v-if="rule.actionType === 'alert'" class="field">
                <label>告警内容</label>
                <input v-model="rule.message" placeholder="例如：设备温度越限！" />
              </div>
              <template v-if="rule.actionType === 'http'">
                <div class="field">
                  <label>请求地址</label>
                  <input v-model="rule.url" placeholder="http://localhost:8080/api/alarm" />
                </div>
                <div class="field">
                  <label>请求方法</label>
                  <select v-model="rule.method">
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
              </template>
            </div>

            <button class="add-event-btn" @click="handleAddEventRule">＋ 添加事件规则</button>
          </div>
        </template>

        <!-- ====== 边：仅基础属性 ====== -->
        <template v-else-if="element.type === 'edge'">
          <div class="field">
            <label>ID</label>
            <span class="id-value" :title="element.data.id">{{ element.data.id }}</span>
          </div>
          <div class="field">
            <label>类型</label>
            <span>连线</span>
          </div>
          <div class="field">
            <label>标签</label>
            <input v-model="element.data.label" @input="updateEdgeLabel" />
          </div>
        </template>
      </div>
    </template>
    </div>

    <!-- 转换函数编辑对话框：点组卡片内 ⤢ 按钮打开，大号多行编辑区便于查看/编辑长函数；
         草稿模式——确定才写回点组，取消/遮罩点击/Esc 丢弃 -->
    <Teleport to="body">
      <div v-if="transformDialog" class="transform-dialog-mask" @click.self="cancelTransformDialog">
        <div class="transform-dialog" role="dialog" aria-modal="true" aria-label="编辑转换函数">
          <div class="transform-dialog-head">
            <h4>
              编辑转换函数
              <span class="binding-group-tag" :class="{ primary: transformDialog.groupIdx === 0 }">
                {{ transformDialog.groupIdx === 0 ? '主点' : `附加点 ${transformDialog.groupIdx}` }}
              </span>
            </h4>
            <button type="button" class="transform-dialog-close" title="关闭（不保存）" @click="cancelTransformDialog">×</button>
          </div>
          <textarea
            v-model="transformDialog.draft"
            class="transform-editor transform-dialog-editor"
            placeholder="(可选) 例如: (raw) => Math.round(raw)"
          ></textarea>
          <div class="transform-dialog-foot">
            <button type="button" class="transform-dialog-btn" @click="cancelTransformDialog">取消</button>
            <button type="button" class="transform-dialog-btn primary" @click="confirmTransformDialog">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useNodeEvents } from '@/composables/useNodeEvents'
import NodeIcon from './nodes/NodeIcon.vue'
import { nodeTemplates } from './nodes/nodeTemplates'
import {
  PRESET_ICONS,
  ICON_SIZE_MIN,
  ICON_SIZE_MAX,
  ICON_SIZE_DEFAULT,
  ICON_UPLOAD_ACCEPT,
  ICON_UPLOAD_MAX_BYTES,
  ICON_UPLOAD_MAX_DIMENSION,
  isImageIcon,
  resolveNodeIcon,
  clampIconSize,
  iconOnlyNodeSize,
  isMinimalIconShape,
} from './nodes/nodeIcons'
import {
  useDataSourceStore,
  DATA_SOURCE_TYPE_LABELS,
  type DataSourceType,
} from '@/stores/dataSource'

// ===================== 依赖注入 =====================
const editorStore = useEditorStore()
const dataSourceStore = useDataSourceStore()

const props = defineProps<{
  canvasRef: any
}>()

// ===================== 辅助方法：获取 Graph 实例 =====================
// canvasRef.graph 现在是一个 ref（来自 X6Canvas 的 defineExpose），需要读取 .value
function getGraph(): any {
  const g = props.canvasRef?.graph
  // 如果是 ref，取 .value；否则直接返回（兼容旧写法）
  return g?.value !== undefined ? g.value : g
}

// ===================== 当前选中元素 =====================
const element = computed(() => editorStore.selectedElement)

// ===================== 面板宽度拖动调整 =====================
// 展开态下拖动面板左缘手柄即可调整宽度；折叠态不适用（固定 32px 窄条）
const PANEL_WIDTH_MIN = 200
const PANEL_WIDTH_MAX = 600
const PANEL_WIDTH_DEFAULT = 240

/** 当前面板宽度（像素） */
const panelWidth = ref(PANEL_WIDTH_DEFAULT)
/** 是否正在拖动调整宽度（拖动中禁用宽度过渡动画，避免卡顿） */
const panelResizing = ref(false)
// 拖动起点记录：按下时的鼠标 X 坐标与面板宽度
let resizeStartX = 0
let resizeStartWidth = PANEL_WIDTH_DEFAULT

/** 展开态内联宽度样式（折叠态不设置，由 CSS 的 32px 接管） */
const panelStyle = computed(() => {
  if (editorStore.propertyCollapsed) return {}
  return { width: `${panelWidth.value}px` }
})

/** 开始拖动：记录起点并在 document 上监听移动/松开 */
function startPanelResize(e: MouseEvent) {
  resizeStartX = e.clientX
  resizeStartWidth = panelWidth.value
  panelResizing.value = true
  document.addEventListener('mousemove', onPanelResizeMove)
  document.addEventListener('mouseup', stopPanelResize)
  // 拖动期间全局锁定光标样式与文本选中，避免拖出面板后体验断裂
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

/** 拖动中：面板在右侧，向左拖（delta 为正）变宽，向右拖变窄 */
function onPanelResizeMove(e: MouseEvent) {
  const delta = resizeStartX - e.clientX
  panelWidth.value = Math.min(
    PANEL_WIDTH_MAX,
    Math.max(PANEL_WIDTH_MIN, resizeStartWidth + delta)
  )
}

/** 结束拖动：移除监听并恢复全局光标/选中 */
function stopPanelResize() {
  panelResizing.value = false
  document.removeEventListener('mousemove', onPanelResizeMove)
  document.removeEventListener('mouseup', stopPanelResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onBeforeUnmount(() => {
  // 组件卸载时兜底清理，避免残留 document 监听器
  stopPanelResize()
})

// ===================== 画布属性（点击空白处时展示） =====================
// 是否选中画布本身
const canvasSelected = computed(() => editorStore.canvasSelected)
// 画布统计信息（来源于 store 的 graphData，随数据变化自动更新）
const nodeCount = computed(() => editorStore.graphData.nodes.length)
const edgeCount = computed(() => editorStore.graphData.edges.length)

// 画布设置的本地状态（与 X6Canvas 的初始配置保持一致）
const canvasBgColor = ref('#f8fafc')
const canvasGridVisible = ref(true)
const canvasGridSize = ref(10)
const canvasGridType = ref<'dot' | 'mesh' | 'fixedDot' | 'doubleMesh'>('dot')

// 选中画布时，从 Graph 实例同步可读的当前状态（如网格大小）
watch(
    () => editorStore.canvasSelected,
    (selected) => {
      if (!selected) return
      const graph = getGraph()
      if (graph) {
        canvasGridSize.value = graph.getGridSize()
      }
    },
    { immediate: true }
)

/** 更新画布背景颜色 */
function updateCanvasBackground() {
  getGraph()?.drawBackground({ color: canvasBgColor.value })
}

/** 切换网格显隐 */
function updateGridVisible() {
  const graph = getGraph()
  if (!graph) return
  canvasGridVisible.value ? graph.showGrid() : graph.hideGrid()
}

/** 更新网格大小 */
function updateGridSize() {
  const graph = getGraph()
  if (!graph) return
  canvasGridSize.value = Math.max(canvasGridSize.value || 1, 1)
  graph.setGridSize(canvasGridSize.value)
}

/** 更新网格类型 */
function updateGridType() {
  getGraph()?.drawGrid({ type: canvasGridType.value })
}

// ===================== 标签页状态（基础属性 / 数据绑定 / 路线 / 事件） =====================
type PanelTab = 'basic' | 'binding' | 'route' | 'events'
const activeTab = ref<PanelTab>('basic')

// ===================== 数据绑定配置的本地状态 =====================
// 数据源实例 ID（空字符串 = 未选择；必须选择数据源管理中维护的实例）
const bindingSourceId = ref('')

/** 绑定点组草稿：点 ID 与转换函数为一组（bindingGroups[0] 为主点组，固定不可删） */
interface BindingGroupDraft {
  pointId: string
  transformSource: string
}
// 点组列表（按组添加/删除；数据写入 data.values[pointId]，主点额外驱动 data.value）
const bindingGroups = ref<BindingGroupDraft[]>([{ pointId: '', transformSource: '' }])

/** 转换函数编辑对话框状态（null = 未打开；draft 为编辑草稿，确定才写回点组） */
const transformDialog = ref<{ groupIdx: number; draft: string } | null>(null)
/** 打开转换函数编辑对话框（复制当前内容为草稿，避免边改边生效） */
function openTransformDialog(idx: number) {
  transformDialog.value = { groupIdx: idx, draft: bindingGroups.value[idx]?.transformSource ?? '' }
}
/** 取消/关闭对话框：丢弃草稿，不写回 */
function cancelTransformDialog() {
  transformDialog.value = null
}
/** 确定：草稿写回对应点组并立即提交绑定 */
function confirmTransformDialog() {
  const dlg = transformDialog.value
  if (!dlg) return
  const g = bindingGroups.value[dlg.groupIdx]
  if (g) {
    g.transformSource = dlg.draft
    updateBinding()
  }
  transformDialog.value = null
}
/** 对话框打开期间 Esc 关闭（不保存） */
function onTransformDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') cancelTransformDialog()
}
watch(transformDialog, (dlg) => {
  if (dlg) document.addEventListener('keydown', onTransformDialogKeydown)
  else document.removeEventListener('keydown', onTransformDialogKeydown)
})
onBeforeUnmount(() => {
  // 兜底清理对话框 Esc 监听，避免残留 document 监听器
  document.removeEventListener('keydown', onTransformDialogKeydown)
})

/** 主点 ID 是否已填写（驱动绑定状态提示） */
const hasPrimaryPoint = computed(() => !!bindingGroups.value[0]?.pointId.trim())

/** 添加一个空的点组（点ID + 转换函数） */
function addPointGroup() {
  bindingGroups.value.push({ pointId: '', transformSource: '' })
}

/** 删除指定附加点组（主点组 idx=0 不允许删除）并立即同步绑定 */
function removePointGroup(idx: number) {
  if (idx <= 0) return
  bindingGroups.value.splice(idx, 1)
  updateBinding()
}

/** 跳转到数据源管理对话框（帮助气泡内的引导入口，跳转同时关闭气泡） */
function gotoDataSourceManager() {
  fieldHelpOpen.value = null
  editorStore.setDataSourceDialogOpen(true)
}

/** 数据源类型显示名 */
function typeLabel(type: DataSourceType): string {
  return DATA_SOURCE_TYPE_LABELS[type] ?? type
}

/** 当前选中的数据源实例（未选择时为 null） */
const selectedDataSource = computed(() =>
  bindingSourceId.value ? dataSourceStore.getDataSource(bindingSourceId.value) ?? null : null
)

// ===================== 事件规则（逻辑抽取至 useNodeEvents composable） =====================
const { eventsDraft, addEventRule, removeEventRule } = useNodeEvents(getGraph, activeTab)

/**
 * 监听字段下拉选项：field 统一为绑定点ID，
 * 选项 = 当前节点绑定点组中非空且去重的点ID（保留录入顺序）。
 */
const watchFieldOptions = computed(() => {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const g of bindingGroups.value) {
    const pid = g.pointId.trim()
    if (pid && !seen.has(pid)) {
      seen.add(pid)
      ids.push(pid)
    }
  }
  return ids
})

/** 添加事件规则：默认监听第一个绑定点（field 统一为点ID，不再有空值语义） */
function handleAddEventRule() {
  addEventRule(watchFieldOptions.value[0] ?? '')
}

// ===================== 位置与尺寸独立管理（绕过 store 响应式链） =====================
const posX = ref(0)
const posY = ref(0)
const nodeWidth = ref(0)
const nodeHeight = ref(0)
let positionRafId: number | null = null
let lastSyncedNodeId: string | null = null

// ===================== 监听选中节点切换，加载绑定配置 =====================
// 只监听节点 ID（而非 element 深度监听）：updateBinding 会把 binding 写回 store，
// selectedElement 随之生成新对象，若深度监听会每次击键都把草稿回填一遍
//（未选数据源时 binding 为 undefined，草稿被清空 → 点ID 无法输入）。
// 切换选中节点时才需要重新回填草稿。
watch(
    () => element.value?.data?.id,
    (newId) => {
      const newElement = element.value
      // 切换选中节点时关闭转换函数编辑对话框，避免草稿写回错误的节点
      transformDialog.value = null
      if (!newId || !newElement || newElement.type !== 'node') {
        bindingSourceId.value = ''
        bindingGroups.value = [{ pointId: '', transformSource: '' }]
        return
      }
      const data = newElement.data
      let binding = data?.binding || {}

      // 如果 store 中没有 binding 数据，尝试从 X6 节点实例直接读取
      if (!binding.pointId) {
        const graph = getGraph()
        if (graph) {
          const node = graph.getCellById(newElement.data.id)
          if (node && node.isNode()) {
            const nodeData = node.getData()
            if (nodeData?.binding?.pointId) {
              binding = nodeData.binding
            }
          }
        }
      }

      bindingSourceId.value = binding.sourceId || ''
      // 点组回填：优先 points（每组 = 点ID + 转换函数，条目兼容字符串），
      // 旧数据回退单组 [{ pointId, transformSource }]
      if (Array.isArray(binding.points) && binding.points.length > 0) {
        bindingGroups.value = binding.points.map((p: any) => ({
          pointId: typeof p === 'string' ? p : (p?.pointId ?? ''),
          transformSource: typeof p === 'string' ? '' : (p?.transformSource ?? ''),
        }))
      } else if (binding.pointId) {
        bindingGroups.value = [{
          pointId: binding.pointId,
          transformSource: binding.transformSource
            || (binding.transform ? binding.transform.toString() : ''),
        }]
      } else {
        bindingGroups.value = [{ pointId: '', transformSource: '' }]
      }
    },
    { immediate: true }
)

watch(
    () => editorStore.selectedId,
    (newId) => {
      if (newId && newId !== lastSyncedNodeId) {
        lastSyncedNodeId = newId
        syncPositionFromCanvas()
        startPositionPolling()
      } else if (!newId) {
        lastSyncedNodeId = null
        stopPositionPolling()
      }
    },
    { immediate: true }
)

onBeforeUnmount(() => {
  stopPositionPolling()
})

// ===================== 核心方法：更新绑定配置 =====================
function updateBinding() {
  if (!element.value || element.value.type !== 'node') {
    console.warn('[PropertyPanel] 未选中节点，跳过绑定更新')
    return
  }

  const nodeId = element.value.data.id
  // 有效点组：点ID 非空且去重（保留首个）；转换函数随组携带
  const validGroups: BindingGroupDraft[] = []
  const seen = new Set<string>()
  for (const g of bindingGroups.value) {
    const pid = g.pointId.trim()
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    validGroups.push({ pointId: pid, transformSource: g.transformSource.trim() })
  }
  const primary = validGroups[0]

  let binding: any = null

  // 有主点即提交绑定配置，sourceId 允许后补：
  // 点位是用户录入的设计数据，若要求"主点 + 数据源同时具备才写入"，
  // ① 未选数据源时录入的点位只存在于面板草稿，切换选中节点即丢失；
  // ② 切换数据源（先置空再改选）会把已录入的点位整段清空。
  // 无 sourceId 的绑定运行期不会订阅——bindNodeData 解析不到数据源即静默返回，
  // 节点保持静态值，语义安全
  if (primary) {
    // 点组列表：主点组在前；pointId / transformSource 顶层字段保留主点信息兼容旧工程
    binding = {
      pointId: primary.pointId,
      transformSource: primary.transformSource || undefined,
      points: validGroups.map((g) => ({
        pointId: g.pointId,
        transformSource: g.transformSource || undefined,
      })),
      sourceId: bindingSourceId.value || undefined,
    }
  } else {
    binding = undefined
  }

  // 触发画布重新绑定
  try {
    const graph = getGraph()
    if (!graph) {
      console.warn('[PropertyPanel] canvasRef.graph 未就绪')
      return
    }

    const node = graph.getCellById(nodeId)
    if (!node || !node.isNode()) {
      console.warn('[PropertyPanel] 节点实例未找到')
      return
    }

    // 将 binding 同步写入 X6 节点数据。
    // 必须用 updateData（顶层整体替换，deep:false），不能用默认 setData 深合并——
    // X6 深合并即 lodash.merge：数组按下标逐项合并（删除点组后 points 尾部旧条目残留
    // → 运行期继续订阅已删点位）、undefined 值被跳过（旧字段清不掉），
    // 都会导致画布 binding 与 store 分叉，进而误判"实质变化"触发整画布重建
    node.updateData({ binding })

    // 取消旧订阅
    if (props.canvasRef.unbindNodeData) {
      props.canvasRef.unbindNodeData(nodeId)
    }

    // 仅当绑定有效（点ID + 数据源实例均具备）时才建立新订阅
    if (binding && props.canvasRef.bindNodeData) {
      props.canvasRef.bindNodeData(node)
    }
  } catch (error) {
    console.error('[PropertyPanel] 更新数据绑定时发生错误:', error)
  }

  // 最后更新 store：binding 写入 data.binding（与 X6 节点数据结构一致，
  // 避免画布重载时 fromJSON 用旧 data.binding 覆盖导致 sourceId 丢失）
  const storeNode = editorStore.graphData.nodes.find((n) => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), binding } })
  }
}

// ===================== 其他属性更新方法 =====================
/** 当前选中元素的类型显示名（与节点详情对话框一致：取 nodeTemplates 模板 label，兜底形状名） */
const nodeTypeLabel = computed(() => {
  const shape = element.value?.type === 'node' ? (element.value.data.shape || '') : ''
  return nodeTemplates.find((t) => t.type === shape)?.label || shape || '未知'
})

function updateNodeLabel() {
  if (!element.value || element.value.type !== 'node') return
  editorStore.updateNode(element.value.data.id, { label: element.value.data.label })
}

function updateNodeName() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const newName = element.value.data.name

  const storeNode = editorStore.graphData.nodes.find(n => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), name: newName } })
  }

  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      const currentData = node.getData() || {}
      node.setData({ ...currentData, name: newName })
    }
  }
}

/** 名称输入（所有节点可用；节点 data 未预置 name 时先写入再同步，避免 v-model 对 undefined 字段失效） */
function onNameInput(e: Event) {
  if (!element.value || element.value.type !== 'node') return
  element.value.data.name = (e.target as HTMLInputElement).value
  updateNodeName()
}

function updateNodeData() {
  if (!element.value || element.value.type !== 'node') return
  editorStore.updateNode(element.value.data.id, { data: element.value.data.data })
}

/** 同步货架等节点的 data 子字段（rows/cols/floors）到 store 和 X6 节点 */
function updateNodeDataField(field: string) {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const newValue = element.value.data[field]

  // 通过 updateNode 不可变更新 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), [field]: newValue } })
  }

  // 同步更新 X6 节点 data
  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      const currentData = node.getData() || {}
      node.setData({ ...currentData, [field]: newValue })
    }
  }
}

function updateEdgeLabel() {
  if (!element.value || element.value.type !== 'edge') return
  editorStore.updateEdge(element.value.data.id, { label: element.value.data.label })
}

// ===================== 节点图标（默认 / 预设 / 上传自定义 / 尺寸控制） =====================
// 原生形状（rect/circle）不走 Vue 节点渲染，不支持图标编辑
const NATIVE_SHAPES = ['rect', 'circle']
const iconEditable = computed(() =>
  !!element.value &&
  element.value.type === 'node' &&
  !NATIVE_SHAPES.includes(element.value.data.shape)
)

/** 当前选中节点的形状名（用于解析默认图标） */
const nodeShape = computed(() =>
  element.value?.type === 'node' ? (element.value.data.shape || '') : ''
)

/** 当前实际生效的图标（data.icon 优先，否则形状默认图标） */
const currentIcon = computed(() =>
  resolveNodeIcon(nodeShape.value, element.value?.type === 'node' ? element.value.data.icon : '')
)

/** 是否为上传的图片图标（data: URL） */
const isCustomImage = computed(() =>
  element.value?.type === 'node' ? isImageIcon(element.value.data.icon) : false
)

/** 是否使用默认图标（data.icon 未设置） */
const isDefaultIcon = computed(() =>
  element.value?.type === 'node' ? !element.value.data.icon : true
)

// 图标尺寸本地模型（选中节点变化时从节点数据同步）
const iconSizeModel = ref(ICON_SIZE_DEFAULT)
const iconFileInput = ref<HTMLInputElement | null>(null)
const iconUploading = ref(false)
const iconError = ref('')
// 上传帮助说明弹出状态（点击上传按钮旁的 ? 按钮切换，点击外部关闭）
const iconUploadHelpOpen = ref(false)
const iconHelpWrapRef = ref<HTMLElement | null>(null)

// 预设图标下拉面板状态（点击触发按钮展开，选中图标或点击面板外部关闭）
const iconPickerOpen = ref(false)
const iconPickerRef = ref<HTMLElement | null>(null)

// 字段说明帮助气泡（单开模式：key 标识当前打开的气泡，点击 ? 切换，点击外部关闭）
const fieldHelpOpen = ref<string | null>(null)
/** 切换字段帮助气泡（再点同一个 ? 则收起） */
function toggleFieldHelp(key: string) {
  fieldHelpOpen.value = fieldHelpOpen.value === key ? null : key
}

/** 切换预设图标下拉面板展开/收起 */
function toggleIconPicker() {
  iconPickerOpen.value = !iconPickerOpen.value
}

/** 点击面板外部时关闭下拉面板 */
function onDocumentClickForIconPicker(e: MouseEvent) {
  if (iconPickerOpen.value) {
    const root = iconPickerRef.value
    if (root && e.target instanceof Node && !root.contains(e.target)) {
      iconPickerOpen.value = false
    }
  }
  if (iconUploadHelpOpen.value) {
    const wrap = iconHelpWrapRef.value
    if (wrap && e.target instanceof Node && !wrap.contains(e.target)) {
      iconUploadHelpOpen.value = false
    }
  }
  if (fieldHelpOpen.value) {
    const t = e.target
    if (!(t instanceof Element && t.closest('.field-help-wrap'))) {
      fieldHelpOpen.value = null
    }
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentClickForIconPicker)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentClickForIconPicker)
})

/** 双写图标字段到 store 与 X6 节点 data（沿用面板既有同步模式） */
function applyNodeIconData(patch: Record<string, any>) {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id

  const storeNode = editorStore.graphData.nodes.find((n) => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), ...patch } })
  }

  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      node.setData({ ...(node.getData() || {}), ...patch })
    }
  }
}

/** 选择预设图标（选中后自动收起下拉面板） */
function selectIcon(ic: string) {
  iconError.value = ''
  applyNodeIconData({ icon: ic })
  iconPickerOpen.value = false
}

/** 恢复默认图标（清除 icon/iconSize，回退到形状默认图标与默认尺寸） */
function resetIcon() {
  iconError.value = ''
  applyNodeIconData({ icon: undefined, iconSize: undefined })
  iconSizeModel.value = ICON_SIZE_DEFAULT
  syncIconModeNodeSize()
}

/** 更新图标显示尺寸 */
function updateNodeIconSize() {
  iconSizeModel.value = clampIconSize(iconSizeModel.value)
  applyNodeIconData({ iconSize: iconSizeModel.value })
  syncIconModeNodeSize()
}

/**
 * 图标模式下节点模型尺寸随 iconSize 联动：
 * 纯图标渲染时选择框需与图标视觉匹配，尺寸 = iconSize + 内边距（见 iconOnlyNodeSize）。
 * 有效模式 = 节点级覆盖 ?? 全局；仅对支持极简视图的形状生效。
 */
function syncIconModeNodeSize() {
  if (!element.value || element.value.type !== 'node') return
  if (!isMinimalIconShape(element.value.data.shape)) return
  const effectiveMode = element.value.data.displayMode ?? editorStore.displayMode
  if (effectiveMode !== 'icon') return
  const size = iconOnlyNodeSize(iconSizeModel.value)
  props.canvasRef?.updateNodeSize?.(element.value.data.id, size.width, size.height)
}

/** 切换选中节点时同步图标尺寸与清除错误提示 */
watch(
  () => element.value?.data?.id,
  () => {
    iconError.value = ''
    iconPickerOpen.value = false // 切换选中节点时收起下拉面板
    iconUploadHelpOpen.value = false // 切换选中节点时关闭帮助气泡
    fieldHelpOpen.value = null // 切换选中节点时关闭字段帮助气泡
    const graph = getGraph()
    if (!graph || !element.value || element.value.type !== 'node') {
      iconSizeModel.value = ICON_SIZE_DEFAULT
      return
    }
    const node = graph.getCellById(element.value.data.id)
    iconSizeModel.value = clampIconSize(node?.getData()?.iconSize || undefined)
  },
  { immediate: true }
)

/** 触发隐藏的文件选择框 */
function triggerIconUpload() {
  iconFileInput.value?.click()
}

/** 文件选择后：校验类型/大小 → canvas 压缩为 data URL → 写入节点 */
async function onIconFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (!file) return

  iconError.value = ''
  if (!file.type.startsWith('image/')) {
    iconError.value = '请选择图片文件（PNG / JPG / WebP / SVG）'
    return
  }
  if (file.size > ICON_UPLOAD_MAX_BYTES) {
    iconError.value = '图片超过 2MB，请压缩后再上传'
    return
  }

  iconUploading.value = true
  try {
    const dataUrl = await compressImageToDataUrl(file)
    // 图片图标过大时同步降一档默认显示尺寸，避免撑破节点头部
    applyNodeIconData({ icon: dataUrl })
  } catch (err: any) {
    iconError.value = err?.message || '图片处理失败，请更换文件重试'
  } finally {
    iconUploading.value = false
  }
}

/**
 * 读取图片 → canvas 等比缩放至 ICON_UPLOAD_MAX_DIMENSION 内 → 导出 PNG data URL。
 * 压缩后体积通常仅数 KB，写入节点 data 后随工程文件落盘持久化。
 */
function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败，文件可能已损坏'))
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) {
          reject(new Error('无法读取图片尺寸（SVG 需声明 width/height）'))
          return
        }
        const scale = Math.min(1, ICON_UPLOAD_MAX_DIMENSION / Math.max(w, h))
        const tw = Math.max(1, Math.round(w * scale))
        const th = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = tw
        canvas.height = th
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('当前环境不支持 Canvas'))
          return
        }
        ctx.drawImage(img, 0, 0, tw, th)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function onPositionInput() {
  // 位置输入框变化 → 调用 X6Canvas 暴露的 updateNodePosition 更新节点位置
  if (!element.value || element.value.type !== 'node') return
  const id = element.value.data.id
  const x = posX.value || 0
  const y = posY.value || 0

  if (props.canvasRef?.updateNodePosition) {
    props.canvasRef.updateNodePosition(id, x, y)
  }
}

function onSizeInput() {
  // 尺寸输入框变化 → 调用 X6Canvas 暴露的 updateNodeSize 更新节点尺寸（最小 40px）
  if (!element.value || element.value.type !== 'node') return
  const id = element.value.data.id
  const w = Math.max(nodeWidth.value || 40, 40)
  const h = Math.max(nodeHeight.value || 40, 40)

  if (props.canvasRef?.updateNodeSize) {
    props.canvasRef.updateNodeSize(id, w, h)
  }
}

function syncPositionFromCanvas() {
  // 从画布读取选中节点的位置/尺寸，同步到输入框显示
  // （画布拖拽时输入框数字实时跟随，而不是等输入才更新）
  const graph = getGraph()
  if (!graph || !editorStore.selectedId) return
  const cell = graph.getCellById(editorStore.selectedId)
  if (cell && cell.isNode()) {
    const pos = cell.getPosition()
    if (posX.value !== Math.round(pos.x) || posY.value !== Math.round(pos.y)) {
      posX.value = Math.round(pos.x)
      posY.value = Math.round(pos.y)
    }
    const size = cell.getSize()
    if (nodeWidth.value !== Math.round(size.width) || nodeHeight.value !== Math.round(size.height)) {
      nodeWidth.value = Math.round(size.width)
      nodeHeight.value = Math.round(size.height)
    }
  }
}

function startPositionPolling() {
  // 用 requestAnimationFrame 持续轮询画布状态（比定时器更流畅），
  // 实现“画布上拖拽 → 输入框数字实时跟随”
  stopPositionPolling()
  const poll = () => {
    syncPositionFromCanvas()
    positionRafId = requestAnimationFrame(poll)
  }
  poll()
}

function stopPositionPolling() {
  // 停止轮询（切换选中/组件卸载时调用，避免空转浪费性能）
  if (positionRafId !== null) {
    cancelAnimationFrame(positionRafId)
    positionRafId = null
  }
}

// ===================== 路线配置（所有节点通用） =====================
import { useRouteStore } from '@/stores/route'

const routeStore = useRouteStore()

const routeEnabled = ref(false)
const nodeRouteId = ref('')
const routeSpeed = ref(80)
/** 循环执行（节点级覆盖：data.routeLoop ?? 路线默认 loop） */
const routeLoop = ref(true)
/** 路线运动四态本地镜像（源自节点 data，由 cell:change:data 事件实时同步）：
 *  isMoving=true 且 !routePaused → 运行中；isMoving=true 且 routePaused → 已暂停；
 *  isMoving=false 且 routeFinished → 已结束；其余 → 空闲 */
const routeMoving = ref(false)
const routePaused = ref(false)
const routeFinished = ref(false)

/** 次按钮禁用条件：空闲态（无运行也无结束记录）或未选路线时不可结束/重置 */
const secondaryRouteDisabled = computed(() =>
  !nodeRouteId.value || (!routeMoving.value && !routeFinished.value)
)

/** 状态行文案 */
const routeStateLabel = computed(() => {
  if (routeMoving.value) return routePaused.value ? '已暂停' : '运行中'
  return routeFinished.value ? '已结束' : '空闲'
})

/** 启用/禁用路线功能 */
function onRouteEnabledChange() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeEnabled = routeEnabled.value
  if (!routeEnabled.value) {
    // 禁用时停止运动
    if (data.isMoving) {
      props.canvasRef?.toggleRouteMovement?.(element.value.data.id)
    }
  }
  node.setData(data, { deep: false })

  // 同步到 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeEnabled: routeEnabled.value } })
  }
}

/** 从选中节点同步路线配置到本地状态 */
function syncRouteFromNode() {
  const graph = getGraph()
  if (!graph || !element.value || element.value.type !== 'node') {
    routeEnabled.value = false
    nodeRouteId.value = ''
    routeLoop.value = true
    return
  }
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return
  const data = node.getData() || {}
  routeEnabled.value = data.routeEnabled ?? false
  nodeRouteId.value = data.routeId || ''
  // 速度/循环：优先节点覆盖，否则取路线默认
  const route = data.routeId ? routeStore.getRoute(data.routeId) : null
  routeSpeed.value = data.routeSpeed ?? route?.speed ?? 80
  routeLoop.value = data.routeLoop ?? route?.loop ?? true
  applyRouteStateFromNode(data)
}

// 选中元素变化时同步路线状态
watch(() => element.value?.data?.id, () => {
  syncRouteFromNode()
}, { immediate: true })

function onRouteSelect() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeId = nodeRouteId.value || null
  // 设置路线时同步默认速度与循环模式
  const route = nodeRouteId.value ? routeStore.getRoute(nodeRouteId.value) : null
  if (route) {
    data.routeSpeed = route.speed
    routeSpeed.value = route.speed
    data.routeLoop = route.loop
    routeLoop.value = route.loop
  }
  node.setData(data, { deep: false })

  // 同步到 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeId: data.routeId, routeSpeed: data.routeSpeed, routeLoop: data.routeLoop } })
  }
}

function onRouteSpeedChange() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeSpeed = routeSpeed.value
  node.setData(data, { deep: false })

  // 如果正在移动，实时更新速度
  props.canvasRef?.updateRouteConfig?.(element.value.data.id, { speed: routeSpeed.value })
}

/** 循环执行开关：写入节点级覆盖，运行中经 updateRouteConfig 实时生效 */
function onRouteLoopChange() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeLoop = routeLoop.value
  node.setData(data, { deep: false })

  // 同步到 store（节点级覆盖持久化）
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeLoop: routeLoop.value } })
  }

  // 如果正在移动，实时切换循环模式
  props.canvasRef?.updateRouteConfig?.(element.value.data.id, { loop: routeLoop.value })
}

/** 启动运行：从 route store 获取路线，写入 node.data.route 供 X6Canvas 使用 */
function startRouteMove() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(nodeId)
  if (!node?.isNode()) return
  const route = nodeRouteId.value ? routeStore.getRoute(nodeRouteId.value) : null
  if (!route || route.points.length < 2) return
  // 将路线配置写入节点 data（供 RouteService 使用；循环模式取节点级覆盖）
  const data = node.getData() || {}
  node.setData({
    ...data,
    route: { points: route.points, segments: route.segments, speed: routeSpeed.value, loop: routeLoop.value, smooth: route.smooth },
  }, { deep: false })
  props.canvasRef?.toggleRouteMovement?.(nodeId)
}

/** 主按钮：运行（空闲/已结束）→ 暂停（运行中）→ 继续（已暂停） */
function onPrimaryRouteAction() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  if (routeMoving.value && !routePaused.value) {
    props.canvasRef?.pauseRouteMovement?.(nodeId)
  } else if (routePaused.value) {
    props.canvasRef?.resumeRouteMovement?.(nodeId)
  } else {
    startRouteMove()
  }
}

/** 次按钮：结束（运行中/已暂停，节点停在当前位置）或 重置（已结束，回首航点） */
function onSecondaryRouteAction() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  if (routeMoving.value) {
    // toggleRouteMovement 检测到 isMoving 会执行停止
    props.canvasRef?.toggleRouteMovement?.(nodeId)
  } else {
    props.canvasRef?.resetRouteMovement?.(nodeId)
  }
}

// ---------- 路线运动状态实时同步 ----------
// 修复：非循环路线自然走完（或外部停止）后，节点 data.isMoving 已变 false，
// 但面板本地状态无人更新导致按钮卡在“停止”态。现订阅画布 cell:change:data，
// 当前选中节点的路线状态字段变化时实时回填本地镜像。
const ROUTE_STATE_KEYS = ['isMoving', 'routePaused', 'routeFinished']
let routeStateUnsub: (() => void) | null = null

/** 把节点 data 中的路线状态字段同步到本地镜像 */
function applyRouteStateFromNode(data: any) {
  routeMoving.value = data?.isMoving ?? false
  routePaused.value = data?.routePaused ?? false
  routeFinished.value = data?.routeFinished ?? false
}

/** 订阅画布数据变化（graph 实例就绪后只注册一次；graph 无事件 API 时跳过，兼容测试桩） */
function subscribeRouteStateChanges(g: any) {
  if (!g || typeof g.on !== 'function' || routeStateUnsub) return
  const handler = ({ cell, current }: any) => {
    if (!element.value || element.value.type !== 'node') return
    if (cell.id !== element.value.data.id) return
    // 仅响应路线状态字段变化，避免其他 data 写入的无效刷新
    if (!ROUTE_STATE_KEYS.some(k => k in (current || {}))) return
    applyRouteStateFromNode(cell.getData())
  }
  g.on('cell:change:data', handler)
  routeStateUnsub = () => g.off('cell:change:data', handler)
}

// graph 实例由 X6Canvas 挂载后才有（canvasRef.graph 是 ref）：就绪时订阅
watch(
  () => props.canvasRef?.graph?.value ?? props.canvasRef?.graph,
  (g) => { if (g) subscribeRouteStateChanges(g) },
  { immediate: true }
)

onBeforeUnmount(() => {
  // 兜底反注册，避免残留画布监听器
  routeStateUnsub?.()
  routeStateUnsub = null
})

</script>

<style scoped>
/* ===================== 面板整体样式 ===================== */
.property-panel {
  position: relative;
  width: 240px;
  min-width: 200px;
  flex-shrink: 0;
  height: 100%;
  background: var(--panel-bg);
  padding: 18px;
  border-left: 1px solid var(--border-color);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease, padding 0.2s ease;
}

/* 拖动调整宽度期间禁用过渡动画，保证实时跟手 */
.property-panel.resizing {
  transition: none;
}

/* 宽度拖动手柄：贴在面板左缘，hover 时显示高亮提示可拖动 */
.panel-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background-color 0.15s ease;
}
.panel-resize-handle:hover,
.property-panel.resizing .panel-resize-handle {
  background: var(--color-primary);
  opacity: 0.35;
}

/* 滚动内层：面板内容在此纵向滚动（手柄 absolute 定位不受滚动影响） */
.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ===== 折叠态 ===== */
.property-panel.collapsed {
  width: 32px;
  min-width: 32px;
  padding: 8px 2px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
}

.panel-collapse-btn {
  border: none;
  background: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.panel-collapse-btn:hover {
  background: var(--statusbar-bg);
  color: var(--text-primary);
}

/* 折叠态展开图标按钮：仅图标，点击图标展开（样式与组件库 .sidebar-expand-btn 统一） */
.panel-expand-tab {
  border: none;
  background: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-top: 4px;
}
.panel-expand-tab:hover {
  background: var(--statusbar-bg);
  transform: scale(1.1);
}

.property-panel h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.empty {
  color: var(--text-muted);
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}

/* ===================== 字段样式 ===================== */
.field {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}
.field-row {
  display: flex;
  gap: 10px;
}
.field-row .field {
  flex: 1;
  min-width: 0;
}
/* 紧凑字段（ID/名称/类型/标签/X/Y/宽度/高度）：缩短标签列宽与间距 */
.field.field-compact {
  gap: 4px;
}
.field.field-compact label {
  width: 30px;
}
.field label {
  flex-shrink: 0;
  width: 64px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  line-height: 1.2;
}
/* 含帮助按钮（?）的标签：加宽标签列，保证文字与 ? 同行不换行（如「监听字段 ?」） */
.field label:has(.field-help-wrap) {
  width: 76px;
}
.field .hint {
  font-weight: normal;
  color: var(--text-muted);
  font-size: 11px;
}
.field > span {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-primary);
}
/* ID 值：缩小字体并强制单行显示（标准 UUID 可完整单行展示，超长时省略号，完整值见 title 提示） */
.field .id-value {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: -0.5px;
  color: var(--text-secondary);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.field input,
.field select,
.binding-group-card input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-md);
  font-size: 12px;
  box-sizing: border-box;
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-primary);
  box-shadow: var(--shadow-sm, none);
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
.field input:hover:not(:focus):not(:disabled),
.field select:hover:not(:focus):not(:disabled),
.binding-group-card input:hover:not(:focus):not(:disabled) {
  border-color: var(--input-border-hover, var(--color-primary));
}
.field input:focus,
.field select:focus,
.binding-group-card input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--panel-bg);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.field input:disabled,
.field select:disabled {
  background: var(--statusbar-bg);
  color: var(--text-muted);
  cursor: not-allowed;
}
/* select 下拉选项背景跟随面板（部分浏览器 option 继承 body 色，深色主题下防白底黑字刺眼） */
.field select option {
  background: var(--panel-bg);
  color: var(--text-primary);
}

/* ===================== 绑定点组（点ID + 转换函数为一组，按组增删） ===================== */
.binding-group-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
  padding: 8px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--statusbar-bg);
}
.binding-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.binding-group-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--border-light);
}
.binding-group-tag.primary {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.binding-group-card input {
  width: 100%;
}
/* 点组内字段行：小标签 + 输入框同行（标签列固定宽度保证两行对齐） */
.binding-group-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.binding-row-label {
  flex-shrink: 0;
  width: 48px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}
/* 转换函数放大/收起按钮（单行 ⇄ 多行切换） */
.transform-expand-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.transform-expand-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* ===================== 转换函数编辑对话框 ===================== */
/* 半透明遮罩：点击遮罩本身（非对话框）即取消关闭 */
.transform-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.transform-dialog {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.transform-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.transform-dialog-head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.transform-dialog-close {
  border: none;
  background: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.transform-dialog-close:hover {
  background: var(--statusbar-bg);
  color: var(--text-primary);
}
/* 对话框内大编辑区：默认更高，可继续纵向拖拽（双类选择器保证覆盖 .transform-editor 的 min-height） */
.transform-editor.transform-dialog-editor {
  flex: 1;
  min-height: 220px;
}
.transform-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.transform-dialog-btn {
  padding: 5px 16px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--statusbar-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.transform-dialog-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.transform-dialog-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.transform-dialog-btn.primary:hover {
  opacity: 0.9;
  color: #fff;
}
/* 转换函数多行编辑区：等宽字体便于阅读代码，可纵向拖拽调整高度，
   悬停/聚焦状态与普通输入框一致 */
.transform-editor {
  width: 100%;
  box-sizing: border-box;
  min-height: 80px;
  padding: 6px 8px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-md);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  box-shadow: var(--shadow-sm, none);
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
.transform-editor:hover:not(:focus) {
  border-color: var(--input-border-hover, var(--color-primary));
}
.transform-editor:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--panel-bg);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.extra-point-remove {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.extra-point-remove:hover {
  color: #fff;
  background: var(--color-danger, #ff4d4f);
  border-color: var(--color-danger, #ff4d4f);
}
.add-extra-point-btn {
  width: 100%;
  margin-bottom: 6px;
  padding: 4px 0;
  border: 1px dashed var(--input-border, var(--border-color));
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.add-extra-point-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

/* ===================== 画布属性区块样式 ===================== */
/* 分节标题：左侧主题色短条 + 文字 + 右侧渐变分割线，三套主题下均有清晰层次 */
.section-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 6px;
  padding-top: 8px;
  border-top: 1px solid var(--divider-color, var(--border-light));
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.section-divider::before {
  content: '';
  width: 3px;
  height: 10px;
  border-radius: 2px;
  background: var(--color-primary);
  flex-shrink: 0;
}
.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, var(--divider-color, var(--border-light)), transparent);
}
.field .color-input {
  padding: 2px;
  height: 32px;
  cursor: pointer;
}
.checkbox-field {
  gap: 0;
}
.checkbox-field label {
  width: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 12px;
}
.checkbox-field .checkbox-label input[type='checkbox'] {
  width: auto;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}
/* 复选框标签基础样式：框与文字同行且文字不换行（与 .checkbox-field label 对齐） */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;
}
.checkbox-label input[type='checkbox'] {
  width: auto;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}

/* ===================== 标签页栏 ===================== */
.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 10px;
  gap: 2px;
}
.panel-tab {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.panel-tab:hover {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.panel-tab.active {
  color: var(--color-primary);
  font-weight: 600;
  border-bottom-color: var(--color-primary);
}

/* ===================== 事件规则 ===================== */
.empty-hint {
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}
.event-rule {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px;
  margin-bottom: 12px;
  background: var(--statusbar-bg);
}
.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rule-header .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.rule-header .checkbox-label input[type='checkbox'] {
  width: auto;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}
.rule-remove {
  border: none;
  background: none;
  color: var(--color-danger);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.rule-remove:hover {
  background: rgba(239, 68, 68, 0.08);
}
.event-rule .field {
  margin-bottom: 8px;
}
.add-event-btn {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--panel-bg);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}
.add-event-btn:hover {
  background: var(--color-primary-light);
}
.binding-status {
  margin-top: 8px;
  font-size: 12px;
}
.status-active {
  color: var(--color-success);
}
.status-inactive {
  color: var(--text-muted);
}
.status-warning {
  color: var(--color-warning);
}
/* 帮助气泡内嵌的跳转链接（文字链样式，前往数据源管理） */
.no-source-btn {
  padding: 0 2px;
  font-size: inherit;
  border: none;
  background: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.15s;
}
.no-source-btn:hover {
  opacity: 0.75;
}
/* 数据源信息展示 */
.source-info {
  margin: -4px 0 12px;
  padding: 8px 10px;
  background: var(--color-primary-light);
  border: 1px solid var(--color-primary-ring);
  border-radius: var(--radius-md);
}
.source-url {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-primary);
  word-break: break-all;
}
.source-desc {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

/* ===================== 节点图标选择区 ===================== */
.icon-picker {
  position: relative;
  margin-bottom: 10px;
}
.icon-current {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* 当前图标触发按钮（点击展开/收起预设图标面板） */
.icon-picker-trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--statusbar-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: border-color 0.15s, background-color 0.15s;
}
.icon-picker-trigger:hover {
  border-color: var(--color-primary);
}
.icon-picker-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.icon-picker-trigger[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.icon-preview {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
}
.icon-current-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.icon-current-label {
  font-size: 11px;
  color: var(--text-secondary);
}
.icon-picker-caret {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.icon-picker-caret.open {
  transform: rotate(180deg);
}
/* 预设图标下拉面板（紧凑布局：多列小图标 + 限高滚动） */
.icon-picker-panel {
  margin-top: 6px;
  padding: 6px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 150px;
  overflow-y: auto;
}
.icon-reset-btn {
  border: none;
  background: none;
  padding: 2px 0;
  font-size: 11px;
  color: var(--color-primary);
  cursor: pointer;
  transition: opacity 0.15s;
}
.icon-reset-btn:hover {
  opacity: 0.75;
  text-decoration: underline;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 3px;
}
.icon-grid-item {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  padding: 0;
}
.icon-grid-item:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.icon-grid-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.icon-grid-item.active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.icon-file-input {
  display: none;
}
.icon-upload-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-upload-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--panel-bg);
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}
.icon-upload-btn:hover:not(:disabled) {
  background: var(--color-primary-light);
}
.icon-upload-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
/* 上传帮助按钮（? 圆形小按钮，点击展开格式说明） */
.icon-help-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--panel-bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.icon-help-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.icon-help-btn[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
/* 帮助按钮定位容器（弹出气泡以此为锚点） */
.icon-help-wrap {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
}
/* 字段说明帮助按钮（? 圆形小按钮，跟在字段标签文字后面） */
.field-help-wrap {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  margin-left: 3px;
  vertical-align: middle;
}
.field-help-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--panel-bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.field-help-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.field-help-btn[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
/* 字段帮助气泡（绝对定位悬浮在按钮下方，不占布局空间） */
/* 按钮位于标签左侧，气泡左对齐并向右展开，避免溢出面板左边缘 */
.field-help-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 172px;
  padding: 8px 10px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
/* 上传帮助气泡（绝对定位悬浮在按钮下方，不占布局空间） */
.icon-help-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: 172px;
  padding: 8px 10px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.icon-error {
  margin: -2px 0 8px;
  font-size: 11px;
  color: var(--color-danger);
  line-height: 1.4;
}

/* ===================== 响应式适配 ===================== */
@media (max-width: 768px) {
  .property-panel {
    width: 200px;
    padding: 12px;
  }
  .field label {
    font-size: 10px;
  }
  .field input,
  .field select {
    font-size: 11px;
    padding: 4px 8px;
  }
}
@media (max-width: 480px) {
  .property-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 220px;
    height: 100%;
    z-index: 100;
    box-shadow: var(--shadow-lg);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    border-left: none;
  }
  .property-panel:hover {
    transform: translateX(0);
  }
}

/* ===================== AGV 路线配置 ===================== */
.route-actions {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.route-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--statusbar-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.route-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.route-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.route-btn.running {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: #fff;
}
.route-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* 路线运动状态行（四态实时展示） */
.route-state {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
input[type='range'] {
  width: 100%;
  height: 4px;
  accent-color: var(--color-primary);
  cursor: pointer;
}
</style>
