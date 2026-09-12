import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, FileText, UserCheck, GitBranch, Zap, Bell, Square, AlertCircle, CheckCircle2 } from 'lucide-react';

const icons: any = { start: Play, form: FileText, approval: UserCheck, condition: GitBranch, automation: Zap, notify: Bell, end: Square };

function CustomNode({ id, data, type, selected }: NodeProps) {
  const Icon = icons[type || 'form'] || FileText;
  const state = (data as any).state;
  const ruleCount = Array.isArray((data as any).config?.rules) ? (data as any).config.rules.length : 0;
  return (
    <div data-testid={'canvas-node-' + id} data-node-type={type} className={`flow-node ${type} ${state} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-icon">
        <Icon />
      </span>
      <div>
        <small>{type?.toUpperCase()}</small>
        <b>{String((data as any).label)}</b>
        <em>
          {state === 'invalid' ? (
            <>
              <AlertCircle />
              校验失败
            </>
          ) : state === 'valid' ? (
            <>
              <CheckCircle2 />
              校验通过
            </>
          ) : (
            '待配置'
          )}
        </em>
      </div>
      {type === 'condition' && <span className="branches">{ruleCount + 1} 分支</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { start: CustomNode, form: CustomNode, approval: CustomNode, condition: CustomNode, automation: CustomNode, notify: CustomNode, end: CustomNode };

export function FlowCanvas({
  nodes,
  edges,
  onNodes,
  onEdges,
  onSelect,
  highlight,
}: {
  nodes: any[];
  edges: any[];
  onNodes: (n: any[], commit?: boolean) => void;
  onEdges: (e: any[], commit?: boolean) => void;
  onSelect: (id: string | null) => void;
  highlight?: string;
}) {
  /* 只有结构性变化（增删、拖动落点）才写入撤销历史；拖动中间帧、选中、尺寸测量不写入 */
  const nc = useCallback(
    (c: NodeChange[]) => {
      const structural = c.some((ch) => ch.type === 'add' || ch.type === 'remove' || (ch.type === 'position' && !(ch as any).dragging));
      onNodes(applyNodeChanges(c, nodes as any) as any, structural);
    },
    [nodes, onNodes],
  );
  const ec = useCallback(
    (c: EdgeChange[]) => {
      const structural = c.some((ch) => ch.type === 'add' || ch.type === 'remove');
      onEdges(applyEdgeChanges(c, edges as any) as any, structural);
    },
    [edges, onEdges],
  );
  const connect = useCallback((c: Connection) => onEdges(addEdge({ ...c, type: 'smoothstep' }, edges as any) as any), [edges, onEdges]);
  return (
    <div className="canvas-wrap" data-testid="flow-canvas">
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, className: n.id === highlight ? 'runtime-highlight' : '' }))}
        edges={edges.map((e) => ({ ...e, type: 'smoothstep', animated: e.source === highlight, style: { stroke: '#8b6d37', strokeWidth: 1.8 }, labelStyle: { fontSize: 11 } }))}
        nodeTypes={nodeTypes}
        onNodesChange={nc}
        onEdgesChange={ec}
        onConnect={connect}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.35}
      >
        <Background color="#d9d6cc" gap={20} />
        <Controls />
        <MiniMap pannable zoomable nodeColor={(n: any) => (n.type === 'approval' ? '#e8a85b' : '#8aa79b')} />
      </ReactFlow>
    </div>
  );
}
