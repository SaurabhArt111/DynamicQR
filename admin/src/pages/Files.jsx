import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, File, Files as FilesIcon, Folder, FolderOpen, RefreshCw, HardDrive } from 'lucide-react';
import { api } from '../api/http.js';
import { formatBytes, formatDate } from '../utils/format.js';
import './Files.css';

function TreeNode({ node, depth=0 }) {
  const [open,setOpen]=useState(depth<1);
  const isFolder=node.type==='folder';
  return <div className="file-tree-node">
    <button className="file-tree-row" style={{paddingLeft:12+depth*22}} onClick={()=>isFolder&&setOpen(v=>!v)} disabled={!isFolder}>
      {isFolder ? (open?<ChevronDown size={15}/>:<ChevronRight size={15}/>) : <span className="tree-indent"/>}
      {isFolder ? (open?<FolderOpen size={17}/>:<Folder size={17}/>) : <File size={16}/>}
      <span className="file-tree-name">{node.name}</span>
      {isFolder ? <span className="file-tree-meta">{node.children?.length || 0} items</span> : <span className="file-tree-meta">{formatBytes(node.size)} · {formatDate(node.modifiedAt)}</span>}
    </button>
    {isFolder && open && node.children?.map(child=><TreeNode key={child.path} node={child} depth={depth+1}/>)}
  </div>
}

export default function Files(){
  const [data,setData]=useState(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  async function load(){setLoading(true);setError('');try{const r=await api.get('/files');setData(r.data)}catch(e){setError(e.response?.data?.message||'Unable to read the uploads directory.')}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const summary=useMemo(()=>data?.summary||{files:0,folders:0,bytes:0},[data]);
  return <section className="page files-page">
    <div className="page-header"><div><span className="eyebrow"><HardDrive size={13}/> Storage browser</span><h1>Uploads</h1><p>Browse the server uploads directory. This page is read-only by design — files cannot be deleted here.</p></div><button className="secondary-button" onClick={load} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/>Refresh</button></div>
    <div className="file-summary"><div><strong>{summary.files}</strong><span>Files</span></div><div><strong>{summary.folders}</strong><span>Folders</span></div><div><strong>{formatBytes(summary.bytes)}</strong><span>Total storage</span></div></div>
    <section className="file-browser glass-card"><div className="file-browser-head"><div><FilesIcon size={18}/><strong>uploads/</strong></div><span>Read-only</span></div>{loading?<div className="file-empty"><span className="spinner"/>Loading files…</div>:error?<div className="file-empty">{error}</div>:data?.tree?.length?data.tree.map(node=><TreeNode key={node.path} node={node}/>):<div className="file-empty">No uploaded files found.</div>}</section>
  </section>
}
