import{h as b,E as C}from"./index-BvlqPbur.js";function y(e,n){const t=new C({orientation:"portrait",unit:"mm",format:"a4"}),i=t.internal.pageSize.getWidth(),o=t.internal.pageSize.getHeight(),a=10,r=i-a*2,s=o-a*2;let l=!0;for(const{canvas:d}of e){const f=w(d);for(const g of f){l||t.addPage(),l=!1;const x=g.toDataURL("image/jpeg",.92),m=g.width/g.height;let p=r,u=p/m;u>s&&(u=s,p=u*m),t.addImage(x,"JPEG",a+(r-p)/2,a+(s-u)/2,p,u)}}const c=t.internal.getNumberOfPages();for(let d=1;d<=c;d++)t.setPage(d),t.setFontSize(7),t.setTextColor(150,150,150),t.text(`${d} / ${c}`,i-a,o-3,{align:"right"}),t.text(n,a,o-3);return t}function $(e){return e?e>=1e8?(e/1e8).toFixed(0)+" 億":e>=1e4?(e/1e4).toFixed(0)+" 萬":Math.round(e).toLocaleString():"0"}function M({summary:e={},trendData:n=[]}){const t=new Date().toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric"}),{totalSales:i=0,totalQty:o=0,orderCount:a=0,customerCount:r=0,productCount:s=0}=e,l=n.map(p=>p.yearMonth).sort(),c=l[0]||"—",d=l[l.length-1]||"—",f=n.length>0?n.reduce((p,u)=>p.subtotal>=u.subtotal?p:u):null,g=n.length>0?n.reduce((p,u)=>p.subtotal<=u.subtotal?p:u):null,x=n.length>0?Math.round(n.reduce((p,u)=>p+u.subtotal,0)/n.length):0,m=[{label:"總銷售金額",value:`NT$ ${$(i)}`,sub:Math.round(i).toLocaleString()+" 元",color:"#2563eb"},{label:"銷售數量",value:Math.round(o).toLocaleString(),sub:"件",color:"#059669"},{label:"訂單筆數",value:Math.round(a).toLocaleString(),sub:"筆",color:"#7c3aed"},{label:"客戶數",value:r>0?Math.round(r).toLocaleString():"—",sub:"不重複客戶",color:"#d97706"},{label:"品項數",value:s>0?Math.round(s).toLocaleString():"—",sub:"不重複品項",color:"#e11d48"},{label:"月均銷售",value:$(x),sub:"元/月",color:"#0891b2"}];return`<div style="font-family:system-ui,-apple-system,sans-serif;width:760px;background:white">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb,#4f46e5);padding:40px;border-radius:20px;margin-bottom:24px;color:white">
    <div style="font-size:11px;opacity:0.7;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">銷售數據分析系統</div>
    <div style="font-size:28px;font-weight:900;margin-bottom:6px">完整銷售分析報告</div>
    <div style="font-size:13px;opacity:0.7;margin-bottom:20px">報告產生日期：${t}</div>
    <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:14px 18px;display:inline-block">
      <div style="font-size:11px;opacity:0.8;margin-bottom:4px">分析週期</div>
      <div style="font-size:16px;font-weight:700">${c} ～ ${d}</div>
      <div style="font-size:11px;opacity:0.7;margin-top:2px">${l.length} 個月份資料</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
    ${m.map(p=>`
    <div style="border-radius:14px;border:1.5px solid ${p.color}22;overflow:hidden">
      <div style="height:4px;background:${p.color}"></div>
      <div style="padding:16px 18px">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;font-weight:600">${p.label}</div>
        <div style="font-size:22px;font-weight:900;color:#111827;line-height:1.1">${p.value}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">${p.sub}</div>
      </div>
    </div>`).join("")}
  </div>

  ${n.length>0?`
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:16px 18px">
      <div style="font-size:11px;font-weight:700;color:#065f46;margin-bottom:8px">📈 最高銷售月</div>
      <div style="font-size:16px;font-weight:800;color:#111827">${(f==null?void 0:f.yearMonth)||"—"}</div>
      <div style="font-size:12px;color:#059669;font-weight:600;margin-top:4px">${f?Math.round(f.subtotal).toLocaleString()+" 元":"—"}</div>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:16px 18px">
      <div style="font-size:11px;font-weight:700;color:#991b1b;margin-bottom:8px">📉 最低銷售月</div>
      <div style="font-size:16px;font-weight:800;color:#111827">${(g==null?void 0:g.yearMonth)||"—"}</div>
      <div style="font-size:12px;color:#ef4444;font-weight:600;margin-top:4px">${g?Math.round(g.subtotal).toLocaleString()+" 元":"—"}</div>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px 18px">
      <div style="font-size:11px;font-weight:700;color:#1e40af;margin-bottom:8px">📊 月均銷售</div>
      <div style="font-size:16px;font-weight:800;color:#111827">${Math.round(x).toLocaleString()} 元</div>
      <div style="font-size:12px;color:#2563eb;font-weight:600;margin-top:4px">共 ${l.length} 個月</div>
    </div>
  </div>`:""}
</div>`}async function S(e){const n=M(e),t=document.createElement("div");t.style.cssText="position:fixed;left:-9999px;top:0;width:824px;background:white;padding:32px;z-index:-9999;box-sizing:border-box",t.innerHTML=n,document.body.appendChild(t),await new Promise(o=>requestAnimationFrame(()=>requestAnimationFrame(o)));const i=await b(t,{scale:1.5,backgroundColor:"#ffffff",useCORS:!0,logging:!1,scrollX:0,scrollY:0});return document.body.removeChild(t),w(i)}async function I({canvases:e,summaryData:n,onProgress:t}){t==null||t("建立 PDF...");const i=[];n&&(t==null||t("建立摘要頁..."),(await S(n)).forEach((l,c)=>i.push({canvas:l,title:`摘要 ${c+1}`}))),i.push(...e);const o=`Sales Dashboard - ${new Date().toLocaleDateString("zh-TW")}`,a=y(i,o),r=`sales-report-${new Date().toISOString().slice(0,10)}.pdf`;return a.save(r),r}async function W(e){return b(e,{scale:2,useCORS:!0,allowTaint:!0,backgroundColor:"#f9fafb",logging:!1,imageTimeout:1e4,scrollX:0,scrollY:0})}const z=["#2563eb","#059669","#7c3aed","#d97706","#e11d48","#0891b2","#4f46e5"],v={comprehensive:"完整分析",channel:"通路分析",product:"產品開發",growth:"成長策略"};function k(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function h(e){return k(e).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,'<code style="background:#eff6ff;color:#1d4ed8;padding:1px 5px;border-radius:4px;font-size:11px;font-family:monospace">$1</code>').replace(/\*([^*]+)\*/g,"<em>$1</em>")}function T(e,n){let t="",i=null,o=[],a=!1,r=[];const s=()=>{o.length&&(i==="ul"?(t+='<ul style="margin:8px 0 12px;padding:0;list-style:none">',o.forEach(l=>{t+=`<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:${n};flex-shrink:0;margin-top:5px"></span>
          <span style="font-size:13px;color:#374151;line-height:1.5">${h(l)}</span></li>`}),t+="</ul>"):(t+='<ol style="margin:8px 0 12px;padding:0;list-style:none">',o.forEach((l,c)=>{t+=`<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px">
          <span style="width:20px;height:20px;border-radius:50%;background:${n};color:white;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${c+1}</span>
          <span style="font-size:13px;color:#374151;line-height:1.5">${h(l)}</span></li>`}),t+="</ol>"),o=[],i=null)};return e.forEach(l=>{if(l.startsWith("```")){a?(t+=`<pre style="background:#111827;color:#6ee7b7;padding:12px;border-radius:8px;font-size:11px;margin:10px 0;font-family:monospace;line-height:1.5;white-space:pre-wrap">${r.map(k).join(`
`)}</pre>`,r=[],a=!1):(s(),a=!0);return}if(a){r.push(l);return}l.startsWith("### ")?(s(),t+=`<div style="font-size:13px;font-weight:700;color:${n};margin:14px 0 6px;display:flex;align-items:center;gap:6px">
        <span style="width:3px;height:14px;background:${n};display:inline-block;border-radius:2px;flex-shrink:0"></span>
        ${h(l.slice(4))}</div>`):/^[-*] /.test(l)?(i!=="ul"&&s(),i="ul",o.push(l.slice(2))):/^\d+\. /.test(l)?(i!=="ol"&&s(),i="ol",o.push(l.replace(/^\d+\. /,""))):l.startsWith("---")?(s(),t+='<hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0">'):l.trim()===""?s():l.startsWith("#")||(s(),t+=`<p style="font-size:13px;color:#374151;margin:3px 0;line-height:1.6;word-wrap:break-word;overflow-wrap:break-word">${h(l)}</p>`)}),s(),t}function E(e,n){const t=e.split(`
`);let i="";const o=[];let a=[],r=null;for(const d of t)d.startsWith("# ")&&!i?i=d.slice(2):d.startsWith("## ")?(r?o.push(r):a.length&&o.push({title:null,lines:a}),r={title:d.slice(3),lines:[]}):r?r.lines.push(d):a.push(d);r?o.push(r):a.length&&o.push({title:null,lines:a});let s=0;const l=new Date().toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric"});let c='<div style="font-family:system-ui,-apple-system,sans-serif;width:760px;background:white;box-sizing:border-box;word-wrap:break-word;overflow-wrap:break-word">';return c+=`<div style="background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;padding:32px;border-radius:16px;margin-bottom:20px">
    <div style="font-size:11px;opacity:0.7;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">AI 智慧分析報告</div>
    <div style="font-size:22px;font-weight:900;margin-bottom:4px">${h(i||v[n]||"AI 分析")}</div>
    <div style="font-size:11px;opacity:0.6;margin-bottom:16px">${l}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${["🏢 企業管理專家","📊 市場分析專家","🎯 產品PM","🔬 研發評估"].map(d=>`<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,0.2)">${d}</span>`).join("")}
    </div>
  </div>`,o.filter(d=>d.title).forEach(d=>{const f=z[s%z.length];s++,c+=`<div style="border-radius:14px;overflow:hidden;margin-bottom:16px;border:1px solid ${f}25">
      <div style="background:${f};padding:12px 20px;display:flex;align-items:center;gap:12px">
        <span style="width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.25);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:white;flex-shrink:0">${s}</span>
        <span style="font-size:14px;font-weight:700;color:white">${h(d.title)}</span>
      </div>
      <div style="background:${f}0d;padding:16px 20px">${T(d.lines,f)}</div>
    </div>`}),c+="</div>",c}function w(e){const n=Math.round(e.width*1.414),t=[];let i=0;for(;i<e.height;){const o=Math.min(n,e.height-i),a=document.createElement("canvas");a.width=e.width,a.height=n;const r=a.getContext("2d");r.fillStyle="#ffffff",r.fillRect(0,0,e.width,n),r.drawImage(e,0,i,e.width,o,0,0,e.width,o),t.push(a),i+=n}return t}async function L(e,n){const t=E(e,n),i=document.createElement("div");i.style.cssText="position:fixed;left:-9999px;top:0;width:824px;background:white;padding:32px;z-index:-9999;box-sizing:border-box",i.innerHTML=t,document.body.appendChild(i),await new Promise(a=>requestAnimationFrame(()=>requestAnimationFrame(a)));const o=await b(i,{scale:1.5,backgroundColor:"#ffffff",useCORS:!0,logging:!1,scrollX:0,scrollY:0});return document.body.removeChild(i),w(o)}async function A({content:e,analysisType:n}){const t=await L(e,n),i=v[n]||n,o=`AI 智慧分析報告 · ${i} · ${new Date().toLocaleDateString("zh-TW")}`,a=y(t.map((s,l)=>({canvas:s,title:`AI報告 ${l+1}`})),o),r=`AI分析_${i}_${new Date().toISOString().slice(0,10)}.pdf`;return a.save(r),r}async function D({canvases:e,aiContent:n,analysisType:t,summaryData:i,onProgress:o}){const a=[];i&&(o==null||o("建立摘要封面頁..."),(await S(i)).forEach((g,x)=>a.push({canvas:g,title:`摘要 ${x+1}`}))),o==null||o("準備 AI 報告內容..."),(await L(n,t)).forEach((f,g)=>a.push({canvas:f,title:`AI 分析報告 第${g+1}頁`})),a.push(...e);const s=v[t]||t,l=`完整銷售分析報告 · ${s} · ${new Date().toLocaleDateString("zh-TW")}`;o==null||o("建立 PDF 檔案...");const c=y(a,l),d=`完整報告_${s}_${new Date().toISOString().slice(0,10)}.pdf`;return c.save(d),d}export{W as captureElement,A as exportAIReportPDF,I as exportDashboardPDF,D as exportFullReportPDF};
