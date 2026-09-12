import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, File, FilePlus2, Folder, FolderPlus, Trash2, Pencil } from 'lucide-react';

/* Construit un arbre {name, children, path, isFile} depuis les chemins plats. */
export function buildTree(paths) {
  const root = { name: '', children: new Map(), path: '', isFile: false };
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path, isFile, children: new Map() });
      }
      node = node.children.get(part);
    });
  }
  return root;
}

function sortChildren(children) {
  return [...children.values()].sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1; /* dossiers en premier */
    return a.name.localeCompare(b.name);
  });
}

export default function FileTree({ files, activePath, onOpen, onNewFile, onNewFolder, onDelete, onRename }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(new Set());
  const [contextPath, setContextPath] = useState(null);

  function toggle(path) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }

  function renderNodes(nodes, depth = 0) {
    return sortChildren(nodes).map((node) => {
      const isCollapsed = collapsed.has(node.path);
      const children = node.isFile ? [] : renderNodes(node.children, depth + 1);
      return (
        <div key={node.path}>
          <div
            className="flex items-center gap-1 px-2 py-1 cursor-pointer rounded text-sm tree-row group"
            style={{
              paddingLeft: `${8 + depth * 14}px`,
              background: activePath === node.path ? 'var(--panel-2)' : undefined,
            }}
            onClick={() => (node.isFile ? onOpen(node.path) : toggle(node.path))}
          >
            {node.isFile ? (
              <File size={14} className="shrink-0" style={{ color: 'var(--muted)' }} />
            ) : (
              <span className={`shrink-0 inline-block tree-chevron ${isCollapsed ? '' : 'tree-chevron-open'}`}>
                <ChevronRight size={14} />
              </span>
            )}
            {!node.isFile && <Folder size={14} className="shrink-0 text-amber-400" />}
            <span className="truncate flex-1">{node.name}</span>
            {node.isFile && (
              <span className="hidden group-hover:flex gap-1">
                <button
                  className="p-0.5 rounded hover:bg-[var(--border)]"
                  title={t('studio.renameFile')}
                  onClick={(e) => { e.stopPropagation(); onRename(node.path); }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-[var(--border)]"
                  title={t('studio.deleteFile')}
                  onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </span>
            )}
          </div>
          {!node.isFile && !isCollapsed && <div>{children}</div>}
        </div>
      );
    });
  }

  const tree = buildTree(files.map((f) => f.path));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {t('studio.files')}
        </span>
        <div className="flex gap-1">
          <button className="p-1 rounded hover:bg-[var(--panel-2)]" title={t('studio.newFile')} onClick={onNewFile}>
            <FilePlus2 size={14} />
          </button>
          <button className="p-1 rounded hover:bg-[var(--panel-2)]" title={t('studio.newFolder')} onClick={onNewFolder}>
            <FolderPlus size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {renderNodes(tree.children)}
        {files.length === 0 && (
          <p className="text-xs px-3 py-2" style={{ color: 'var(--muted)' }}>{t('studio.noFiles')}</p>
        )}
      </div>
    </div>
  );
}
