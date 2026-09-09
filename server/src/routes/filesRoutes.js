import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';
import { uploadRoot } from '../utils/storage.js';
import { asyncRouter } from '../utils/asyncRouter.js';
const router=asyncRouter(express.Router());
async function walk(dir, relative=''){
  const entries=await fs.readdir(dir,{withFileTypes:true}); const out=[];
  for(const entry of entries){
    const abs=path.join(dir,entry.name); const rel=path.join(relative,entry.name).replaceAll('\\','/');
    const stat=await fs.stat(abs);
    if(entry.isDirectory()) out.push({type:'folder',name:entry.name,path:rel,modifiedAt:stat.mtime.toISOString(),children:await walk(abs,rel)});
    else out.push({type:'file',name:entry.name,path:rel,size:stat.size,modifiedAt:stat.mtime.toISOString()});
  }
  return out.sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='folder'?-1:1);
}
function summarize(nodes){let files=0,folders=0,bytes=0; for(const n of nodes){if(n.type==='folder'){folders++; const s=summarize(n.children||[]);files+=s.files;folders+=s.folders;bytes+=s.bytes}else{files++;bytes+=n.size||0}} return {files,folders,bytes}}
router.get('/',requireAuth,async(req,res)=>{await fs.mkdir(uploadRoot,{recursive:true});const tree=await walk(uploadRoot);res.json({root:uploadRoot,tree,summary:summarize(tree),readOnly:true})});
export default router;
