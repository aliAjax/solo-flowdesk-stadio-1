import { create } from 'zustand';
import { workflows as seed } from '../../mock-data/workflows';
import { instances as seedInstances } from '../../mock-data/instances';
import type { FlowEdge, FlowNode, ValidationIssue, Workflow } from '../types';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/* ---------- 本地持久化：刷新后数据仍在 ---------- */
const STORAGE_KEY = 'flowdesk-studio-v1';

type Persisted = { workflows: Workflow[]; instances: typeof seedInstances };

const loadPersisted = (): Persisted | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.workflows) || !Array.isArray(parsed.instances)) return null;
    return parsed as Persisted;
  } catch {
    return null;
  }
};

let persistTimer: ReturnType<typeof setTimeout> | undefined;
const persistNow = (state: Persisted) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflows: state.workflows, instances: state.instances }));
  } catch {
    /* 存储不可用时静默降级为内存态 */
  }
};
const schedulePersist = (state: Persisted) => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistNow(state), 250);
};

/* ---------- 发布前校验 ---------- */
const validate = (w: Workflow): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!w.nodes.some((n) => n.type === 'start')) {
    issues.push({ nodeId: w.nodes[0]?.id || 'flow', level: 'error', message: '流程缺少开始节点' });
  }
  if (!w.nodes.some((n) => n.type === 'end')) {
    issues.push({ nodeId: w.nodes[0]?.id || 'flow', level: 'error', message: '流程缺少结束节点' });
  }
  /* 开始节点必须有出线且无入线，结束节点必须有入线且无出线，与中间节点一样参与校验 */
  w.nodes.forEach((n) => {
    if (n.type === 'start') {
      if (!w.edges.some((e) => e.source === n.id)) {
        issues.push({ nodeId: n.id, level: 'error', message: '开始节点缺少连线' });
      }
      if (w.edges.some((e) => e.target === n.id)) {
        issues.push({ nodeId: n.id, level: 'error', message: '开始节点不应有入线' });
      }
    }
    if (n.type === 'end') {
      if (!w.edges.some((e) => e.target === n.id)) {
        issues.push({ nodeId: n.id, level: 'error', message: '结束节点缺少连线' });
      }
      if (w.edges.some((e) => e.source === n.id)) {
        issues.push({ nodeId: n.id, level: 'error', message: '结束节点不应有出线' });
      }
    }
  });
  const linked = new Set(w.edges.flatMap((e) => [e.source, e.target]));
  w.nodes
    .filter((n) => n.type !== 'start' && n.type !== 'end' && !linked.has(n.id))
    .forEach((n) => issues.push({ nodeId: n.id, level: 'error', message: '必经节点不能孤立' }));
  w.nodes.forEach((n) => {
    const c = n.data.config;
    if (n.type === 'condition') {
      const rules: any[] = Array.isArray(c.rules) ? c.rules : [];
      const broken = !rules.length || rules.some((r) => !r.field || (r.operator !== '为空' && (r.value === undefined || r.value === '')));
      if (broken) issues.push({ nodeId: n.id, level: 'error', message: '条件分支规则未配置' });
    }
    if (n.type === 'approval') {
      const missing =
        !c.approverSource ||
        (c.approverSource === '指定成员' && !c.member) ||
        (c.approverSource === '固定角色' && c.role === '');
      if (missing) issues.push({ nodeId: n.id, level: 'error', message: '审批人不能为空' });
    }
  });
  return issues;
};

/* ---------- 撤销 / 重做历史 ---------- */
interface Snapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
const HISTORY_LIMIT = 50;

/* toast 带唯一 key，相同文案连续触发时也会重新计时自动消失 */
export interface Toast {
  key: number;
  text: string;
}
const makeToast = (text: string): Toast => ({ key: Date.now() + Math.random(), text });

interface State {
  workflows: Workflow[];
  instances: typeof seedInstances;
  currentId: string;
  selectedNodeId: string | null;
  issues: ValidationIssue[];
  toast: Toast | null;
  past: Snapshot[];
  future: Snapshot[];
  setCurrent: (id: string) => void;
  selectNode: (id: string | null) => void;
  updateNodes: (nodes: FlowNode[], commit?: boolean) => void;
  updateEdges: (edges: FlowEdge[], commit?: boolean) => void;
  updateConfig: (id: string, config: Record<string, any>) => void;
  duplicateNode: (id: string) => void;
  removeNode: (id: string) => void;
  undo: () => void;
  redo: () => void;
  runValidation: () => ValidationIssue[];
  save: () => void;
  publish: () => void;
  create: () => string;
  copy: (id: string) => void;
  archive: (id: string) => void;
  restore: (v: number) => void;
  clearToast: () => void;
}

const persisted = loadPersisted();
const current = (s: State) => s.workflows.find((w) => w.id === s.currentId)!;
const withWorkflow = (s: State, patch: Partial<Workflow>) =>
  s.workflows.map((w) => (w.id === s.currentId ? { ...w, ...patch } : w));
/** 在变更前把当前图画入撤销栈，并清空重做栈 */
const pushHistory = (s: State): Pick<State, 'past' | 'future'> => {
  const w = current(s);
  return {
    past: [...s.past.slice(-(HISTORY_LIMIT - 1)), { nodes: clone(w.nodes), edges: clone(w.edges) }],
    future: [],
  };
};

export const useAppStore = create<State>((set, get) => ({
  workflows: persisted?.workflows ?? clone(seed),
  instances: persisted?.instances ?? clone(seedInstances),
  currentId: persisted?.workflows?.[0]?.id ?? 'wf-1',
  selectedNodeId: null,
  issues: [],
  toast: null,
  past: [],
  future: [],

  setCurrent: (id) => set({ currentId: id, selectedNodeId: null, issues: [], past: [], future: [] }),
  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodes: (nodes, commit = true) =>
    set((s) => ({ ...(commit ? pushHistory(s) : {}), workflows: withWorkflow(s, { nodes }) })),
  updateEdges: (edges, commit = true) =>
    set((s) => ({ ...(commit ? pushHistory(s) : {}), workflows: withWorkflow(s, { edges }) })),

  updateConfig: (id, config) =>
    set((s) => ({
      ...pushHistory(s),
      workflows: withWorkflow(s, {
        nodes: current(s).nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config }, state: 'configuring' } } : n,
        ),
      }),
    })),

  duplicateNode: (id) =>
    set((s) => {
      const w = current(s);
      const source = w.nodes.find((n) => n.id === id);
      if (!source) return {};
      const copyNode: FlowNode = {
        ...clone(source),
        id: `${source.type}-copy-${Date.now()}`,
        position: { x: source.position.x + 48, y: source.position.y + 48 },
        data: { ...clone(source.data), label: `${source.data.label} 副本` },
      };
      return {
        ...pushHistory(s),
        workflows: withWorkflow(s, { nodes: [...w.nodes, copyNode] }),
        selectedNodeId: copyNode.id,
        toast: makeToast('节点已复制'),
      };
    }),

  removeNode: (id) =>
    set((s) => {
      const w = current(s);
      return {
        ...pushHistory(s),
        workflows: withWorkflow(s, {
          nodes: w.nodes.filter((n) => n.id !== id),
          edges: w.edges.filter((e) => e.source !== id && e.target !== id),
        }),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      };
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      const w = current(s);
      return {
        past: s.past.slice(0, -1),
        future: [{ nodes: clone(w.nodes), edges: clone(w.edges) }, ...s.future].slice(0, HISTORY_LIMIT),
        workflows: withWorkflow(s, { nodes: prev.nodes, edges: prev.edges }),
        selectedNodeId: null,
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      const w = current(s);
      return {
        future: s.future.slice(1),
        past: [...s.past, { nodes: clone(w.nodes), edges: clone(w.edges) }].slice(-HISTORY_LIMIT),
        workflows: withWorkflow(s, { nodes: next.nodes, edges: next.edges }),
        selectedNodeId: null,
      };
    }),

  runValidation: () => {
    const w = current(get());
    const issues = validate(w);
    set((s) => ({
      issues,
      workflows: s.workflows.map((x) =>
        x.id === w.id
          ? {
              ...x,
              nodes: x.nodes.map((n) => ({
                ...n,
                data: { ...n.data, state: issues.some((i) => i.nodeId === n.id) ? 'invalid' : 'valid' },
              })),
            }
          : x,
      ),
      toast: makeToast(issues.length ? `发现 ${issues.length} 个问题` : '校验通过'),
    }));
    return issues;
  },

  save: () =>
    set((s) => ({
      workflows: withWorkflow(s, { status: 'draft', updatedAt: '2026-07-11 16:30' }),
      toast: makeToast('草稿已保存'),
    })),

  publish: () =>
    set((s) => {
      const w = current(s);
      return {
        workflows: withWorkflow(s, {
          status: 'published',
          version: w.version + 1,
          publishedAt: '2026-07-11 16:35',
          updatedAt: '2026-07-11 16:35',
          versions: [
            ...w.versions,
            {
              version: w.version + 1,
              createdAt: '2026-07-11 16:35',
              note: '发布最新审批配置',
              nodes: clone(w.nodes),
              edges: clone(w.edges),
            },
          ],
        }),
        toast: makeToast('流程发布成功'),
      };
    }),

  create: () => {
    const id = 'wf-' + Date.now();
    set((s) => ({
      workflows: [
        {
          id,
          name: '未命名流程',
          domain: '财务',
          status: 'draft',
          version: 0,
          editor: '林秋',
          updatedAt: '2026-07-11 16:40',
          abnormalCount: 0,
          nodes: [],
          edges: [],
          versions: [],
        },
        ...s.workflows,
      ],
      currentId: id,
      past: [],
      future: [],
    }));
    return id;
  },

  copy: (id) =>
    set((s) => {
      const w = s.workflows.find((x) => x.id === id)!;
      return {
        workflows: [
          { ...clone(w), id: 'wf-' + Date.now(), name: w.name + '（副本）', status: 'draft' },
          ...s.workflows,
        ],
      };
    }),

  archive: (id) =>
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? { ...w, status: 'archived' } : w)),
    })),

  restore: (v) =>
    set((s) => {
      const w = current(s);
      const old = w.versions.find((x) => x.version === v)!;
      return {
        workflows: withWorkflow(s, { status: 'draft', nodes: clone(old.nodes), edges: clone(old.edges) }),
        past: [],
        future: [],
        toast: makeToast(`已恢复 v${v} 为草稿`),
      };
    }),

  clearToast: () => set({ toast: null }),
}));

/* 任意状态变化后持久化（防抖），保证刷新后数据仍在 */
useAppStore.subscribe((s) => schedulePersist({ workflows: s.workflows, instances: s.instances }));

/* 页面关闭 / 刷新前立即落盘，避免防抖窗口内丢失最后一次变更 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    clearTimeout(persistTimer);
    const s = useAppStore.getState();
    persistNow({ workflows: s.workflows, instances: s.instances });
  });
}
