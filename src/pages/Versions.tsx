import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GitCompare, History, RotateCcw } from 'lucide-react';
import { PageTitle } from '../components/common';
import { useAppStore } from '../store/useAppStore';
import type { FlowEdge, FlowNode } from '../types';

/* 连线以「起点 → 终点」为身份：端点变化即使数量不变也算差异 */
const edgeKey = (e: FlowEdge) => `${e.source}->${e.target}`;
const nodeLabel = (nodes: FlowNode[], id: string) => nodes.find((n) => n.id === id)?.data.label || id;
const edgeLabel = (nodes: FlowNode[], e: FlowEdge) => `${nodeLabel(nodes, e.source)} → ${nodeLabel(nodes, e.target)}`;

export function Versions() {
  const { id } = useParams();
  const nav = useNavigate();
  const store = useAppStore();
  const w = store.workflows.find((x) => x.id === id)!;
  const all = [...w.versions].sort((a, b) => b.version - a.version);
  const [left, setLeft] = useState(all.at(-1)?.version || 1);
  const [right, setRight] = useState(all[0]?.version || w.version);
  const a = all.find((v) => v.version === left);
  const b = all.find((v) => v.version === right);

  const diff = useMemo(() => {
    if (!a || !b) return { added: [] as FlowNode[], removed: [] as FlowNode[], changed: [] as FlowNode[], addedEdges: [] as FlowEdge[], removedEdges: [] as FlowEdge[] };
    const aEdgeKeys = new Set(a.edges.map(edgeKey));
    const bEdgeKeys = new Set(b.edges.map(edgeKey));
    return {
      added: b.nodes.filter((n) => !a.nodes.some((x) => x.id === n.id)),
      removed: a.nodes.filter((n) => !b.nodes.some((x) => x.id === n.id)),
      changed: b.nodes.filter((n) => {
        const old = a.nodes.find((x) => x.id === n.id);
        return old && JSON.stringify(old.data.config) !== JSON.stringify(n.data.config);
      }),
      addedEdges: b.edges.filter((e) => !aEdgeKeys.has(edgeKey(e))),
      removedEdges: a.edges.filter((e) => !bEdgeKeys.has(edgeKey(e))),
    };
  }, [a, b]);

  const restore = () => {
    store.setCurrent(w.id);
    store.restore(left);
    nav(`/workflows/${w.id}`);
  };

  return (
    <div className="page versions-page">
      <button className="back-link" onClick={() => nav(`/workflows/${id}`)}>
        <ArrowLeft />
        返回编辑器
      </button>
      <PageTitle eyebrow="流程版本" title="Version History" desc={`${w.name} · 查看发布记录、比较结构差异或恢复历史版本。`} />
      <div className="version-layout">
        <aside className="panel version-list">
          <h3>
            <History />
            版本记录
          </h3>
          {all.map((v, i) => (
            <button key={v.version} className={v.version === right ? 'active' : ''} onClick={() => setRight(v.version)}>
              <span>
                <b>v{v.version}</b>
                {i === 0 && <em>当前</em>}
              </span>
              <small>{v.createdAt}</small>
              <p>{v.note}</p>
            </button>
          ))}
        </aside>
        <section className="panel compare" data-testid="version-compare">
          <div className="compare-head">
            <div>
              <GitCompare />
              <h2>版本对比</h2>
            </div>
            <button className="secondary" data-testid="restore-version" onClick={restore}>
              <RotateCcw />
              恢复 v{left} 为草稿
            </button>
          </div>
          <div className="compare-select">
            <label>
              基准版本
              <select value={left} onChange={(e) => setLeft(Number(e.target.value))}>
                {all.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {v.createdAt}
                  </option>
                ))}
              </select>
            </label>
            <span>→</span>
            <label>
              比较版本
              <select value={right} onChange={(e) => setRight(Number(e.target.value))}>
                {all.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {v.createdAt}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="diff-summary">
            <article>
              <small>新增节点</small>
              <b>{diff.added.length}</b>
            </article>
            <article>
              <small>删除节点</small>
              <b>{diff.removed.length}</b>
            </article>
            <article>
              <small>配置变化</small>
              <b>{diff.changed.length}</b>
            </article>
            <article>
              <small>连线变化</small>
              <b data-testid="edge-diff-count">{diff.addedEdges.length + diff.removedEdges.length}</b>
            </article>
          </div>
          <div className="diff-list">
            <h3>变更明细</h3>
            {diff.added.map((n) => (
              <div key={n.id} className="diff added">
                <span>＋ 新增</span>
                <b>{n.data.label}</b>
                <small>{n.type} 节点</small>
              </div>
            ))}
            {diff.removed.map((n) => (
              <div key={n.id} className="diff removed">
                <span>− 删除</span>
                <b>{n.data.label}</b>
                <small>{n.type} 节点</small>
              </div>
            ))}
            {diff.changed.map((n) => (
              <div key={n.id} className="diff changed">
                <span>~ 配置</span>
                <b>{n.data.label}</b>
                <small>节点配置已更新</small>
              </div>
            ))}
            {diff.addedEdges.map((e) => (
              <div key={'ea-' + edgeKey(e)} className="diff added" data-testid="edge-diff">
                <span>＋ 连线</span>
                <b>{edgeLabel(b?.nodes || [], e)}</b>
                <small>{e.label || '新增连线'}</small>
              </div>
            ))}
            {diff.removedEdges.map((e) => (
              <div key={'er-' + edgeKey(e)} className="diff removed" data-testid="edge-diff">
                <span>− 连线</span>
                <b>{edgeLabel(a?.nodes || [], e)}</b>
                <small>{e.label || '移除连线'}</small>
              </div>
            ))}
            {!diff.added.length && !diff.removed.length && !diff.changed.length && !diff.addedEdges.length && !diff.removedEdges.length && (
              <div className="empty-diff">这两个版本的节点结构一致</div>
            )}
            <div className="release-note">
              <small>发布说明</small>
              <p>{b?.note}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
