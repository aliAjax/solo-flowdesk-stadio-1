import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  FileClock,
  Play,
  Plus,
  Redo2,
  Save,
  Send,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import { FlowCanvas } from '../components/FlowCanvas';
import { useAppStore } from '../store/useAppStore';
import { roles, users } from '../../mock-data/catalog';
import type { ConditionRule, FlowNode, FormField, NodeKind } from '../types';

const palette: [NodeKind, string, string][] = [
  ['start', '开始', '流程入口'],
  ['form', '表单填写', '收集业务数据'],
  ['approval', '审批', '人工审批任务'],
  ['condition', '条件分支', '按规则分流'],
  ['automation', '自动化', '执行本地动作'],
  ['notify', '通知', '发送站内通知'],
  ['end', '结束', '流程终点'],
];

const OPERATORS = ['>', '<', '>=', '<=', '=', '为空'];
const FIELD_TYPES: FormField['type'][] = ['text', 'number', 'amount', 'date', 'select', 'attachment'];

export function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const store = useAppStore();
  const w = store.workflows.find((x) => x.id === store.currentId) || store.workflows[0];
  const selected = w.nodes.find((n) => n.id === store.selectedNodeId);

  useEffect(() => {
    if (id && id !== store.currentId) store.setCurrent(id);
  }, [id]);

  /* Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useAppStore.getState().redo();
        else useAppStore.getState().undo();
      } else if (key === 'y') {
        e.preventDefault();
        useAppStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const add = (type: NodeKind) => {
    const node: FlowNode = {
      id: type + '-' + Date.now(),
      type,
      position: { x: 350 + Math.random() * 200, y: 200 + Math.random() * 150 },
      data: { label: palette.find((x) => x[0] === type)![1], state: 'unconfigured', config: {} },
    };
    store.updateNodes([...w.nodes, node]);
  };

  /* 发布门禁在 store 的 publish 动作内部，这里直接调用即可 */
  const publish = () => store.publish();

  return (
    <div className="editor-page">
      <div className="editor-top">
        <button className="icon-btn" onClick={() => nav('/workflows')}>
          <ArrowLeft />
        </button>
        <div className="editor-title">
          <small>流程管理 / {w.domain}</small>
          <b>{w.name}</b>
        </div>
        <span className="draft-indicator">{w.status === 'draft' ? '● 草稿' : '✓ 已发布'} · v{w.version}</span>
        <div className="editor-actions">
          <button className="secondary" onClick={store.save}>
            <Save />
            保存草稿
          </button>
          <button className="secondary" data-testid="validate-button" onClick={store.runValidation}>
            <Play />
            运行校验
          </button>
          <button className="secondary" onClick={() => nav(`/workflows/${w.id}/preview`)}>
            <Eye />
            预览
          </button>
          <button className="secondary" onClick={() => nav(`/workflows/${w.id}/versions`)}>
            <FileClock />
            版本历史
          </button>
          <button data-testid="publish-button" onClick={publish}>
            <Send />
            发布
          </button>
        </div>
      </div>
      <div className="editor-body">
        <aside className="node-library">
          <div className="pane-title">
            <b>节点组件</b>
            <small>点击添加到画布</small>
          </div>
          <div className="node-search">搜索节点组件</div>
          <h4>基础节点</h4>
          {palette.map(([type, label, desc]) => (
            <button key={type} className={'palette ' + type} onClick={() => add(type)}>
              <span>+</span>
              <div>
                <b>{label}</b>
                <small>{desc}</small>
              </div>
            </button>
          ))}
          <div className="library-tip">
            <b>使用提示</b>
            <p>拖动节点调整布局，从端点连接下一步骤。Ctrl+Z 撤销，Ctrl+Shift+Z 重做。</p>
          </div>
        </aside>
        <section className="editor-center">
          <div className="canvas-bar">
            <span>主流程</span>
            <span className="spacer" />
            <button className="icon-btn" data-testid="undo-button" title="撤销 (Ctrl+Z)" disabled={!store.past.length} onClick={store.undo}>
              <Undo2 />
            </button>
            <button className="icon-btn" data-testid="redo-button" title="重做 (Ctrl+Shift+Z)" disabled={!store.future.length} onClick={store.redo}>
              <Redo2 />
            </button>
            <small>100%</small>
          </div>
          {w.nodes.length ? (
            <FlowCanvas nodes={w.nodes} edges={w.edges} onNodes={store.updateNodes} onEdges={store.updateEdges} onSelect={store.selectNode} />
          ) : (
            <div className="blank-flow">
              <div>⌘</div>
              <b>从一个开始节点构建流程</b>
              <p>在左侧点击节点组件，将它添加到画布。</p>
              <button onClick={() => add('start')}>
                <Plus />
                添加开始节点
              </button>
            </div>
          )}
        </section>
        <ConfigPanel node={selected} update={store.updateConfig} />
      </div>
      <section className="issues" data-testid="issues-panel">
        <div className="issues-head">
          <b>问题面板</b>
          <span className="error-count" data-testid="error-count">
            {store.issues.filter((i) => i.level === 'error').length} 错误
          </span>
          <span>{store.issues.filter((i) => i.level === 'warning').length} 警告</span>
          <span className="spacer" />
          <small>上次校验：刚刚</small>
          <ChevronDown />
        </div>
        {store.issues.length > 0 && (
          <div className="issue-list">
            {store.issues.map((i, k) => (
              <button key={i.nodeId + '-' + k} onClick={() => store.selectNode(i.nodeId)}>
                <XCircle />
                <b>{i.message}</b>
                <small>节点：{w.nodes.find((n) => n.id === i.nodeId)?.data.label || '流程'}</small>
                <span>定位 →</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const blankRule = (): ConditionRule => ({ id: 'rule-' + Date.now(), field: '', operator: '>', value: '', branch: '' });

function ConfigPanel({ node, update }: { node?: FlowNode; update: (id: string, c: Record<string, any>) => void }) {
  const [saved, setSaved] = useState(false);
  const duplicateNode = useAppStore((s) => s.duplicateNode);
  const removeNode = useAppStore((s) => s.removeNode);
  if (!node)
    return (
      <aside className="config-panel empty-config">
        <div>◫</div>
        <b>选择一个节点</b>
        <p>在画布中选择节点以查看和编辑配置。</p>
      </aside>
    );
  const c = node.data.config;
  const set = (v: Record<string, any>) => {
    update(node.id, v);
    setSaved(false);
  };

  /* ---- 条件节点：多条带优先级的规则 ---- */
  const rules: ConditionRule[] = Array.isArray(c.rules) && c.rules.length ? c.rules : [blankRule()];
  const setRules = (next: ConditionRule[]) => set({ rules: next });
  const patchRule = (idx: number, patch: Partial<ConditionRule>) => setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const moveRule = (idx: number, dir: -1 | 1) => {
    const next = [...rules];
    const [item] = next.splice(idx, 1);
    next.splice(idx + dir, 0, item);
    setRules(next);
  };

  /* ---- 表单节点：字段维护 ---- */
  const fields: FormField[] = Array.isArray(c.fields) ? c.fields : [];
  const setFields = (next: FormField[]) => set({ fields: next });
  const patchField = (fid: string, patch: Partial<FormField>) => setFields(fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)));

  return (
    <aside className="config-panel" data-testid="config-panel">
      <div className="config-head">
        <div>
          <small>{node.type.toUpperCase()} NODE</small>
          <h3>{node.data.label}</h3>
        </div>
        <div className="config-head-actions">
          <button className="icon-btn" data-testid="duplicate-node" title="复制节点" onClick={() => duplicateNode(node.id)}>
            <Copy />
          </button>
          <button className="icon-btn" data-testid="remove-node" title="删除节点" onClick={() => removeNode(node.id)}>
            <Trash2 />
          </button>
        </div>
      </div>
      <label>
        节点名称
        <input value={node.data.label} readOnly />
      </label>

      {node.type === 'approval' && (
        <>
          <h4>审批配置</h4>
          <label>
            审批人来源
            <select aria-label="审批人来源" value={c.approverSource || ''} onChange={(e) => set({ approverSource: e.target.value })}>
              <option value="">请选择审批人来源</option>
              <option>直属主管</option>
              <option>固定角色</option>
              <option>指定成员</option>
              <option>表单字段</option>
            </select>
          </label>
          {c.approverSource === '固定角色' && (
            <label>
              审批角色
              <select aria-label="审批角色" value={c.role || roles[0]} onChange={(e) => set({ role: e.target.value })}>
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
          {c.approverSource === '指定成员' && (
            <label>
              审批成员
              <select aria-label="审批成员" value={c.member || ''} onChange={(e) => set({ member: e.target.value })}>
                <option value="">请选择成员</option>
                {users.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            审批说明
            <textarea rows={5} value={c.instruction || ''} onChange={(e) => set({ instruction: e.target.value })} placeholder="输入审批说明" />
          </label>
        </>
      )}

      {node.type === 'condition' && (
        <>
          <h4>分支规则（按优先级依次匹配）</h4>
          {rules.map((r, idx) => (
            <div className="rule-card" data-testid="rule-card" key={r.id}>
              <div className="rule-head">
                <span className="prio">优先级 {idx + 1}</span>
                <div className="rule-actions">
                  <button className="icon-btn" aria-label={`上移规则${idx + 1}`} disabled={idx === 0} onClick={() => moveRule(idx, -1)}>
                    <ArrowUp />
                  </button>
                  <button className="icon-btn" aria-label={`下移规则${idx + 1}`} disabled={idx === rules.length - 1} onClick={() => moveRule(idx, 1)}>
                    <ArrowDown />
                  </button>
                  <button className="icon-btn" aria-label={`删除规则${idx + 1}`} onClick={() => setRules(rules.filter((_, i) => i !== idx))}>
                    <Trash2 />
                  </button>
                </div>
              </div>
              <label>
                判断字段
                <select
                  aria-label={idx === 0 ? '条件字段' : `规则${idx + 1}字段`}
                  value={r.field}
                  onChange={(e) => patchRule(idx, { field: e.target.value })}
                >
                  <option value="">请选择字段</option>
                  <option value="amount">申请金额</option>
                  <option value="department">部门</option>
                  <option value="attachment">附件</option>
                </select>
              </label>
              <div className="form-row">
                <label>
                  运算符
                  <select
                    aria-label={idx === 0 ? '条件运算符' : `规则${idx + 1}运算符`}
                    value={r.operator}
                    onChange={(e) => patchRule(idx, { operator: e.target.value as ConditionRule['operator'] })}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op}>{op}</option>
                    ))}
                  </select>
                </label>
                <label>
                  比较值
                  <input
                    aria-label={idx === 0 ? '条件比较值' : `规则${idx + 1}比较值`}
                    type="number"
                    disabled={r.operator === '为空'}
                    value={r.value ?? ''}
                    onChange={(e) => patchRule(idx, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </label>
              </div>
              <label>
                命中分支
                <input
                  aria-label={idx === 0 ? '条件分支名称' : `规则${idx + 1}分支名称`}
                  value={r.branch}
                  placeholder="例如：高额分支：通知财务审批人"
                  onChange={(e) => patchRule(idx, { branch: e.target.value })}
                />
              </label>
            </div>
          ))}
          <button className="secondary mini" data-testid="add-rule" onClick={() => setRules([...rules, blankRule()])}>
            <Plus />
            添加规则
          </button>
          <div className="branch-card">
            <b>默认分支</b>
            <span>所有规则均未命中时进入默认分支</span>
          </div>
        </>
      )}

      {node.type === 'form' && (
        <>
          <h4>表单字段</h4>
          {fields.map((f) => (
            <div key={f.id} className="field-chip" data-testid="field-chip">
              <div className="field-chip-head">
                <input aria-label={`字段名-${f.label}`} value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value })} />
                <button className="icon-btn" aria-label={`删除字段-${f.label}`} onClick={() => setFields(fields.filter((x) => x.id !== f.id))}>
                  <Trash2 />
                </button>
              </div>
              <div className="field-chip-meta">
                <select aria-label={`类型-${f.label}`} value={f.type} onChange={(e) => patchField(f.id, { type: e.target.value as FormField['type'] })}>
                  {FIELD_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label className="req">
                  <input
                    type="checkbox"
                    aria-label={`必填-${f.label}`}
                    checked={f.required}
                    onChange={(e) => patchField(f.id, { required: e.target.checked })}
                  />
                  必填
                </label>
              </div>
            </div>
          ))}
          <button
            className="secondary mini"
            data-testid="add-field"
            onClick={() => setFields([...fields, { id: 'field-' + Date.now(), label: '新字段', type: 'text', required: false }])}
          >
            <Plus />
            添加字段
          </button>
        </>
      )}

      {node.type === 'automation' && (
        <>
          <h4>本地动作</h4>
          <label>
            执行动作
            <select value={c.action || ''} onChange={(e) => set({ action: e.target.value })}>
              <option>创建工单</option>
              <option>发送 Webhook（模拟）</option>
              <option>写入系统记录</option>
            </select>
          </label>
        </>
      )}

      {node.type === 'notify' && (
        <>
          <h4>通知设置</h4>
          <label>
            通知对象
            <input value={c.targets || ''} onChange={(e) => set({ targets: e.target.value })} />
          </label>
          <label>
            消息模板
            <textarea value={c.template || ''} onChange={(e) => set({ template: e.target.value })} />
          </label>
        </>
      )}

      <div className="config-footer">
        <span>{saved ? (
          <>
            <CheckCircle2 />
            配置已保存
          </>
        ) : (
          '尚有未保存更改'
        )}</span>
        <button data-testid="save-node-config" onClick={() => setSaved(true)}>
          保存配置
        </button>
      </div>
    </aside>
  );
}
