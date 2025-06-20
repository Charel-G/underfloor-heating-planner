// glpk.js is published as a UMD build which expects `module` in
// CommonJS environments. Define a dummy `module` object so the script
// attaches the factory function to `module.exports` when running in the
// worker.
self.module = {exports: {}};
importScripts('https://cdn.jsdelivr.net/npm/glpk.js/dist/glpk.min.js');

let glpkReady = null;
function initGlpk() {
  if (!glpkReady) {
    glpkReady = new Promise(resolve => {
      function handle(p) {
        p.then(resolve).catch(err => {
          console.warn('GLPK failed to load:', err);
          resolve(null);
        });
      }
      if (typeof glpk === 'function') {
        handle(glpk());
      } else if (typeof GLPK === 'function') {
        handle(GLPK());
      } else if (self.module && typeof self.module.exports === 'function') {
        handle(self.module.exports());
      } else {
        resolve(null);
      }
    });
  }
  return glpkReady;
}

function buildILP(graph, circuits, maxLen){
  const lines = [];
  lines.push('Minimize');
  const obj = [];
  circuits.forEach((c,k)=>{
    graph.edges.forEach((e,i)=>{
      obj.push(`${e.len} x_${k}_${i}`);
    });
  });
  lines.push(' obj: ' + obj.join(' + '));
  lines.push('Subject To');
  circuits.forEach((c,k)=>{
    graph.nodes.forEach((n,idx)=>{
      const terms = [];
      graph.edges.forEach((e,i)=>{
        if(e.a===idx) terms.push(`1 x_${k}_${i}`);
        if(e.b===idx) terms.push(`-1 x_${k}_${i}`);
      });
      if(!terms.length) return;
      const rhs = idx===c.start?1:(idx===c.end?-1:0);
      lines.push(` f_${k}_${idx}: `+terms.join(' + ')+' = '+rhs);
    });
    const lenTerms = graph.edges.map((e,i)=>`${e.len} x_${k}_${i}`);
    lines.push(` l_${k}: `+lenTerms.join(' + ')+' <= '+maxLen);
  });
  lines.push('Bounds');
  circuits.forEach((c,k)=>{
    graph.edges.forEach((e,i)=>{
      lines.push(` 0 <= x_${k}_${i} <= 1`);
    });
  });
  lines.push('Binary');
  circuits.forEach((c,k)=>{
    graph.edges.forEach((e,i)=>{
      lines.push(` x_${k}_${i}`);
    });
  });
  lines.push('End');
  return lines.join('\n');
}

onmessage = async ev => {
  const {graph, circuits, maxLen, timeout} = ev.data;
  const glp = await initGlpk();
  if(!glp){ postMessage({status:'error',message:'GLPK not loaded'}); return; }
  const lp = buildILP(graph, circuits, maxLen);
  let result;
  try{
    result = glp.solve(lp,{msgLevel: glp.GLP_MSG_OFF, tmLimit: (timeout||2)*1000});
  }catch(err){
    postMessage({status:'error', message: err.toString()});
    return;
  }
  if(result.result.status !== glp.GLP_OPT){
    postMessage({status:'timeout'});
    return;
  }
  const paths = circuits.map(()=>[]);
  Object.entries(result.result.vars).forEach(([name,val])=>{
    if(val<0.5) return;
    const parts = name.split('_');
    const k = parseInt(parts[1]);
    const i = parseInt(parts[2]);
    const e = graph.edges[i];
    paths[k].push([e.a,e.b]);
  });
  postMessage({status:'ok', paths});
};
