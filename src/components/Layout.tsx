import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Boxes, LayoutDashboard, Workflow, Activity, Search, Bell, HelpCircle, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const TOAST_DURATION = 3000;

export function Layout() {
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  /* 提示自动消失，避免长期遮挡操作按钮 */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">F</span>
          <b>FlowDesk</b>
          <small>STUDIO</small>
        </div>
        <nav>
          <NavLink to="/">
            <LayoutDashboard />
            总览
          </NavLink>
          <NavLink to="/workflows">
            <Workflow />
            流程管理
          </NavLink>
          <NavLink to="/monitor">
            <Activity />
            运行监控
          </NavLink>
        </nav>
        <div className="side-bottom">
          <span>
            <Boxes />
            组件中心
          </span>
          <span>
            <HelpCircle />
            帮助中心
          </span>
          <div className="user">
            <i>林</i>
            <div>
              林秋<small>平台管理员</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="global-search">
            <Search />
            搜索流程、实例或申请人
          </div>
          <div className="header-actions">
            <Bell />
            <span>企业工作区</span>
            <i>林</i>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      {toast && (
        <div className="toast" role="status" key={toast.key}>
          <span>✓ {toast.text}</span>
          <button className="toast-close" aria-label="关闭提示" onClick={clearToast}>
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
