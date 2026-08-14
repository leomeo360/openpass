const app = document.querySelector('#app');
const title = document.querySelector('#title');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
const modalNav = document.querySelector('#modal-nav');
const nativeShowModal = modal.showModal.bind(modal);
modal.querySelector('.close').onclick=()=>modal.close();
function modalNavIcon(index){
  return index===0
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2Zm0 0v6c0 1.1 3.1 2 7 2 .7 0 1.4 0 2-.1M5 11v6c0 1.1 3.1 2 7 2h1m5-7v3m0 4v2m-3-4h2m4 0h2"/></svg>';
}
function prepareModalNavigation(){
  modalNav.innerHTML='';
  const compactConfirm=modalContent.querySelector('.compact-confirm-card');
  modal.classList.toggle('modal-compact-confirm',!!compactConfirm);
  const simpleDialog=modalContent.querySelector('.simple-confirm-card');
  modal.classList.toggle('modal-simple',!!simpleDialog);
  if(simpleDialog){
    modal.classList.remove('modal-integration-only','modal-mirrors-project-tabs','modal-mirrors-split-tabs');
    return;
  }
  const integrationOnly=modalContent.querySelector('.integration-only');
  modal.classList.toggle('modal-integration-only',!!integrationOnly);
  if(integrationOnly)return;
  const projectTabs=[...modalContent.querySelectorAll('.project-management-tab')];
  const splitModes=[...modalContent.querySelectorAll('.split-mode')];
  let targets=[];
  if(projectTabs.length){
    targets=projectTabs.map(button=>({label:button.querySelector('strong')?.textContent||button.textContent,button}));
    modal.classList.add('modal-mirrors-project-tabs');
  }else{
    modal.classList.remove('modal-mirrors-project-tabs');
    if(splitModes.length){
      targets=splitModes.map(button=>({label:button.childNodes[0]?.textContent?.trim()||button.textContent,button}));
      modal.classList.add('modal-mirrors-split-tabs');
    }else{
      modal.classList.remove('modal-mirrors-split-tabs');
      const advancedToggle=modalContent.querySelector('.project-advanced-toggle');
      if(advancedToggle){
        const required=modalContent.querySelector('.project-create-required');
        const advancedPane=advancedToggle.closest('.project-create-pane');
        targets=[
          {label:required?.dataset.modalLabel||'基本设置',activate:()=>{required.hidden=false;advancedPane.hidden=true;}},
          {label:advancedToggle.querySelector('strong')?.textContent||'高级选项',activate:()=>{required.hidden=true;advancedPane.hidden=false;const fields=advancedPane.querySelector('.project-advanced-fields');if(fields)fields.hidden=false;}},
        ];
      }else{
        const sections=[...modalContent.querySelectorAll('.project-pane-heading h3, .form-section > h3, .form-section h3, .metadata-grid h3')];
        targets=sections.slice(0,6).map(section=>({label:section.textContent,section}));
      }
    }
  }
  if(!targets.length){
    const heading=modalContent.querySelector('h2');
    targets=[{label:heading?.textContent?.replace(/^管理项目：/,'')||'常规',section:heading}];
  }
  const activeTargetIndex=Math.max(0,targets.findIndex(target=>target.button?.classList.contains('active')));
  targets.forEach((target,index)=>{
    const item=document.createElement('button');
    item.type='button';
    item.className=`modal-nav-item${index===activeTargetIndex?' active':''}`;
    item.innerHTML=`${modalNavIcon(index)}<span>${esc(target.label)}</span>`;
    item.onclick=()=>{
      modalNav.querySelectorAll('.modal-nav-item').forEach(entry=>entry.classList.toggle('active',entry===item));
      if(target.activate){
        target.activate();
      }else if(target.button){
        target.button.click();
      }else{
        target.section?.closest('.form-section, .project-create-pane, section')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    };
    modalNav.append(item);
  });
}
modal.showModal=()=>{
  prepareModalNavigation();
  if(!modal.open){
    nativeShowModal();
    const heading=modalContent.querySelector('h2');
    if(heading){
      heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    }
  }
};
const labels = {overview:'总览',projects:'项目',providers:'我的供应商',models:'全部模型',model_entries:'模型入口',pricing:'官方价格',provider_catalog:'全部供应商',model_catalog:'全部模型',requests:'请求日志',jobs:'异步任务',alerts:'告警中心',settings:'系统设置',audit:'操作审计',docs:'调用文档'};
const localDevelopment=['localhost','127.0.0.1'].includes(location.hostname);
const uiLocale=localStorage.getItem('openpass-locale')||localStorage.getItem('apihub-locale')||(localDevelopment?'zh-CN':'en');
const englishText=new Map(Object.entries({
  '运营管理':'Operations','资源配置':'Resources','系统设置':'Settings','调用文档':'API Guide','总览':'Overview','项目':'Projects',
  '请求日志':'Request Logs','异步任务':'Async Jobs','告警中心':'Alerts','供应商':'Providers','模型':'Models','价格':'Pricing',
  '我的供应商':'My Providers','我的模型':'My Models','官方价格':'Official Pricing',
  '全部供应商':'Provider Catalog','全部模型':'Model Catalog','操作审计':'Audit Log','网关正常':'Gateway healthy',
  '源头供应商':'Source providers','集成供应商':'Integration providers','纯语言模型':'Language models',
  '项目与额度':'Projects & Quotas','创建项目':'Create project','生图 SaaS':'Image SaaS','生视频 SaaS':'Video SaaS',
  '其他工具':'Other tools','项目专用虚拟 Key':'Project virtual key','状态':'Status','今日用量':'Today usage',
  '必填内容':'Required information','填写项目基本信息并选择至少一个模型。':'Enter the project basics and select at least one model.',
  '高级选项':'Advanced options','配额、联系人和模型路由（选填）':'Quotas, contact, and model routing (optional)',
  '显示高级选项':'Show advanced options','隐藏高级选项':'Hide advanced options',
  '搜索并选择模型 *':'Search and select models *','选择模型':'Select models','已选择模型':'Selected models',
  '联系与说明':'Contact & description','配额限制':'Quota limits','模型路由高级设置':'Advanced model routing',
  '创建时间':'Created','操作':'Actions','管理':'Manage','查看':'View','暂停':'Pause','启用':'Enable','测试':'Test',
  '关闭':'Close','取消':'Cancel','返回':'Back','保存项目设置':'Save project','项目额度':'Project quotas',
  '基本与额度':'Basics & quotas','项目资料与容量限制':'Project details and capacity limits',
  '用于识别项目和说明项目用途。':'Used to identify the project and describe its purpose.',
  '按容量、请求量和费用分别设置限制，保存后立即生效。':'Set capacity, request, and cost limits independently. Changes apply immediately after saving.',
  '实时容量':'Realtime capacity','控制瞬时流量，避免单个项目占满网关。':'Controls burst traffic so one project cannot exhaust gateway capacity.',
  '每分钟请求数（RPM）':'Requests per minute (RPM)','请求量限制':'Request limits',
  '限制每日和每月允许发起的请求总数。':'Limits the total requests allowed each day and month.',
  '费用限制':'Cost limits','金额单位为分；达到上限后停止继续产生费用。':'Amounts are in cents. Requests stop when the limit is reached.',
  '基本信息与策略':'Basics & policies','基本信息':'Basics','项目名称':'Project name','项目分类':'Category',
  '环境':'Environment','联系人邮箱':'Contact email','项目描述':'Description','日志策略':'Log policy',
  'IP 记录':'IP logging','并发上限':'Concurrency limit','日请求上限':'Daily request limit',
  '月请求上限':'Monthly request limit','日费用上限（分）':'Daily cost limit (cents)',
  '月费用上限（分）':'Monthly cost limit (cents)','模型路由':'Model routing','允许调用的模型 *':'Allowed models *',
  '启用跨模型回退':'Enable cross-model fallback','默认':'Default','项目内别名':'Project alias','回退顺序':'Fallback order',
  '创建虚拟 Key':'Create virtual key','轮换':'Rotate','撤销':'Revoke','来源 IP 规则':'Source IP rules',
  '创建、复制和删除':'Create, copy, and delete','删除后 Key 将立即失效，且不能恢复。':'Deleted keys become invalid immediately and cannot be restored.',
  '删除项目':'Delete project','确认删除':'Confirm delete','项目已删除':'Project deleted',
  '删除虚拟 Key':'Delete virtual key','虚拟 Key 已删除':'Virtual key deleted',
  '阻止':'Block','允许':'Allow','添加规则':'Add rule','项目管理员':'Project administrators',
  '项目管理员已添加':'Project administrator added','只读查看者':'Read-only viewer','添加管理员':'Add administrator',
  '停用':'Disable','移除':'Remove','Webhook 回调':'Webhook callbacks','添加 Webhook':'Add webhook','删除':'Delete',
  '最近请求':'Recent requests','查看全部日志':'View all logs','项目告警':'Project alerts','类型':'Type',
  '严重度':'Severity','说明':'Description','时间':'Time','暂无数据':'No data','尚未配置 Webhook。':'No webhook configured.',
  '尚未分配项目管理员。全局管理员仍可管理该项目。':'No project administrator assigned. Global administrators retain access.',
  '创建并显示 Key':'Create & reveal key','创建并显示签名密钥':'Create & reveal signing secret',
  '添加项目 Webhook':'Add project webhook','名称 *':'Name *','回调 URL *':'Callback URL *','订阅事件 *':'Events *',
  '请求完成':'Request completed','异步任务完成':'Async job completed','新告警':'Alert created',
  'Webhook 已创建':'Webhook created','Webhook 签名密钥':'Webhook signing secret','复制密钥':'Copy secret',
  '返回项目':'Back to project','虚拟 Key 已创建':'Virtual key created','复制 Key':'Copy key','完成':'Done',
  '轮换项目专用虚拟 Key':'Rotate project virtual key','确认轮换并显示新 Key':'Rotate & reveal new key',
  '旧 Key 宽限期（分钟）':'Old key grace period (minutes)','新 Key 名称（可选）':'New key name (optional)',
  '新 Key 到期时间（可选）':'New key expiration (optional)','保存系统设置':'Save settings',
  '系统默认与治理策略':'Defaults & governance','网关默认值':'Gateway defaults','数据保留':'Data retention',
  '告警阈值':'Alert thresholds','凭证自动健康检查':'Automatic credential health checks',
  '额外脱敏字段（逗号或换行分隔）':'Additional redacted fields (comma or newline separated)',
  '添加模型':'Add model','模型与价格':'Models & pricing','模型管理':'Model management','模型价格':'Model pricing','请求类型':'Request type','聊天 / 语言':'Chat / language','图片':'Image','视频':'Video',
  '嵌入':'Embedding','音频':'Audio','文档':'Document','添加模型与价格':'Add model & pricing',
  '常用模型':'Common models','自定义':'Custom','常用':'Common','添加供应商':'Add provider','供应商与凭证':'Providers & credentials',
  '编辑':'Edit','凭证':'Credentials','连接测试':'Connection test','添加真实 Key':'Add provider key','更换 Key':'Replace key',
  '测试成功':'Test successful','配置有误':'Configuration error',
  '全部':'All','应用筛选':'Apply filters','重置':'Reset','请求总数':'Requests','成功率':'Success rate',
  '预估费用':'Estimated cost','平均响应':'Average latency','本月请求':'Monthly requests','项目状态':'Project status',
  '最近失败请求':'Recent failures','查看全部':'View all','接近额度的项目':'Projects near quota',
  '项目费用排行':'Project cost ranking','模型使用排行':'Model usage ranking','页面已刷新':'Page refreshed',
  '事件':'Event','尝试':'Attempts','最近错误':'Last error','更新时间':'Updated','任务 ID':'Job ID','上游任务 ID':'Upstream job ID',
  '告警':'Alert','确认':'Acknowledge','解决':'Resolve','供应商凭证':'Provider credential','地址':'Base URL',
  '今日请求 / 失败':'Today requests / failures','别名':'Alias','供应商模型 ID':'Provider model ID',
  '价格（每百万 Token）':'Pricing','名称':'Name','末四位':'Last four','健康度 / 最近错误':'Health / last error',
  '优先级 / 权重':'Priority / weight','失败次数':'Failures','最后使用':'Last used','恢复':'Restore','擦除':'Erase',
  '端点':'Endpoint','耗时':'Latency','费用':'Cost',
  '保存':'Save','正在提交…':'Submitting…','请求详情':'Request details','项目 / 虚拟 Key':'Project / virtual key',
  '最终模型 / 供应商':'Final model / provider','来源':'Source','耗时 / 费用':'Latency / cost','错误':'Error',
  '请求与响应元数据':'Request & response metadata','请求元数据':'Request metadata','响应元数据':'Response metadata',
  '已复制到剪贴板':'Copied to clipboard','该完整密钥仅显示一次，请立即保存到安全的密钥管理工具中。':'This full secret is shown only once. Save it in a secure secret manager now.',
  '该完整 Key 仅显示一次，请立即保存到安全的密钥管理工具中。':'This full key is shown only once. Save it in a secure secret manager now.',
  '加载中…':'Loading…','界面语言':'Interface language','刷新当前页面':'Refresh current page',
  '显示接入信息':'Show integration details','隐藏接入信息':'Hide integration details','接入信息':'Integration details',
  '请求 URL':'Request URL','默认模型':'Default model','示例 Prompt':'Example prompt','复制 URL':'Copy URL',
  '复制 Model':'Copy model','复制 Prompt':'Copy prompt','复制完整调用':'Copy full request','完整 cURL 示例':'Complete cURL example',
  '粘贴完整虚拟 Key':'Paste full virtual key','复制整套配置':'Copy all settings','复制':'Copy','调用':'Requests','Token':'Tokens',
  '告警总数':'Total alerts','待处理':'Open','已确认':'Acknowledged','已解决':'Resolved','严重告警':'Critical alerts',
  '近期请求':'Recent requests','近期费用':'Recent cost','请求':'Request','响应':'Response',
  '全部严重度':'All severities','全部状态':'All statuses','全局告警':'Global alert','重新打开':'Reopen alert',
  '确认告警':'Acknowledge','解决告警':'Resolve','告警状态已更新':'Alert status updated'
}));
function englishize(value){
  const leading=value.match(/^\s*/)?.[0]||'',trailing=value.match(/\s*$/)?.[0]||'',trimmed=value.trim();
  let translated=englishText.get(trimmed);
  if(!translated){
    const counted=/^(.+?)（(\d+)）$/.exec(trimmed);
    if(counted&&englishText.has(counted[1]))translated=`${englishText.get(counted[1])} (${counted[2]})`;
  }
  if(translated===undefined){
    const fragments=[
      ['管理项目：','Manage project: '],['旧 Key 有效至','Old key valid until'],['添加于','Added'],
      ['支持单个 IPv4、IPv4 CIDR 或 IPv6；阻止规则优先。','Supports IPv4, IPv4 CIDR, and IPv6. Block rules take precedence.'],
      ['备注（可选）','Note (optional)'],
      ['未配置 IP 规则，默认允许所有来源。配置允许规则后，只允许匹配的来源访问。','No IP rules configured; all sources are allowed. Once allow rules exist, only matching sources can access the project.'],
      ['账号身份由 Cloudflare Access 验证；这里只分配项目范围和读写角色。','Identity is verified by Cloudflare Access. Assign project scope and read/write roles here.'],
      ['使用 HMAC-SHA256 签名；失败会自动重试，最多 5 次。','Uses HMAC-SHA256 signatures. Failed deliveries retry up to five times.'],
      ['轮换时旧 Key 会在宽限期结束后自动撤销。','During rotation, the old key is revoked automatically after the grace period.'],
      ['将永久删除“','Permanently delete “'],
      ['”及其虚拟 Key、请求日志、额度、模型路由、IP 规则和告警。此操作不可恢复。','” and its virtual keys, request logs, quotas, model routes, IP rules, and alerts. This action cannot be undone.'],
      ['删除后该 Key 将立即失效，且不能恢复。','The key becomes invalid immediately after deletion and cannot be restored.'],
      ['查看全部日志','View all logs'],['调用 ','Requests '],['成功率 ','Success rate '],['Token ','Tokens '],['备注','Note']
    ];
    const replaced=fragments.reduce((text,[from,to])=>text.replaceAll(from,to),trimmed);
    if(replaced!==trimmed)translated=replaced;
  }
  return translated===undefined?value:`${leading}${translated}${trailing}`;
}
function applyLocale(root=document){
  if(uiLocale!=='en')return;
  document.documentElement.lang='en';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{if(!['SCRIPT','STYLE'].includes(node.parentElement?.tagName||''))node.nodeValue=englishize(node.nodeValue||'')});
  const scope=root.querySelectorAll?root:document;
  scope.querySelectorAll('[placeholder],[title],[aria-label]').forEach(element=>{
    ['placeholder','title','aria-label'].forEach(attribute=>{if(element.hasAttribute(attribute))element.setAttribute(attribute,englishize(element.getAttribute(attribute)||''))});
  });
}
let adminSession={role:'global',email:'',projects:[]};
const revealedVirtualKeys=new Map();
const globalOnlyViews=new Set(['overview','providers','models','model_entries','pricing','provider_catalog','model_catalog','settings','audit']);
const canManageProject=projectId=>adminSession.role==='global'||adminSession.projects.some(project=>project.project_id===projectId&&project.role==='manager');

const api = async (path, options={}) => {
  const requestOptions={credentials:'same-origin',headers:{'content-type':'application/json', ...(options.headers||{})}, ...options};
  let response;
  try{
    response=await fetch(`/admin/api${path}`,requestOptions);
  }catch(firstError){
    if((options.method||'GET').toUpperCase()!=='GET')throw new Error('网络连接中断，操作未提交。请确认网络和登录状态后重试。');
    await new Promise(resolve=>setTimeout(resolve,350));
    try{
      response=await fetch(`/admin/api${path}`,requestOptions);
    }catch(secondError){
      throw new Error('数据加载失败，可能是网络连接中断或登录已过期。请刷新页面重新登录后重试。');
    }
  }
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    if(response.status===401&&data.error?.code==='ADMIN_AUTH_REQUIRED'){
      location.assign('/admin/login.html');
      throw new Error('登录已过期，正在返回登录页。');
    }
    const raw=data.error?.message||'';
    if(uiLocale==='en')throw new Error(raw||`Request failed (HTTP ${response.status}). Please retry.`);
    const required=raw.match(/^([a-z0-9_]+) is required/i);
    const fieldNames={name:'名称',slug:'标识',base_url:'API Base URL',provider_id:'供应商',provider_model_id:'供应商模型 ID',alias:'内部别名',secret:'真实 API Key'};
    const known={
      MODEL_ALIAS_EXISTS:'内部别名已存在，请编辑现有模型或更换别名。',
      PROJECT_SLUG_EXISTS:'项目标识已被使用，请填写新的项目标识。',
      PROVIDER_SLUG_EXISTS:'供应商标识已存在，请编辑现有供应商或填写新的标识。',
      PROVIDER_NOT_FOUND:'找不到所选供应商，请刷新页面后重新选择。',
      PROJECT_NOT_FOUND:'找不到该项目，可能已被删除，请刷新页面。',
      MODEL_REQUIRED:'请至少选择一个允许调用的模型。',
      ENCRYPTION_NOT_CONFIGURED:'系统加密密钥未配置或格式无效，请配置 CREDENTIAL_ENCRYPTION_KEY 后重试。',
      ADMIN_SCOPE_FORBIDDEN:'当前账号没有执行此操作的项目权限。'
    };
    const translated=raw.includes('selected models do not exist or are inactive')?'所选模型中有已删除或停用的模型，请刷新页面后重新选择。':
      raw.includes('must contain lowercase letters')?'标识格式不正确，只能使用小写字母、数字、下划线和连字符。':
      raw.includes('must be an HTTPS URL')?'API Base URL 必须是有效的 HTTPS 地址。':
      raw.includes('No supported settings')?'没有可保存的设置，请修改至少一项后重试。':'';
    const message=required?`请填写${fieldNames[required[1]]||required[1]}。`:(known[data.error?.code]||translated||raw||`请求失败（HTTP ${response.status}），请稍后重试。`);
    throw new Error(message);
  }
  return data;
};
const money = cents => `$${(Number(cents||0)/100).toFixed(2)}`;
const billingUnitLabels={token:'Token',request:'次请求',image:'张图片',second:'秒',minute:'分钟',audio_minute:'音频分钟'};
const unitPrice = model => model.pricing_note ? `<span class="official-price">${esc(model.pricing_note)}</span>` : model.billing_unit&&model.billing_unit!=='token' ? `${money(model.fixed_cost_cents)} + $${(Number(model.unit_cost_microunits||0)/100).toFixed(2)} / ${esc(billingUnitLabels[model.billing_unit]||model.billing_unit)}` : model.request_type==='image' ? `${money(model.fixed_cost_cents)} / 次` : `$${(Number(model.input_cost_microunits||0)/100).toFixed(2)} 输入 / $${(Number(model.output_cost_microunits||0)/100).toFixed(2)} 输出`;
const projectCategories={image_saas:'生图 SaaS',video_saas:'生视频 SaaS',other_tools:'其他工具'};
const status = value => `<span class="status ${String(value).toLowerCase()}">${value}</span>`;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td class="empty" colspan="${headers.length}">暂无数据</td></tr>`}</tbody></table></div>`;
function confirmAction(title, message, confirmText, action, options={}){modalContent.innerHTML=`<section class="form-card confirm-card simple-confirm-card${options.compact?' compact-confirm-card':''}"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="form-actions"><button class="ghost" id="confirm-cancel" type="button">取消</button><button class="danger" id="confirm-accept" type="button">${esc(confirmText)}</button></div></section>`;modal.showModal();modalContent.querySelector('#confirm-cancel').onclick=()=>modal.close();modalContent.querySelector('#confirm-accept').onclick=async()=>{const button=modalContent.querySelector('#confirm-accept');button.disabled=true;try{modal.close();await action()}catch(error){button.disabled=false;modalContent.querySelector('p').textContent=error.message;modal.showModal();}}}
function showMessage(title,message){modalContent.innerHTML=`<section class="form-card confirm-card"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="form-actions"><button class="ghost" id="message-close" type="button">关闭</button></div></section>`;modal.showModal();modalContent.querySelector('#message-close').onclick=()=>modal.close();}
const brandGlyphs={openai:'◎',anthropic:'AI',xai:'X',"google-gemini":'G',deepseek:'DS',dewatermark:'DW',groq:'G',together:'T',openrouter:'OR','zhipu-glm':'GLM','volcengine-ark':'豆','aliyun-bailian':'Q','siliconflow':'SF','tencent-tokenhub':'混','baidu-qianfan':'文',moonshot:'K',minimax:'M',stepfun:'跃',lingyiwanwu:'01'};
const brandMark=(slug,name='AI')=>`<span class="brand-mark brand-${esc(slug||'default')}" title="${esc(name)}">${esc(brandGlyphs[slug]||name.slice(0,2)||'AI')}</span>`;

async function render(view = (location.hash.slice(1).split('?')[0] || 'overview')) {
  if(adminSession.role==='project'&&globalOnlyViews.has(view)){
    if(location.hash!=='#projects')location.hash='projects';
    return;
  }
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
  title.textContent = labels[view] || '总览';
  app.innerHTML='<div class="loading">加载中…</div>';
  try { await ({overview,projects,providers,models,model_entries,pricing,provider_catalog,model_catalog,requests,jobs,alerts,settings,audit,docs}[view] || overview)(); }
  catch (error) {
    app.innerHTML=`<div class="notice load-error"><strong>页面加载失败</strong><span>${esc(error.message)}</span><button id="retry-view" type="button">重新加载</button></div>`;
    document.querySelector('#retry-view').onclick=()=>render(view);
  }
}

async function overview(){
  const params=new URLSearchParams(location.hash.split('?')[1]||'');const [data,projectsData] = await Promise.all([api(`/dashboard?${params}`),api('/projects?page_size=100')]); const today=data.summary||data.today||{}; const month=data.month||{};
  const projects=projectsData.projects.map(x=>({id:x.id,label:x.name,detail:x.slug,search:`${x.name} ${x.slug} ${x.id}`}));
  app.innerHTML=`<div class="dashboard-filter-scroll"><form id="dashboard-filter" class="inline-form dashboard-filter"><select name="period">${[['today','今天'],['7d','最近 7 天'],['30d','最近 30 天'],['month','本月'],['custom','自定义时间']].map(([v,label])=>`<option value="${v}" ${data.period===v?'selected':''}>${label}</option>`).join('')}</select><input type="datetime-local" name="started_after" title="开始时间" value="${esc(params.get('started_after')||'')}"><input type="datetime-local" name="started_before" title="结束时间" value="${esc(params.get('started_before')||'')}">${fuzzySelectHtml('project', '全部项目', params.get('project_id'), projects)}<button>应用筛选</button></form></div><div class="grid dashboard-grid">
    <article class="card"><p>今日请求</p><strong>${today.requests||0}</strong></article>
    <article class="card"><p>今日预估费用</p><strong>${money(today.cost)}</strong></article>
    <article class="card"><p>本月请求</p><strong>${month.requests||0}</strong></article>
    <article class="card"><p>成功 / 失败</p><strong>${today.successes||0} / ${today.failures||0}</strong></article>
    <article class="card"><p>平均响应时间</p><strong>${Math.round(today.average_duration_ms||0)}ms</strong></article>
    <article class="card"><p>项目状态</p><strong>${(data.projects||[]).filter(x=>x.status==='active').reduce((n,x)=>n+x.count,0)} / ${(data.projects||[]).filter(x=>x.status!=='active').reduce((n,x)=>n+x.count,0)}</strong><span class="metric-label">启用 / 暂停或停用</span></article>
  </div>
  <div class="section"><div class="section-head"><h2>最近失败请求</h2><a href="#requests">查看全部</a></div>${table(['Request ID','项目','错误','时间'],data.recent_failures.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.project_id||'—')}</td><td>${esc(x.error_code||x.error_message||'—')}</td><td>${new Date(x.started_at).toLocaleString()}</td></tr>`))}</div>
  <div class="section"><div class="section-head"><h2>即将超额的项目（今日 ≥ 70%）</h2><a href="#projects">管理项目</a></div>${table(['项目','请求用量','费用用量'],(data.at_risk_projects||[]).map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="metric-label">${esc(x.slug)}</span></td><td>${x.request_count||0}${x.daily_request_limit?` / ${x.daily_request_limit}`:' / 未设置'}</td><td>${money(x.estimated_cost_cents||0)}${x.daily_cost_limit_cents?` / ${money(x.daily_cost_limit_cents)}`:' / 未设置'}</td></tr>`))}</div>
  <div class="section"><div class="section-head"><h2>项目费用排行</h2></div>${table(['项目','预估费用'],data.cost_by_project.map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.cost_cents)}</td></tr>`))}</div>
  <div class="section"><div class="section-head"><h2>模型使用排行</h2></div>${table(['模型','请求数','预估费用'],data.model_usage.map(x=>`<tr><td>${esc(x.alias)}</td><td>${x.requests}</td><td>${money(x.cost_cents)}</td></tr>`))}</div>`;
  setupFuzzySelect('project', projects);
  attachValidatedSubmit(document.querySelector('#dashboard-filter'),async values=>{location.hash=`overview?${new URLSearchParams(values)}`},{closeOnSuccess:false});
}

function fuzzySelectHtml(kind, placeholder, selectedId, options){const selected=options.find(option=>option.id===selectedId);return `<div class="fuzzy-select"><input id="filter-${kind}" autocomplete="off" placeholder="${placeholder}" value="${esc(selected?.label||'')}" aria-label="${placeholder}"><input type="hidden" name="${kind}_id" value="${esc(selectedId||'')}"><div class="fuzzy-options" id="filter-${kind}-options"></div></div>`;}
function setupFuzzySelect(kind, options, onSelect){const input=document.querySelector(`#filter-${kind}`);const hidden=input.parentElement.querySelector('input[type="hidden"]');const menu=document.querySelector(`#filter-${kind}-options`);const renderOptions=query=>{const normalized=query.trim().toLowerCase();const rows=options.filter(option=>option.search.toLowerCase().includes(normalized)).slice(0,20);menu.innerHTML=`<button type="button" class="fuzzy-option" data-id="">全部</button>${rows.map(option=>`<button type="button" class="fuzzy-option" data-id="${esc(option.id)}"><strong>${esc(option.label)}</strong><span>${esc(option.detail)}</span></button>`).join('')||'<div class="fuzzy-empty">没有匹配项</div>'}`;menu.classList.add('open');menu.querySelectorAll('.fuzzy-option').forEach(button=>button.onmousedown=event=>{event.preventDefault();const option=options.find(item=>item.id===button.dataset.id);hidden.value=option?.id||'';input.value=option?.label||'';menu.classList.remove('open');if(onSelect)onSelect(option?.id||'');});};input.onfocus=()=>renderOptions(input.value);input.oninput=()=>{hidden.value='';renderOptions(input.value)};input.onblur=()=>setTimeout(()=>menu.classList.remove('open'),160);}

const pageSizeChoices=[10,20,50,100];
function paginationParams(){const params=new URLSearchParams(location.hash.split('?')[1]||'');if(!params.has('page_size'))params.set('page_size','10');return params;}
function paginationHtml(view,params,pagination){
  const meta=pagination||{page:1,page_size:Number(params.get('page_size')||10),total:0,total_pages:1};
  const button=(page,label,disabled=false,current=false)=>`<button type="button" class="ghost list-page${current?' active':''}" data-list-page="${page}" ${disabled?'disabled':''}>${label}</button>`;
  const nearby=[];for(let page=Math.max(1,meta.page-2);page<=Math.min(meta.total_pages,meta.page+2);page++)nearby.push(button(page,page,false,page===meta.page));
  return `<div class="pagination" data-pagination-view="${view}"><span>共 ${Number(meta.total||0).toLocaleString()} 条 · 第 ${meta.page} / ${meta.total_pages} 页</span><label>每页 <select data-page-size>${pageSizeChoices.map(size=>`<option value="${size}" ${Number(meta.page_size)===size?'selected':''}>${size}</option>`).join('')}</select> 条</label><div>${button(meta.page-1,'上一页',meta.page<=1)}${nearby.join('')}${button(meta.page+1,'下一页',meta.page>=meta.total_pages)}</div></div>`;
}
function bindPagination(view,params){
  document.querySelectorAll('[data-list-page]:not([disabled])').forEach(button=>button.onclick=()=>{const next=new URLSearchParams(params);const page=Math.max(1,Number(button.dataset.listPage)||1);if(page===1)next.delete('page');else next.set('page',String(page));location.hash=`${view}?${next}`;});
  document.querySelectorAll('[data-page-size]').forEach(select=>select.onchange=()=>{const next=new URLSearchParams(params);next.set('page_size',select.value);next.delete('page');location.hash=`${view}?${next}`;});
}

async function projects(){
  const params=paginationParams();const data=await api(`/projects?${params}`);
  const renderRows=items=>table(['#','项目','虚拟 Key','状态','今日用量','RPM / 并发','创建时间','操作'],items.map((x,index)=>`<tr><td>${index+1}</td><td><strong>${esc(x.name)}</strong></td><td><div class="masked-key-cell"><code>${esc(x.virtual_key_mask||'—')}</code>${x.virtual_key_id&&x.integration?`<button class="ghost project-key-copy copy-project-access" type="button" data-id="${x.id}" title="复制接入 JSON" aria-label="复制接入 JSON"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0 2 2v8a2 2 0 0 0 2 2h2"/></svg></button>`:''}</div></td><td>${status(x.status)}</td><td>${x.today_requests} · ${money(x.today_cost_cents)}</td><td>${x.rpm_limit} / ${x.concurrency_limit}</td><td>${new Date(x.created_at).toLocaleDateString()}</td><td><div class="row-actions"><button class="ghost project-detail" data-id="${x.id}">${canManageProject(x.id)?'管理':'查看'}</button>${canManageProject(x.id)?`<button class="${x.status==='active'?'danger':'ghost'} toggle-project" data-id="${x.id}" data-status="${x.status}">${x.status==='active'?'暂停':'启用'}</button>`:''}${adminSession.role==='global'?`<button class="danger delete-project" data-id="${x.id}">删除</button>`:''}</div></td></tr>`));
  app.innerHTML=`${adminSession.role==='global'?'<div class="project-page-actions"><button id="new-project">创建项目</button></div>':''}<div id="project-table">${renderRows(data.projects)}</div>${paginationHtml('projects',params,data.pagination)}`;
  const newProject=document.querySelector('#new-project');
  if(newProject)newProject.onclick=projectForm;
  document.querySelectorAll('.project-detail').forEach(button=>button.onclick=()=>projectDetailForm(button.dataset.id));
  document.querySelectorAll('.copy-project-access').forEach(button=>button.onclick=()=>{
    const project=data.projects.find(item=>item.id===button.dataset.id);
    const revealed=revealedVirtualKeys.get(project.virtual_key_id);
    if(revealed?.key){
      copyText(integrationBundle(project.integration,revealed.key));
      return;
    }
    showKeyIntegration({id:project.virtual_key_id,key_prefix:project.virtual_key_prefix,key_last4:project.virtual_key_last4},project.integration,()=>modal.close());
  });
  document.querySelectorAll('.toggle-project').forEach(button=>button.onclick=async()=>{await api(`/projects/${button.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:button.dataset.status==='active'?'paused':'active'})});render('projects')});
  document.querySelectorAll('.delete-project').forEach(button=>button.onclick=()=>{
    const project=data.projects.find(item=>item.id===button.dataset.id);
    confirmAction(
      '删除项目',
      `将永久删除“${project?.name||'该项目'}”及其虚拟 Key、请求日志、额度、模型路由、IP 规则和告警。此操作不可恢复。`,
      '确认删除',
      async()=>{
        await api(`/projects/${button.dataset.id}/delete`,{method:'POST'});
        showToast('项目已删除');
        await render('projects');
      },
      {compact:true},
    );
  });
  bindPagination('projects',params);
}

async function providers(){
  const params=paginationParams();const data=await api(`/providers?${params}`);
  const preferred=['openai','anthropic','xai','google-gemini','deepseek'];
  const row=x=>`<tr><td><div class="brand-cell">${brandMark(x.slug,x.name)}<span><strong>${esc(x.name)}</strong><br><span class="metric-label">${esc(x.slug)} · ${esc(x.adapter_type)}</span></span></div></td><td>${esc(x.base_url)}</td><td>${status(x.status)}</td><td>${x.credential_count}</td><td>${x.today_requests} / ${x.today_failures}</td><td><div class="row-actions"><button class="ghost test-provider" data-id="${x.id}">测试</button><button class="ghost add-credential" data-id="${x.id}">更换 Key</button>${x.status!=='active'?`<button class="ghost toggle-provider" data-id="${x.id}" data-status="${x.status}">启用</button>`:''}<button class="danger delete-provider" data-id="${x.id}">删除</button></div></td></tr>`;
  const primary=data.providers.filter(x=>preferred.includes(x.slug)); const remaining=data.providers.filter(x=>!preferred.includes(x.slug));
  app.innerHTML=`<div class="project-page-actions"><button id="new-provider">添加供应商</button></div>${table(['供应商','地址','状态','凭证','今日请求 / 失败','操作'],primary.concat(remaining).map(row))}${paginationHtml('providers',params,data.pagination)}`;
  document.querySelector('#new-provider').onclick=()=>providerForm();
  document.querySelectorAll('.add-credential').forEach(button=>button.onclick=()=>credentialForm(button.dataset.id));
  document.querySelectorAll('.test-provider').forEach(button=>button.onclick=async()=>{
    const label=button.textContent;
    button.disabled=true;
    button.textContent='测试中…';
    try{
      const result=await api(`/providers/${button.dataset.id}/test`,{method:'POST'});
      showPageNotice(result.success?'测试成功':'配置有误',result.success?'success':'error');
    }catch{
      showPageNotice('配置有误','error');
    }finally{
      button.disabled=false;
      button.textContent=label;
    }
  });
  document.querySelectorAll('.toggle-provider').forEach(button=>button.onclick=()=>{const disabling=button.dataset.status==='active';confirmAction(disabling?'停用供应商':'启用供应商',disabling?'停用后该供应商、其凭证和模型将不能继续路由请求。':'恢复后可再次为该供应商配置模型和凭证。',disabling?'确认停用':'确认启用',async()=>{await api(`/providers/${button.dataset.id}/update`,{method:'POST',body:JSON.stringify({status:disabling?'disabled':'active'})});render('providers')})});
  document.querySelectorAll('.delete-provider').forEach(button=>button.onclick=()=>confirmAction('删除供应商','供应商的凭证和模型会被停用，历史请求日志仍会保留。','确认删除',async()=>{await api(`/providers/${button.dataset.id}/archive`,{method:'POST'});showToast('供应商已删除');await providers()},{compact:true}));
  bindPagination('providers',params);
}

async function models(){
  const params=paginationParams();const data=await api(`/models?${params}`);
  const providerOptions=[...new Map(data.models.map(x=>[x.provider_slug,x.provider_name])).entries()];
  const modelDomain=model=>['chat','image','video','embedding','audio','document'].includes(model.request_type)?model.request_type:'chat';
  const domainLabels={chat:'聊天 / 语言',image:'图片',video:'视频'};
  const show=rows=>table(['模型','别名','供应商模型 ID','供应商','地区','能力'],rows.map(x=>`<tr><td>${esc(x.name)}</td><td><code>${esc(x.alias)}</code></td><td>${esc(x.provider_model_id)}</td><td><div class="brand-cell">${providerCatalogueIdentity(x.provider_slug,x.provider_name)}</div></td><td>${modelRegionFlag(x)}</td><td>${esc(modelCapability(x))}</td></tr>`));
  const visibleDomains=Object.entries(domainLabels);
  app.innerHTML=`<div class="model-management-toolbar"><div class="category-tabs model-domain-tabs"><button class="active" data-domain="">全部（${data.pagination?.total||data.models.length}）</button>${visibleDomains.map(([key,label])=>`<button data-domain="${key}">${label}</button>`).join('')}</div><form class="log-filter" id="model-filter"><select name="provider"><option value="">当前页全部供应商</option>${providerOptions.map(([slug,name])=>`<option value="${esc(slug)}">${esc(name)}</option>`).join('')}</select><input name="query" autocomplete="off" placeholder="按模型、别名或供应商模糊搜索"></form><button id="new-model">添加模型</button></div><div id="model-table">${show(data.models)}</div>${paginationHtml('models',params,data.pagination)}`;
  bindProviderCatalogueIcons();
  document.querySelector('#new-model').onclick=modelForm;
  document.querySelectorAll('.edit-model').forEach(button=>button.onclick=()=>editModelForm(data.models.find(model=>model.id===button.dataset.id)));
  document.querySelectorAll('.toggle-model').forEach(button=>button.onclick=()=>{const disabling=button.dataset.status==='active';confirmAction(disabling?'停用模型':'启用模型',disabling?'停用后项目不能再调用这个模型。':'恢复后允许项目再次调用这个模型。',disabling?'确认停用':'确认启用',async()=>{await api(`/models/${button.dataset.id}/update`,{method:'POST',body:JSON.stringify({status:disabling?'disabled':'active'})});render('models')})});
  const filter=document.querySelector('#model-filter'); let selectedDomain='';const filterModels=()=>{const values=Object.fromEntries(new FormData(filter));const query=(values.query||'').toLowerCase().trim();const rows=data.models.filter(model=>(!selectedDomain||modelDomain(model)===selectedDomain)&&(!values.provider||model.provider_slug===values.provider)&&(!query||`${model.name} ${model.alias} ${model.provider_name} ${model.provider_model_id}`.toLowerCase().includes(query)));document.querySelector('#model-table').innerHTML=show(rows);bindProviderCatalogueIcons();bindModelActions();};
  filter.oninput=filterModels;filter.onchange=filterModels;
  document.querySelectorAll('.model-domain-tabs button').forEach(button=>button.onclick=()=>{selectedDomain=button.dataset.domain;document.querySelectorAll('.model-domain-tabs button').forEach(item=>item.classList.toggle('active',item===button));filterModels();});
  bindPagination('models',params);
  function bindModelActions(){document.querySelectorAll('.edit-model').forEach(button=>button.onclick=()=>editModelForm(data.models.find(model=>model.id===button.dataset.id)));document.querySelectorAll('.toggle-model').forEach(button=>button.onclick=()=>{const disabling=button.dataset.status==='active';confirmAction(disabling?'停用模型':'启用模型',disabling?'停用后项目不能再调用这个模型。':'恢复后允许项目再次调用这个模型。',disabling?'确认停用':'确认启用',async()=>{await api(`/models/${button.dataset.id}/update`,{method:'POST',body:JSON.stringify({status:disabling?'disabled':'active'})});render('models')})});}
}

async function model_entries(){
  const [entryData, modelData]=await Promise.all([api('/model-entries'),api('/models?page_size=100')]);
  const entries=entryData.entries||[];
  const projects=entryData.projects||[];
  const models=(modelData.models||[]).filter(model=>model.status==='active');
  const routeLabel=route=>`${route.provider_name} · ${route.name} (${route.provider_model_id})`;
  const routes=entry=>entry.routes?.length
    ? entry.routes.map((route,index)=>`<div class="model-entry-route"><b>${index===0?'主模型':'回退 '+index}</b><span>${esc(routeLabel(route))}</span></div>`).join('')
    : '<span class="metric-label">尚未配置可用模型</span>';
  const scope=entry=>entry.scope==='all'
    ? '<span class="status active">全部项目</span>'
    : `<span class="status warning">指定项目 · ${Number(entry.project_count||0)}</span>`;
  app.innerHTML=`<div class="section-head"><div><h2>模型入口</h2><p class="metric-label">为业务保留稳定的模型名称；第一个模型为主模型，其余会在失败时自动回退。原有项目模型配置不会被改动。</p></div><button id="new-model-entry">创建模型入口</button></div>${table(['稳定入口名称','主模型与自动回退','开放范围','状态','操作'],entries.map(entry=>`<tr><td><strong>${esc(entry.name)}</strong><br><code>${esc(entry.slug)}</code><br><span class="metric-label">${esc(entry.request_type)}</span></td><td class="model-entry-routes">${routes(entry)}</td><td>${scope(entry)}</td><td>${status(entry.status)}</td><td><div class="row-actions"><button class="ghost edit-model-entry" data-id="${entry.id}">编辑</button><button class="danger delete-model-entry" data-id="${entry.id}">删除</button></div></td></tr>`))}`;
  document.querySelector('#new-model-entry').onclick=()=>modelEntryForm(null,models,projects);
  document.querySelectorAll('.edit-model-entry').forEach(button=>button.onclick=()=>modelEntryForm(entries.find(entry=>entry.id===button.dataset.id),models,projects));
  document.querySelectorAll('.delete-model-entry').forEach(button=>button.onclick=()=>confirmAction('删除模型入口','删除后，业务将不能再通过这个稳定名称调用模型；原有项目模型和虚拟 Key 不受影响。','确认删除',async()=>{await api(`/model-entries/${button.dataset.id}/delete`,{method:'POST'});showToast('模型入口已删除');await model_entries();},{compact:true}));
}

function modelEntryForm(entry,models,projects){
  const existingRoutes=entry?.routes||[];
  const primaryId=existingRoutes[0]?.model_id||'';
  const fallbackIds=new Set(existingRoutes.slice(1).map(route=>route.model_id));
  const assigned=new Set(entry?.project_ids||[]);
  const requestTypes={chat:'聊天 / 语言',image:'图片',video:'视频',embedding:'嵌入',audio:'音频',document:'文档'};
  const modelOption=(model,selected=false)=>`<option value="${esc(model.id)}" data-request-type="${esc(model.request_type)}" ${selected?'selected':''}>${esc(model.provider_name)} · ${esc(model.name)} · ${esc(model.provider_model_id)}</option>`;
  openForm(`<section class="form-card"><h2>${entry?'编辑模型入口':'创建模型入口'}</h2><p class="metric-label">业务只调用稳定入口名称；系统依次使用主模型与回退模型。现有项目模型、虚拟 Key 与路由不受影响。</p><p class="form-error"></p><form class="fields model-entry-form"><label>显示名称<input required name="name" maxlength="120" value="${esc(entry?.name||'')}" placeholder="默认聊天模型"></label><label>稳定入口名称<input required name="slug" pattern="[a-z0-9][a-z0-9._:-]{0,127}" value="${esc(entry?.slug||'')}" placeholder="chat-default"><span class="metric-label">业务请求里的 model 值</span></label><label>请求类型<select name="request_type">${Object.entries(requestTypes).map(([value,label])=>`<option value="${value}" ${entry?.request_type===value?'selected':''}>${label}</option>`).join('')}</select></label><label>主模型<select required name="primary_model_id"><option value="">请选择主模型</option>${models.map(model=>modelOption(model,model.id===primaryId)).join('')}</select></label><label class="span-all">回退模型（可选，按列表顺序）<select name="fallback_model_ids" multiple size="5">${models.map(model=>modelOption(model,fallbackIds.has(model.id))).join('')}</select><span class="metric-label">主模型不可用或调用失败时，按这里的顺序自动尝试。</span></label><fieldset class="span-all"><legend>可用范围</legend><label class="check"><input type="radio" name="scope" value="all" ${!entry||entry.scope==='all'?'checked':''}>全部项目</label><label class="check"><input type="radio" name="scope" value="selected" ${entry?.scope==='selected'?'checked':''}>指定项目</label><label class="model-entry-projects">选择项目<select name="project_ids" multiple size="5">${projects.map(project=>`<option value="${esc(project.id)}" ${assigned.has(project.id)?'selected':''}>${esc(project.name)}</option>`).join('')}</select></label></fieldset>${entry?`<label>状态<select name="status"><option value="active" ${entry.status==='active'?'selected':''}>启用</option><option value="disabled" ${entry.status==='disabled'?'selected':''}>停用</option></select></label>`:' '}<div class="form-actions span-all"><button class="ghost" type="button" value="cancel">取消</button><button type="submit">${entry?'保存':'创建模型入口'}</button></div></form></section>`,async values=>{
    const primary=String(values.primary_model_id||'');
    const fallback=[...modalContent.querySelector('[name="fallback_model_ids"]').selectedOptions].map(option=>option.value).filter(id=>id!==primary);
    const scope=String(values.scope||'all');
    const projectIds=scope==='selected'?[...modalContent.querySelector('[name="project_ids"]').selectedOptions].map(option=>option.value):[];
    await api(entry?`/model-entries/${entry.id}`:'/model-entries',{method:entry?'PATCH':'POST',body:JSON.stringify({...values,scope,model_ids:[primary,...fallback],project_ids:projectIds})});
    showToast(entry?'模型入口已保存':'模型入口已创建');
    await model_entries();
  });
  const projectSelector=modalContent.querySelector('.model-entry-projects');
  const updateScope=()=>{projectSelector.hidden=modalContent.querySelector('[name="scope"]:checked').value!=='selected';};
  const updateModelType=()=>{
    const requestType=modalContent.querySelector('[name="request_type"]').value;
    modalContent.querySelectorAll('[name="primary_model_id"] option[data-request-type], [name="fallback_model_ids"] option[data-request-type]').forEach(option=>{
      const available=option.dataset.requestType===requestType;
      option.hidden=!available;
      if(!available)option.selected=false;
    });
  };
  modalContent.querySelectorAll('[name="scope"]').forEach(input=>input.addEventListener('change',updateScope));
  modalContent.querySelector('[name="request_type"]').addEventListener('change',updateModelType);
  updateScope();
  updateModelType();
}

async function pricing(){
  const params=paginationParams();const data=await api(`/models?${params}`);
  const providerOptions=[...new Map(data.models.map(model=>[model.provider_slug,model.provider_name])).entries()];
  const modelDomain=model=>['chat','image','video','embedding','audio','document'].includes(model.request_type)?model.request_type:'chat';
  const domainLabels={chat:'聊天 / 语言',image:'图片',video:'视频',embedding:'嵌入',audio:'音频',document:'文档'};
  const show=rows=>table(
    ['供应商','模型','供应商模型 ID','请求类型','价格（每百万 Token）'],
    rows.map(model=>`<tr><td><div class="brand-cell">${brandMark(model.provider_slug,model.provider_name)}<span>${esc(model.provider_name)}</span></div></td><td><strong>${esc(model.name)}</strong></td><td><code>${esc(model.provider_model_id)}</code></td><td>${esc(domainLabels[modelDomain(model)]||model.request_type)}</td><td>${unitPrice(model)}</td></tr>`),
  );
  app.innerHTML=`<div class="section-head"><div><h2>官方价格</h2><p class="metric-label">集中查看已配置模型的官方价格信息。</p></div></div><div class="category-tabs pricing-domain-tabs"><button class="active" data-domain="">全部（${data.pagination?.total||data.models.length}）</button>${Object.entries(domainLabels).map(([key,label])=>`<button data-domain="${key}">${label}</button>`).join('')}</div><form class="log-filter" id="pricing-filter"><select name="provider"><option value="">当前页全部供应商</option>${providerOptions.map(([slug,name])=>`<option value="${esc(slug)}">${esc(name)}</option>`).join('')}</select><input name="query" autocomplete="off" placeholder="按模型、供应商或供应商模型 ID 模糊搜索"></form><div id="pricing-table" class="pricing-table">${show(data.models)}</div>${paginationHtml('pricing',params,data.pagination)}`;
  const filter=document.querySelector('#pricing-filter');
  let selectedDomain='';
  const filterModels=()=>{
    const values=Object.fromEntries(new FormData(filter));
    const query=(values.query||'').toLowerCase().trim();
    const rows=data.models.filter(model=>(!selectedDomain||modelDomain(model)===selectedDomain)&&(!values.provider||model.provider_slug===values.provider)&&(!query||`${model.name} ${model.provider_name} ${model.provider_model_id}`.toLowerCase().includes(query)));
    document.querySelector('#pricing-table').innerHTML=show(rows);
  };
  filter.oninput=filterModels;
  filter.onchange=filterModels;
  document.querySelectorAll('.pricing-domain-tabs button').forEach(button=>button.onclick=()=>{
    selectedDomain=button.dataset.domain;
    document.querySelectorAll('.pricing-domain-tabs button').forEach(item=>item.classList.toggle('active',item===button));
    filterModels();
  });
  bindPagination('pricing',params);
}

async function legacyRequests(){
  const params=new URLSearchParams(location.hash.split('?')[1]||''); const data=await api(`/requests?${params}`);
  app.innerHTML=`<div class="section-head"><h2>最近 100 条请求</h2><button class="ghost" id="export-requests">导出 CSV</button></div><form id="request-filter" class="inline-form"><input name="project_id" value="${esc(params.get('project_id')||'')}" placeholder="项目 ID"><input name="source_ip" value="${esc(params.get('source_ip')||'')}" placeholder="来源 IP"><select name="status"><option value="">全部状态</option>${['succeeded','failed','rejected','processing'].map(s=>`<option ${params.get('status')===s?'selected':''} value="${s}">${s}</option>`).join('')}</select><button>筛选</button></form>${table(['Request ID','项目','模型','来源 IP','状态','HTTP','耗时','费用','时间','操作'],data.requests.map(x=>`<tr><td><code>${esc(x.id)}</code></td><td>${esc(x.project_name||'—')}</td><td>${esc(x.model_alias||'—')}</td><td>${esc(x.source_ip||'—')}</td><td>${status(x.status)}</td><td>${esc(x.http_status||'—')}</td><td>${x.duration_ms??'—'}ms</td><td>${money(x.estimated_cost_cents)}</td><td>${new Date(x.started_at).toLocaleString()}</td><td><button class="ghost request-detail" data-id="${x.id}">详情</button></td></tr>`))}`;
  attachValidatedSubmit(document.querySelector('#request-filter'),async values=>{location.hash=`requests?${new URLSearchParams(values)}`},{closeOnSuccess:false});
  document.querySelector('#export-requests').onclick=()=>location.assign(`/admin/api/requests/export?${params}`);
  document.querySelectorAll('.request-detail').forEach(button=>button.onclick=()=>requestDetailForm(button.dataset.id));
}

async function requests(){
  const params=paginationParams();const data=await api(`/requests?${params}`);const value=key=>esc(params.get(key)||'');
  const compactRequestId=id=>{const text=String(id||'—');return text.length>20?`${text.slice(0,12)}…${text.slice(-6)}`:text};
  app.innerHTML=`<div class="section-head"><h2>请求日志</h2><button class="ghost" id="export-requests">导出 CSV</button></div><form id="request-filter" class="log-filter request-filter"><input name="project_id" value="${value('project_id')}" placeholder="项目 ID"><input name="virtual_key_id" value="${value('virtual_key_id')}" placeholder="虚拟 Key ID"><input name="source_ip" value="${value('source_ip')}" placeholder="来源 IP"><select name="status"><option value="">全部状态</option>${['succeeded','failed','rejected','processing'].map(s=>`<option ${params.get('status')===s?'selected':''} value="${s}">${s}</option>`).join('')}</select><button>筛选</button><button class="ghost" type="reset" id="clear-request-filter">清除</button></form><div class="request-table">${table(['时间','Request ID','项目','模型','来源 IP','状态','HTTP','耗时','费用','操作'],data.requests.map(x=>`<tr><td>${new Date(x.started_at).toLocaleString()}</td><td><code title="${esc(x.id)}">${esc(compactRequestId(x.id))}</code></td><td>${esc(x.project_name||'—')}</td><td>${esc(x.model_alias||'—')}</td><td>${esc(x.source_ip||'—')}</td><td>${status(x.status)}</td><td>${esc(x.http_status||'—')}</td><td>${x.duration_ms??'—'}ms</td><td>${money(x.estimated_cost_cents)}</td><td><button class="ghost request-detail" data-id="${x.id}">详情</button></td></tr>`))}</div>${paginationHtml('requests',params,data.pagination)}`;
  attachValidatedSubmit(document.querySelector('#request-filter'),async values=>{const query=new URLSearchParams(Object.entries(values).filter(([,value])=>value));query.set('page_size',params.get('page_size')||'10');location.hash=`requests?${query}`},{closeOnSuccess:false});
  document.querySelector('#clear-request-filter').onclick=()=>location.hash='requests';document.querySelector('#export-requests').onclick=()=>{const exportParams=new URLSearchParams(params);exportParams.delete('page');exportParams.delete('page_size');location.assign(`/admin/api/requests/export?${exportParams}`)};document.querySelectorAll('.request-detail').forEach(button=>button.onclick=()=>requestDetailForm(button.dataset.id));bindPagination('requests',params);
}
async function jobs(){const params=paginationParams();const data=await api(`/jobs?${params}`);app.innerHTML=`<div class="section-head"><h2>异步任务</h2></div>${table(['任务 ID','类型','项目','模型','状态','上游任务 ID','更新时间'],data.jobs.map(x=>`<tr><td><code>${esc(x.id)}</code></td><td>${esc(x.type)}</td><td>${esc(x.project_name||'—')}</td><td>${esc(x.model_alias||'—')}</td><td>${status(x.status)}</td><td>${esc(x.provider_job_id||'—')}</td><td>${new Date(x.updated_at).toLocaleString()}</td></tr>`))}${paginationHtml('jobs',params,data.pagination)}`;bindPagination('jobs',params);}

async function allActiveModels(){
  const models=[];
  let page=1;
  let totalPages=1;
  do{
    const data=await api(`/models?page=${page}&page_size=100`);
    models.push(...(data.models||[]));
    totalPages=Math.max(1,Number(data.pagination?.total_pages||1));
    page+=1;
  }while(page<=totalPages);
  return models;
}

function docsCodeBlock(title,code,index){
  return `<section class="docs-code-card"><div class="docs-code-heading"><h3>${esc(title)}</h3><button class="ghost" type="button" data-doc-copy="${index}">复制</button></div><pre><code>${esc(code)}</code></pre></section>`;
}

function docsParameterCard(title,endpoint,rows){
  return `<section class="docs-parameter-card"><div class="docs-parameter-heading"><div><h3>${esc(title)}</h3><code>${esc(endpoint)}</code></div></div>${table(['参数','是否必填','类型','说明'],rows.map(row=>`<tr><td><code>${esc(row[0])}</code></td><td><span class="docs-required ${row[1]==='必填'?'yes':''}">${esc(row[1])}</span></td><td>${esc(row[2])}</td><td>${esc(row[3])}</td></tr>`))}</section>`;
}

async function docs(){
  const models=await allActiveModels();
  const typeLabels={chat:'聊天',image:'图片',video:'视频',embedding:'嵌入',audio:'音频',document:'文档'};
  const deepseek=models.find(model=>model.provider_slug==='deepseek'&&model.request_type==='chat');
  const imageModel=models.find(model=>model.provider_slug==='volcengine-ark'&&model.request_type==='image')||models.find(model=>model.request_type==='image');
  const videoModel=models.find(model=>model.provider_slug==='volcengine-ark'&&model.request_type==='video')||models.find(model=>model.request_type==='video');
  const gatewayBase=location.origin;
  const virtualKey='<VIRTUAL_KEY>';
  const deepseekAlias=deepseek?.alias||'<DEEPSEEK_MODEL_ALIAS>';
  const imageAlias=imageModel?.alias||'<IMAGE_MODEL_ALIAS>';
  const videoAlias=videoModel?.alias||'<VIDEO_MODEL_ALIAS>';
  const curl=(path,body)=>`curl ${gatewayBase}${path} \\
  -H "Authorization: Bearer ${virtualKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body,null,2)}'`;
  const snippets=[
    `curl ${gatewayBase}/v1/models \\
  -H "Authorization: Bearer ${virtualKey}"`,
    curl('/v1/chat/completions',{
      model:deepseekAlias,
      messages:[
        {role:'system',content:'You are a helpful assistant.'},
        {role:'user',content:'请用三句话介绍 Cloudflare Workers。'},
      ],
      stream:false,
      temperature:0.7,
      max_tokens:1024,
    }),
    curl('/v1/images/generations',{
      model:imageAlias,
      prompt:'一艘纸船漂浮在安静的湖面，电影感光影',
      size:'2K',
      response_format:'url',
      sequential_image_generation:'disabled',
      stream:false,
      watermark:false,
    }),
    curl('/v1/videos/generations',{
      model:videoAlias,
      content:[{type:'text',text:'一艘飞船从云海上空快速掠过，电影感镜头'}],
      duration:5,
      resolution:'720p',
      ratio:'16:9',
      watermark:false,
    }),
    `curl ${gatewayBase}/v1/jobs/<OPENPASS_JOB_ID> \\
  -H "Authorization: Bearer ${virtualKey}"`,
  ];
  const counts=Object.fromEntries(Object.keys(typeLabels).map(type=>[type,models.filter(model=>model.request_type===type).length]));
  const modelRows=modelList=>modelList.map(model=>`<tr><td><div class="brand-cell">${brandMark(model.provider_slug,model.provider_name)}<span><strong>${esc(model.provider_name)}</strong><br><span class="metric-label">${esc(model.provider_slug)}</span></span></div></td><td><strong>${esc(model.name)}</strong></td><td><code>${esc(model.alias)}</code></td><td>${esc(typeLabels[model.request_type]||model.request_type)}</td><td><code>${esc(model.provider_model_id)}</code></td></tr>`);

  app.innerHTML=`<div class="docs-page">
    <section class="docs-hero">
      <div><span class="docs-kicker">OPENPASS API</span><h2>统一调用指南</h2><p>给每位同事或每个项目签发独立虚拟 Key。调用方只接触虚拟 Key，供应商真实 Key 始终保留在 OpenPass 服务端。</p></div>
      <div class="docs-base-url"><span>Base URL</span><code>${esc(gatewayBase)}</code><button class="ghost" type="button" data-doc-copy-base>复制</button></div>
    </section>
    <div class="docs-summary">
      <article><span>全部启用模型</span><strong>${models.length}</strong></article>
      <article><span>聊天</span><strong>${counts.chat||0}</strong></article>
      <article><span>图片</span><strong>${counts.image||0}</strong></article>
      <article><span>视频</span><strong>${counts.video||0}</strong></article>
    </div>
    <section class="docs-callout"><strong>安全要求</strong><p>虚拟 Key 只能保存在服务端环境变量、Secret Manager 或 CI/CD Secret 中，禁止写进浏览器前端、公开仓库和客户端安装包。</p></section>

    <section class="docs-section">
      <div class="docs-section-heading"><div><span>01</span><h2>查询这个虚拟 Key 可用的模型</h2></div><p>上方统计是后台全局启用模型；业务项目实际能调用哪些模型，以携带该项目虚拟 Key 的 <code>GET /v1/models</code> 返回结果为准。调用时使用返回的公开模型别名，不要使用供应商模型 ID。</p></div>
      ${docsCodeBlock('查询项目可用模型',snippets[0],0)}
      <div class="docs-model-toolbar"><input id="docs-model-search" placeholder="搜索模型、别名或供应商"><select id="docs-model-type"><option value="">全部类型</option>${Object.entries(typeLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div>
      <section class="section docs-model-table">${table(['供应商','模型','OpenPass 调用别名','类型','供应商模型 ID'],modelRows(models))}</section>
    </section>

    <section class="docs-section">
      <div class="docs-section-heading"><div><span>02</span><h2>调用 DeepSeek 聊天</h2></div><p>接口兼容 OpenAI Chat Completions。当前示例自动选用已启用的 DeepSeek 模型别名：<code>${esc(deepseekAlias)}</code>。</p></div>
      ${docsCodeBlock('DeepSeek Chat Completions',snippets[1],1)}
      ${docsParameterCard('DeepSeek 聊天参数','POST /v1/chat/completions',[
        ['model','必填','string','GET /v1/models 返回的 DeepSeek 公开别名。'],
        ['messages','必填','array','对话消息数组；每项包含 role 和 content。'],
        ['stream','可选','boolean','true 使用 SSE 流式返回；false 一次性返回。'],
        ['temperature','可选','number','采样随机度；建议按具体 DeepSeek 模型能力设置。'],
        ['max_tokens','可选','integer','限制本次生成的最大输出 Token 数。'],
        ['response_format','可选','object','需要 JSON 输出时传入供应商支持的格式配置。'],
      ])}
    </section>

    <section class="docs-section">
      <div class="docs-section-heading"><div><span>03</span><h2>调用图片生成</h2></div><p>方舟标准图片生成是同步或流式响应，不需要轮询任务。<code>stream=false</code> 时等待生成完成并直接返回图片 URL/Base64。</p></div>
      ${docsCodeBlock('图片生成',snippets[2],2)}
      ${docsParameterCard('火山方舟 Seedream 图片参数','POST /v1/images/generations',[
        ['model','必填','string','GET /v1/models 返回的图片模型公开别名。'],
        ['prompt','必填','string','图片生成或编辑指令。'],
        ['image','可选','string | array','参考图片 URL 或 Base64；多图能力取决于具体模型。'],
        ['size','可选','string','例如 2K，或供应商支持的宽高像素值。'],
        ['response_format','可选','string','url 或 b64_json。'],
        ['sequential_image_generation','可选','string','disabled 生成单图；auto 允许模型生成组图。'],
        ['sequential_image_generation_options','可选','object','组图数量等配置，仅 auto 模式生效。'],
        ['stream','可选','boolean','Seedream 支持时可逐张流式返回。'],
        ['seed','可选','integer','固定随机种子以提高结果可复现性。'],
        ['guidance_scale','可选','number','提示词相关度控制，取值按供应商模型说明。'],
        ['watermark','可选','boolean','是否添加供应商水印。'],
      ])}
    </section>

    <section class="docs-section">
      <div class="docs-section-heading"><div><span>04</span><h2>调用视频生成</h2></div><p>视频创建后返回 OpenPass 内部任务 ID。请保存响应中的 <code>id</code>，并使用该 ID 查询；不要用 <code>provider_job_id</code> 调用 OpenPass 查询接口。</p></div>
      <div class="docs-code-grid">${docsCodeBlock('创建视频任务',snippets[3],3)}${docsCodeBlock('查询视频任务',snippets[4],4)}</div>
      ${docsParameterCard('火山方舟 Seedance 视频参数','POST /v1/videos/generations',[
        ['model','必填','string','GET /v1/models 返回的视频模型公开别名。'],
        ['content','必填','array','内容数组；文本项使用 type=text、text，参考图使用供应商支持的 image_url 格式。'],
        ['duration','可选','integer','视频时长（秒），可选值取决于具体 Seedance 模型。'],
        ['resolution','可选','string','例如 720p 或 1080p，必须是模型支持的分辨率。'],
        ['ratio','可选','string','例如 16:9、9:16、1:1。'],
        ['seed','可选','integer','随机种子。'],
        ['camera_fixed','可选','boolean','是否固定镜头，具体支持情况取决于模型。'],
        ['watermark','可选','boolean','是否添加供应商水印。'],
      ])}
      <section class="docs-status-card"><h3>任务状态</h3><div><code>queued</code><span>排队中</span><code>processing</code><span>生成中</span><code>succeeded</code><span>成功，读取 result_url</span><code>failed</code><span>失败</span><code>cancelled</code><span>已取消</span><code>expired</code><span>已过期</span></div></section>
    </section>
  </div>`;

  const renderFilteredModels=()=>{
    const query=document.querySelector('#docs-model-search').value.trim().toLowerCase();
    const type=document.querySelector('#docs-model-type').value;
    const filtered=models.filter(model=>(!type||model.request_type===type)&&(!query||`${model.provider_name} ${model.provider_slug} ${model.name} ${model.alias} ${model.provider_model_id}`.toLowerCase().includes(query)));
    document.querySelector('.docs-model-table tbody').innerHTML=modelRows(filtered).join('')||'<tr><td class="empty" colspan="5">没有匹配模型</td></tr>';
  };
  document.querySelector('#docs-model-search').oninput=renderFilteredModels;
  document.querySelector('#docs-model-type').onchange=renderFilteredModels;
  document.querySelectorAll('[data-doc-copy]').forEach(button=>button.onclick=()=>copyText(snippets[Number(button.dataset.docCopy)],'调用示例已复制'));
  document.querySelector('[data-doc-copy-base]').onclick=()=>copyText(gatewayBase,'Base URL 已复制');
}

async function alerts(){
  const params=paginationParams();
  const query=params.toString();
  const [data,projectsData]=await Promise.all([api(`/alerts${query?`?${query}`:''}`),api('/projects?page_size=100')]);
  const summary=data.summary||{};
  const value=key=>esc(params.get(key)||'');
  const rows=(data.alerts||[]).map(alert=>{
    const actions=alert.status==='open'
      ? `<button class="ghost alert-status" data-id="${alert.id}" data-next="acknowledged">确认告警</button><button class="ghost alert-status" data-id="${alert.id}" data-next="resolved">解决告警</button>`
      : alert.status==='acknowledged'
        ? `<button class="ghost alert-status" data-id="${alert.id}" data-next="open">重新打开</button><button class="ghost alert-status" data-id="${alert.id}" data-next="resolved">解决告警</button>`
        : `<button class="ghost alert-status" data-id="${alert.id}" data-next="open">重新打开</button>`;
    return `<tr><td><strong>${esc(alert.type)}</strong><br><span class="metric-label">${esc(alert.message)}</span></td><td>${esc(alert.project_name||'全局告警')}</td><td>${status(alert.severity)}</td><td>${status(alert.status)}</td><td>${localDate(alert.created_at)}${alert.resolved_at?`<br><span class="metric-label">解决于 ${localDate(alert.resolved_at)}</span>`:''}</td><td><div class="row-actions">${actions}</div></td></tr>`;
  });
  app.innerHTML=`<div class="section-head"><div><h2>告警中心</h2><p class="metric-label">集中处理额度、错误率、请求突增、来源 IP 和凭证健康告警。</p></div></div>
  <div class="alert-summary-grid">
    <button class="alert-summary-card" type="button" data-status=""><span>告警总数</span><strong>${Number(summary.total||0).toLocaleString()}</strong></button>
    <button class="alert-summary-card is-open" type="button" data-status="open"><span>待处理</span><strong>${Number(summary.open||0).toLocaleString()}</strong></button>
    <button class="alert-summary-card is-acknowledged" type="button" data-status="acknowledged"><span>已确认</span><strong>${Number(summary.acknowledged||0).toLocaleString()}</strong></button>
    <button class="alert-summary-card is-resolved" type="button" data-status="resolved"><span>已解决</span><strong>${Number(summary.resolved||0).toLocaleString()}</strong></button>
    <button class="alert-summary-card is-critical" type="button" data-severity="critical"><span>严重告警</span><strong>${Number(summary.critical||0).toLocaleString()}</strong></button>
  </div>
  <form id="alert-filter" class="log-filter">
    <select name="status"><option value="">全部状态</option>${['open','acknowledged','resolved'].map(item=>`<option value="${item}" ${params.get('status')===item?'selected':''}>${item}</option>`).join('')}</select>
    <select name="severity"><option value="">全部严重度</option>${['critical','warning','info'].map(item=>`<option value="${item}" ${params.get('severity')===item?'selected':''}>${item}</option>`).join('')}</select>
    <select name="project_id"><option value="">全部项目</option>${projectsData.projects.map(project=>`<option value="${project.id}" ${params.get('project_id')===project.id?'selected':''}>${esc(project.name)}</option>`).join('')}</select>
    <input name="query" value="${value('query')}" placeholder="搜索告警类型、内容或项目">
    <button type="submit">应用筛选</button><button class="ghost" id="clear-alert-filter" type="button">清除</button>
  </form>
  <section class="section alert-table-section">${table(['告警','项目','严重度','状态','时间','操作'],rows)}</section>${paginationHtml('alerts',params,data.pagination)}`;
  attachValidatedSubmit(document.querySelector('#alert-filter'),async values=>{const next=new URLSearchParams(Object.entries(values).filter(([,item])=>item));next.set('page_size',params.get('page_size')||'10');location.hash=`alerts?${next}`},{closeOnSuccess:false});
  document.querySelector('#clear-alert-filter').onclick=()=>{location.hash='alerts'};
  document.querySelectorAll('.alert-summary-card').forEach(button=>button.onclick=()=>{const next=new URLSearchParams(params);next.delete('page');if(button.dataset.status!==undefined){button.dataset.status?next.set('status',button.dataset.status):next.delete('status')}if(button.dataset.severity){next.set('severity',button.dataset.severity)}else if(button.dataset.status!==undefined){next.delete('severity')}location.hash=`alerts${next.size?`?${next}`:''}`});
  document.querySelectorAll('.alert-status').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/alerts/${button.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:button.dataset.next})});showToast('告警状态已更新');await alerts()}catch(error){showToast(error.message,'error')}finally{button.disabled=false}});
  bindPagination('alerts',params);
}

async function settings(){const data=await api('/settings');const s=data.settings;openSettings(s);}
function openSettings(s){app.innerHTML=`<section class="form-card settings-card"><h2>系统默认与保留策略</h2><p class="notice">变更会审计；请求元数据保留天数由每日计划任务执行清理。</p><p class="form-error"></p><form id="settings-form" class="fields"><label>默认日志策略<select name="default_log_policy">${['metadata','request','full'].map(x=>`<option ${s.default_log_policy===x?'selected':''}>${x}</option>`).join('')}</select></label><label>默认 IP 记录<select name="default_ip_logging">${['masked','full','none'].map(x=>`<option ${s.default_ip_logging===x?'selected':''}>${x}</option>`).join('')}</select></label><label>默认供应商超时（毫秒）<input type="number" min="1" name="default_timeout_ms" value="${esc(s.default_timeout_ms||60000)}"></label><label>默认重试次数<input type="number" min="0" name="default_retry_count" value="${esc(s.default_retry_count||1)}"></label><label>请求元数据保留天数<input type="number" min="1" name="request_metadata_retention_days" value="${esc(s.request_metadata_retention_days||180)}"></label><label>原始 IP 保留天数<input type="number" min="1" name="raw_ip_retention_days" value="${esc(s.raw_ip_retention_days||30)}"></label><label>告警预警阈值（%）<input type="number" min="1" max="100" name="alert_threshold_warning" value="${esc(s.alert_threshold_warning||70)}"></label><label>告警严重阈值（%）<input type="number" min="1" max="100" name="alert_threshold_critical" value="${esc(s.alert_threshold_critical||90)}"></label><div class="form-actions"><button>保存设置</button></div></form></section>`;attachValidatedSubmit(document.querySelector('#settings-form'),async payload=>{await api('/settings',{method:'PATCH',body:JSON.stringify(payload)});render('settings')},{closeOnSuccess:false})}

const auditObjectLabels={
  project:'项目',virtual_key:'虚拟 Key',provider:'供应商',provider_credential:'供应商凭证',model:'模型',
  project_ip_rule:'来源 IP 规则',project_admin:'项目管理员',project_webhook:'Webhook',alert:'告警',
  request:'请求',system_settings:'系统设置'
};
const auditActionLabels={
  'project.create':'创建项目','project.update':'修改项目','project.status':'更改项目状态','project.delete':'删除项目',
  'virtual_key.create':'创建虚拟 Key','virtual_key.rotate':'轮换虚拟 Key','virtual_key.revoke':'撤销虚拟 Key','virtual_key.status':'更改虚拟 Key 状态',
  'provider.create':'添加供应商','provider.update':'修改供应商','provider.archive':'删除供应商','provider.test':'测试供应商连接',
  'credential.create':'添加供应商凭证','credential.replace':'更换供应商凭证','credential.update':'修改供应商凭证','credential.erase':'永久擦除供应商凭证','credential.status':'更改供应商凭证状态',
  'model.create':'添加模型','model.update':'修改模型',
  'project_ip_rule.create':'添加来源 IP 规则','project_ip_rule.update':'修改来源 IP 规则','project_ip_rule.delete':'删除来源 IP 规则',
  'project_admin.create':'添加项目管理员','project_admin.update':'修改项目管理员','project_admin.delete':'移除项目管理员',
  'project_webhook.create':'添加 Webhook','project_webhook.update':'修改 Webhook','project_webhook.delete':'删除 Webhook',
  'request.view':'查看请求详情','request.view_sensitive':'查看请求敏感内容','request.export':'导出请求日志',
  'alert.status':'更改告警状态','settings.update':'修改系统设置'
};
function humanAuditAction(action){
  if(auditActionLabels[action])return auditActionLabels[action];
  const [object,operation]=String(action||'').split('.');
  const operations={create:'创建',update:'修改',delete:'删除',archive:'删除',status:'更改状态',view:'查看',export:'导出',test:'测试'};
  return `${operations[operation]||'执行操作'}${auditObjectLabels[object]||'记录'}`;
}

async function audit(){
  const params=paginationParams();
  const data=await api(`/audit-logs?${params}`);
  const pagination=data.pagination||{page:1,page_size:10,total:data.audit_logs.length,total_pages:1};
  const start=(pagination.page-1)*pagination.page_size;
  const rows=data.audit_logs.map((entry,index)=>{
    const typeLabel=auditObjectLabels[entry.object_type]||'系统对象';
    const fallbackId=entry.object_id&&entry.object_id!=='global'?`编号 ${String(entry.object_id).slice(0,8)}…`:'全局配置';
    return `<tr><td>${start+index+1}</td><td><time datetime="${esc(entry.created_at)}">${new Date(entry.created_at).toLocaleString()}</time></td><td><strong>${esc(typeLabel)}</strong><br><span class="metric-label">${esc(entry.object_name||fallbackId)}</span></td><td><span class="audit-action">${esc(humanAuditAction(entry.action))}</span></td><td>${esc(entry.actor_email||'系统任务')}</td><td><code>${esc(entry.source_ip||'—')}</code></td></tr>`;
  });
  app.innerHTML=`<section class="section audit-table-section">${table(['序号','时间','对象','动作','操作人','来源 IP'],rows)}</section>
    ${paginationHtml('audit',params,pagination)}`;
  bindPagination('audit',params);
}

function fieldLabel(field){
  const label=field.closest('label');
  if(label){
    const clone=label.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button,.field-error,.preset-options').forEach(node=>node.remove());
    const text=clone.textContent.trim();
    if(text)return text;
  }
  return field.getAttribute('aria-label')||field.getAttribute('placeholder')||field.name||'此字段';
}
function fieldValidationMessage(field){
  const name=fieldLabel(field);
  if(field.validity.valueMissing)return `请填写${name}。`;
  if(field.validity.typeMismatch)return field.type==='email'?`请输入有效的${name}，例如 name@example.com。`:`请输入有效的${name}。`;
  if(field.validity.patternMismatch)return `${name}格式不正确，只能使用小写字母、数字、下划线和连字符。`;
  if(field.validity.rangeUnderflow)return `${name}不能小于 ${field.min}。`;
  if(field.validity.rangeOverflow)return `${name}不能大于 ${field.max}。`;
  if(field.validity.stepMismatch||field.validity.badInput)return `${name}必须是有效数字。`;
  if(field.validity.tooShort)return `${name}至少需要 ${field.minLength} 个字符。`;
  if(field.validity.tooLong)return `${name}最多允许 ${field.maxLength} 个字符。`;
  return `${name}填写有误，请检查后重试。`;
}
function clearFieldErrors(form){
  form.querySelectorAll('.field-error').forEach(node=>node.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach(field=>field.removeAttribute('aria-invalid'));
  const summary=form.closest('.form-card')?.querySelector('.form-error');
  if(summary)summary.textContent='';
}
function validateForm(form){
  clearFieldErrors(form);
  const invalid=[...form.elements].filter(field=>field.willValidate&&!field.validity.valid);
  invalid.forEach(field=>{
    field.setAttribute('aria-invalid','true');
    const message=document.createElement('span');
    message.className='field-error';
    message.textContent=fieldValidationMessage(field);
    (field.closest('label')||field.parentElement).append(message);
  });
  if(!invalid.length)return true;
  const summary=form.closest('.form-card')?.querySelector('.form-error');
  if(summary)summary.textContent=`请检查表单：${invalid.map(fieldLabel).join('、')}。`;
  invalid[0].focus();
  invalid[0].scrollIntoView({block:'center',behavior:'smooth'});
  return false;
}
function showFormError(form,error){
  const target=form.closest('.form-card')?.querySelector('.form-error');
  if(target){
    target.textContent=error?.message||'操作失败，请检查填写内容后重试。';
    target.scrollIntoView({block:'nearest',behavior:'smooth'});
  }else{
    console.error(error);
  }
}
function attachValidatedSubmit(form,submit,{closeOnSuccess=true}={}){
  form.noValidate=true;
  form.closest('.form-card')?.querySelector('.form-error')?.setAttribute('role','alert');
  form.querySelectorAll('input,select,textarea').forEach(field=>field.addEventListener('input',()=>{
    field.removeAttribute('aria-invalid');
    field.closest('label')?.querySelector('.field-error')?.remove();
    if(!form.querySelector('[aria-invalid="true"]')){
      const summary=form.closest('.form-card')?.querySelector('.form-error');
      if(summary)summary.textContent='';
    }
  }));
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!validateForm(form))return;
    const button=form.querySelector('button[type="submit"],button:not([type])');
    const originalText=button?.textContent;
    if(button){button.disabled=true;button.textContent='正在提交…';}
    try{
      await submit(Object.fromEntries(new FormData(form)));
      if(closeOnSuccess&&modalContent.contains(form))modal.close();
    }catch(error){
      showFormError(form,error);
    }finally{
      if(button&&modalContent.contains(button)){button.disabled=false;button.textContent=originalText;}
    }
  };
}
function openForm(html, submit){modalContent.innerHTML=html;modal.showModal();modalContent.querySelector('[value="cancel"]')?.addEventListener('click',()=>modal.close());const form=modalContent.querySelector('form');if(form)attachValidatedSubmit(form,submit);}
async function legacyProjectDetailForm(projectId){
  const [detail,modelData]=await Promise.all([api(`/projects/${projectId}`),api('/models?page_size=100')]); const p=detail.project; const allowed=new Set(detail.models.map(m=>m.id));
  const keys=detail.keys.map(k=>`<tr><td>${esc(k.name)}</td><td><code>${esc(k.key_prefix)}…${esc(k.key_last4)}</code></td><td>${status(k.status)}</td><td>${k.last_used_at?new Date(k.last_used_at).toLocaleString():'—'}</td><td>${k.status==='active'?`<button class="ghost key-rotate" data-id="${k.id}">轮换</button> <button class="danger key-status" data-id="${k.id}" data-status="${k.status}">禁用</button>`:k.status==='revoked'?'—':`<button class="danger key-status" data-id="${k.id}" data-status="${k.status}">撤销</button>`}</td></tr>`).join('');
  openForm(`<section class="form-card wide"><h2>管理项目：${esc(p.name)}</h2><p class="form-error"></p><form class="fields"><label>项目名称<input required name="name" value="${esc(p.name)}"></label><label>联系人邮箱<input name="contact_email" type="email" value="${esc(p.contact_email||'')}"></label><label>环境<select name="environment">${['development','staging','production'].map(v=>`<option ${p.environment===v?'selected':''}>${v}</option>`).join('')}</select></label><label>日志策略<select name="log_policy">${['metadata','request','full'].map(v=>`<option ${p.log_policy===v?'selected':''}>${v}</option>`).join('')}</select></label><label>IP 记录<select name="ip_logging">${['masked','full','none'].map(v=>`<option ${p.ip_logging===v?'selected':''}>${v}</option>`).join('')}</select></label><label>RPM<input name="rpm_limit" type="number" min="1" value="${p.rpm_limit}"></label><label>并发上限<input name="concurrency_limit" type="number" min="1" value="${p.concurrency_limit}"></label><label>日请求上限<input name="daily_request_limit" type="number" min="1" value="${p.daily_request_limit||''}"></label><label>月请求上限<input name="monthly_request_limit" type="number" min="1" value="${p.monthly_request_limit||''}"></label><label>日费用上限（分）<input name="daily_cost_limit_cents" type="number" min="1" value="${p.daily_cost_limit_cents||''}"></label><label>月费用上限（分）<input name="monthly_cost_limit_cents" type="number" min="1" value="${p.monthly_cost_limit_cents||''}"></label><fieldset><legend>允许调用的模型</legend>${modelData.models.filter(m=>m.status==='active').map(m=>`<label class="check"><input type="checkbox" name="model_ids" value="${m.id}" ${allowed.has(m.id)?'checked':''}>${esc(m.alias)}</label>`).join('')||'<p class="metric-label">暂无可用模型</p>'}</fieldset><div class="form-actions"><button class="ghost" type="button" value="cancel">关闭</button><button>保存项目设置</button></div></form><h3>虚拟 Key（只展示掩码）</h3>${table(['名称','Key','状态','最近使用','操作'],detail.keys.length?[keys]:[])}</section>`,async f=>{const limits=Object.fromEntries(Object.entries(f).filter(([k,v])=>k.includes('limit')&&v).map(([k,v])=>[k,Number(v)]));const model_ids=[...modalContent.querySelectorAll('input[name="model_ids"]:checked')].map(input=>input.value);await api(`/projects/${projectId}`,{method:'PATCH',body:JSON.stringify({...f,limits,model_ids})});render('projects')});
  modalContent.querySelectorAll('.key-status').forEach(button=>button.onclick=()=>{const action=button.dataset.status==='active'?'禁用':'撤销';confirmAction(`${action}虚拟 Key`,`${action}后，此 Key 将不能再用于调用项目接口。`,`确认${action}`,async()=>{await api(`/virtual-keys/${button.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:button.dataset.status==='active'?'disabled':'revoked'})});await projectDetailForm(projectId);});});
  modalContent.querySelectorAll('.key-rotate').forEach(button=>button.onclick=()=>confirmAction('轮换虚拟 Key','旧 Key 会立即停止认证，新 Key 只展示一次。','确认轮换',async()=>{const result=await api(`/virtual-keys/${button.dataset.id}/rotate`,{method:'POST',body:JSON.stringify({})});modalContent.innerHTML=`<section class="form-card"><h2>新虚拟 Key 已创建</h2><div class="notice">立即复制此 Key；关闭后无法再次查看。旧 Key 已进入轮换状态。</div><code style="display:block;overflow-wrap:anywhere">${esc(result.virtual_key)}</code><div class="form-actions"><button id="back-project">返回项目</button></div></section>`;modal.showModal();modalContent.querySelector('#back-project').onclick=()=>projectDetailForm(projectId);}));
}
async function projectDetailForm(projectId){
  await legacyProjectDetailForm(projectId);
  const [detail,modelData,keyData]=await Promise.all([api(`/projects/${projectId}`),api('/models?page_size=100'),api(`/projects/${projectId}/keys`)]);
  const limitsByModel=new Map(detail.models.map(m=>[m.id,m]));
  const fieldset=modalContent.querySelector('fieldset');
  if(!fieldset)return;
  fieldset.innerHTML=`<legend>允许调用的模型与独立费用上限（分）</legend>${modelData.models.filter(m=>m.status==='active').map(m=>{const limit=limitsByModel.get(m.id)||{};return `<div class="model-limit-row"><label class="check"><input type="checkbox" name="model_ids" value="${m.id}" ${limitsByModel.has(m.id)?'checked':''}>${brandMark(m.provider_slug,m.provider_name)} ${esc(m.alias)}</label><input name="model_daily_${m.id}" type="number" min="1" value="${limit.daily_cost_limit_cents||''}" placeholder="日费用上限"><input name="model_monthly_${m.id}" type="number" min="1" value="${limit.monthly_cost_limit_cents||''}" placeholder="月费用上限"></div>`}).join('')||'<p class="metric-label">暂无可用模型。</p>'}`;
  const form=modalContent.querySelector('form');
  attachValidatedSubmit(form,async values=>{const limits=Object.fromEntries(Object.entries(values).filter(([key,value])=>key.includes('limit')&&value).map(([key,value])=>[key,Number(value)]));const model_ids=[...form.querySelectorAll('input[name="model_ids"]:checked')].map(input=>input.value);if(!model_ids.length)throw new Error('请至少选择一个允许调用的模型。');const model_limits=Object.fromEntries(model_ids.map(modelId=>[modelId,{daily_cost_limit_cents:Number(form.querySelector(`[name="model_daily_${modelId}"]`).value)||null,monthly_cost_limit_cents:Number(form.querySelector(`[name="model_monthly_${modelId}"]`).value)||null}]));await api(`/projects/${projectId}`,{method:'PATCH',body:JSON.stringify({...values,limits,model_ids,model_limits})});render('projects')});
}
async function requestDetailForm(requestId){const data=await api(`/requests/${requestId}`);const r=data.request;openForm(`<section class="form-card wide"><h2>请求详情</h2><dl class="detail-list"><dt>Request ID</dt><dd><code>${esc(r.id)}</code></dd><dt>项目 / 虚拟 Key</dt><dd>${esc(r.project_name||'—')} / ${esc(r.virtual_key_name||'—')}</dd><dt>模型 / 供应商</dt><dd>${esc(r.model_alias||r.model_name||'—')} / ${esc(r.provider_name||'—')}</dd><dt>供应商 Key</dt><dd>${esc(r.credential_name||'—')}${r.credential_last4?`（••••${esc(r.credential_last4)}）`:''}</dd><dt>状态 / HTTP</dt><dd>${status(r.status)} ${esc(r.http_status||'—')}</dd><dt>来源</dt><dd>${esc(r.source_ip||'—')} · ${esc(r.source_country||'—')}</dd><dt>耗时 / 费用</dt><dd>${esc(r.duration_ms||'—')}ms / ${money(r.estimated_cost_cents)}</dd><dt>故障切换次数</dt><dd>${esc(r.failover_attempts||0)}</dd><dt>错误</dt><dd>${esc(r.error_code||'—')} ${esc(r.error_message||'')}</dd><dt>请求元数据</dt><dd><code>${esc(r.request_metadata||'—')}</code></dd><dt>响应元数据</dt><dd><code>${esc(r.response_metadata||'—')}</code></dd></dl><div class="form-actions"><button class="ghost" type="button" value="cancel">关闭</button></div></section>`,async()=>{});}
async function credentialsForm(providerId){const data=await api(`/providers/${providerId}/credentials`);openForm(`<section class="form-card wide"><h2>供应商凭证</h2><p class="notice">为安全起见，真实密钥永不回显；仅显示末四位和健康状态。</p>${table(['名称','末四位','状态','健康度 / 最近错误','优先级 / 权重','失败次数','最后使用','操作'],data.credentials.map(c=>`<tr><td>${esc(c.name)}</td><td><code>••••${esc(c.secret_last4)}</code></td><td>${status(c.status)}</td><td>${status(c.health_status)}${c.last_error?`<br><span class="metric-label">${esc(c.last_error)}</span>`:''}</td><td>${c.priority} / ${c.weight}</td><td>${c.consecutive_failures}</td><td>${c.last_used_at?new Date(c.last_used_at).toLocaleString():'—'}</td><td><div class="row-actions">${c.secret_last4==='ERASED'?'已擦除':`<button class="ghost credential-edit" data-id="${c.id}">编辑</button><button class="${c.status==='active'?'danger':'ghost'} credential-status" data-id="${c.id}" data-status="${c.status}">${c.status==='active'?'停用':'恢复'}</button><button class="danger credential-erase" data-id="${c.id}">擦除</button>`}</div></td></tr>`))}<div class="form-actions"><button class="ghost" type="button" value="cancel">关闭</button></div></section>`,async()=>{});modalContent.querySelectorAll('.credential-status').forEach(button=>button.onclick=()=>{const activating=button.dataset.status!=='active';confirmAction(activating?'恢复凭证':'停用凭证',activating?'恢复后该凭证会重新参与请求路由。':'停用后该凭证不会参与请求路由。',activating?'确认恢复':'确认停用',async()=>{await api(`/credentials/${button.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:activating?'active':'disabled'})});await credentialsForm(providerId);});});modalContent.querySelectorAll('.credential-edit').forEach(button=>button.onclick=()=>editCredentialForm(providerId,data.credentials.find(credential=>credential.id===button.dataset.id)));modalContent.querySelectorAll('.credential-erase').forEach(button=>button.onclick=()=>confirmAction('永久擦除真实 Key','此操作不可恢复；密钥材料会被永久擦除，历史请求记录仍会保留。','确认永久擦除',async()=>{await api(`/credentials/${button.dataset.id}`,{method:'DELETE'});await credentialsForm(providerId);}));}
function editCredentialForm(providerId,credential){openForm(`<section class="form-card"><h2>编辑真实 Key 配置</h2><p class="notice">不会显示或修改真实 Key 内容。</p><p class="form-error"></p><form class="fields"><label>名称<input required name="name" value="${esc(credential.name)}"></label><label>优先级（数字越小越优先）<input name="priority" type="number" min="0" value="${credential.priority}"></label><label>权重（同优先级内）<input name="weight" type="number" min="1" value="${credential.weight}"></label><label>每分钟上限（可选）<input name="rpm_limit" type="number" min="1" value="${credential.rpm_limit||''}"></label><label>每日请求上限（可选）<input name="daily_request_limit" type="number" min="1" value="${credential.daily_request_limit||''}"></label><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>保存</button></div></form></section>`,async f=>{for(const key of ['priority','weight','rpm_limit','daily_request_limit'])f[key]=f[key]?Number(f[key]):null;await api(`/credentials/${credential.id}`,{method:'PATCH',body:JSON.stringify(f)});credentialsForm(providerId)});}
async function legacyProjectForm(){const models=(await api('/models')).models;openForm(`<section class="form-card"><h2>创建项目</h2><p class="form-error"></p><form class="fields"><label>项目名称<input required name="name" placeholder="PixelBloom"></label><label>项目标识<input required name="slug" pattern="[a-z0-9_-]+" placeholder="pixelbloom"></label><label>联系人邮箱<input name="contact_email" type="email"></label><label>RPM<input name="rpm_limit" type="number" min="1" value="60"></label><label>并发上限<input name="concurrency_limit" type="number" min="1" value="5"></label><label>日请求上限（可选）<input name="daily_request_limit" type="number" min="1"></label><fieldset><legend>允许调用的模型</legend>${models.length?models.map(m=>`<label class="check"><input type="checkbox" name="model_ids" value="${m.id}">${esc(m.alias)}</label>`).join(''):'<p class="metric-label">请先创建模型。</p>'}</fieldset><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>创建并显示 Key</button></div></form></section>`,async f=>{const limits=Object.fromEntries(Object.entries(f).filter(([k,v])=>k.includes('limit')&&v).map(([k,v])=>[k,Number(v)]));const model_ids=[...modalContent.querySelectorAll('input[name="model_ids"]:checked')].map(input=>input.value);const result=await api('/projects',{method:'POST',body:JSON.stringify({...f,limits,model_ids})});modalContent.innerHTML=`<section class="form-card"><h2>项目已创建</h2><div class="notice">请立即复制以下虚拟 Key；关闭后不会再次显示。</div><code style="display:block;overflow-wrap:anywhere">${esc(result.virtual_key)}</code></section>`;});}
function keyForm(projectId){openForm(`<section class="form-card"><h2>创建虚拟 Key</h2><p class="form-error"></p><form class="fields"><label>Key 名称<input name="name" required placeholder="Production API"></label><label>到期时间（可选）<input name="expires_at" type="datetime-local"></label><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>创建</button></div></form></section>`,async f=>{const result=await api(`/projects/${projectId}/keys`,{method:'POST',body:JSON.stringify(f)});modalContent.innerHTML=`<section class="form-card"><h2>Key 已创建</h2><div class="notice">请立即复制；关闭后不会再次显示。</div><code style="display:block;overflow-wrap:anywhere">${esc(result.virtual_key)}</code></section>`;});}
const providerPresets=[
  ['KIE.AI','kie','https://api.kie.ai','kie'],['Dewatermark AI','dewatermark','https://platform.dewatermark.ai','dewatermark'],['OpenAI','openai','https://api.openai.com/v1','openai-compatible'],['Anthropic（Claude）','anthropic','https://api.anthropic.com/v1','custom'],['xAI（Grok）','xai','https://api.x.ai/v1','openai-compatible'],['Google Gemini','google-gemini','https://generativelanguage.googleapis.com/v1beta/openai','openai-compatible'],['DeepSeek','deepseek','https://api.deepseek.com/v1','openai-compatible'],['Mistral AI','mistral','https://api.mistral.ai/v1','openai-compatible'],['Cohere','cohere','https://api.cohere.com/compatibility/v1','openai-compatible'],['Azure OpenAI','azure-openai','https://YOUR_RESOURCE.openai.azure.com/openai/v1','openai-compatible'],['Amazon Bedrock','aws-bedrock','https://bedrock-runtime.us-east-1.amazonaws.com','custom'],['智谱 AI（GLM）','zhipu-glm','https://open.bigmodel.cn/api/paas/v4','openai-compatible'],['字节跳动火山引擎（豆包 / 方舟）','volcengine-ark','https://ark.cn-beijing.volces.com/api/v3','openai-compatible'],['阿里云百炼（通义千问）','aliyun-bailian','https://dashscope.aliyuncs.com/compatible-mode/v1','openai-compatible'],['硅基流动','siliconflow','https://api.siliconflow.cn/v1','openai-compatible'],['Moonshot（Kimi）','moonshot','https://api.moonshot.cn/v1','openai-compatible'],['MiniMax','minimax','https://api.minimax.chat/v1','openai-compatible'],['OpenRouter','openrouter','https://openrouter.ai/api/v1','openai-compatible'],['Together AI','together','https://api.together.xyz/v1','openai-compatible'],['Groq','groq','https://api.groq.com/openai/v1','openai-compatible']
];
const providerCatalogue=[
  ['OpenAI','美国','通用 / 多模态','GPT、o 系列、Sora、Image、Embedding','https://openai.com/'],
  ['Anthropic','美国','通用 / Agent','Claude Opus、Sonnet、Haiku','https://www.anthropic.com/'],
  ['Google Gemini','美国','通用 / 多模态','Gemini Pro、Flash、Imagen、Veo','https://ai.google.dev/'],
  ['xAI','美国','通用 / 实时信息','Grok','https://x.ai/'],
  ['Meta Llama','美国','开源模型','Llama 3、Llama 4','https://www.llama.com/'],
  ['NVIDIA NIM','美国','推理平台','Llama、Qwen、DeepSeek','https://www.nvidia.com/en-us/ai/'],
  ['OpenRouter','美国','模型聚合平台','数百个商业与开源模型','https://openrouter.ai/'],
  ['DeepSeek','中国','通用 / 推理','V4 Flash、V4 Pro','https://www.deepseek.com/'],
  ['智谱 AI','中国','通用 / Agent','GLM-4、GLM-5、CodeGeeX','https://www.zhipuai.cn/'],
  ['字节跳动火山方舟','中国','通用 / 多模态','Doubao Seed 2.1、Seedance 2.0、Seedream 5.0','https://www.volcengine.com/product/ark'],
  ['月之暗面','中国','长上下文','Kimi K2','https://www.moonshot.cn/'],
  ['MiniMax','中国','通用 / 视频','MiniMax M、Hailuo','https://www.minimax.io/'],
  ['商汤日日新','中国','多模态','SenseNova','https://platform.sensenova.cn/'],
  ['Kie.ai','全球','统一模型 API','聚合语言、图片、视频与音频模型','https://kie.ai/','integrated']
];
const modelCatalogue=[
  ['GPT-5','OpenAI','美国','通用 / 推理'],['GPT-5.3-Codex-Spark','OpenAI','美国','编程 / 低延迟 / 研究预览'],['GPT-5 mini','OpenAI','美国','高性价比'],['GPT-5 nano','OpenAI','美国','低成本'],['GPT-4.1','OpenAI','美国','通用'],['GPT-4.1 mini','OpenAI','美国','高性价比'],['o3','OpenAI','美国','复杂推理'],['o4-mini','OpenAI','美国','推理'],['GPT Image 1','OpenAI','美国','生图'],['Sora','OpenAI','美国','生视频'],['text-embedding-3-large','OpenAI','美国','Embedding'],['Claude Opus 4.6','Anthropic','美国','复杂推理'],['Claude Sonnet 4.5','Anthropic','美国','通用 / 编程'],['Claude Haiku 4.5','Anthropic','美国','低延迟'],['Gemini 2.5 Pro','Google Gemini','美国','通用 / 推理'],['Gemini 2.5 Flash','Google Gemini','美国','高性价比'],['Gemini 2.5 Flash-Lite','Google Gemini','美国','低成本'],['Imagen 4','Google Gemini','美国','生图'],['Veo 3','Google Gemini','美国','生视频'],['Grok 4.5','xAI','美国','Agent / 编程'],['Grok 4.3','xAI','美国','通用'],['Llama 4 Maverick','Meta Llama','美国','开源 / 多模态'],['Llama 4 Scout','Meta Llama','美国','长上下文'],['Mistral Large 3','Mistral AI','法国','通用'],['Mistral Small 3.1','Mistral AI','法国','高性价比'],['Codestral','Mistral AI','法国','编程'],['Command A','Cohere','加拿大','企业 / RAG'],['Embed 4','Cohere','加拿大','Embedding'],['Sonar Pro','Perplexity','美国','搜索增强'],['Dewatermark Image','Dewatermark AI','全球','图片去水印'],['Dewatermark Image Pro','Dewatermark AI','全球','图片去水印 / 高分辨率'],['Dewatermark Video','Dewatermark AI','全球','视频去水印'],['Dewatermark PDF','Dewatermark AI','全球','PDF 去水印'],['DeepSeek V4 Flash','DeepSeek','中国','通用 / 推理'],['DeepSeek V4 Pro','DeepSeek','中国','复杂推理'],['GLM-5','智谱 AI','中国','通用 / Agent'],['GLM-4.5','智谱 AI','中国','通用'],['GLM-4.5V','智谱 AI','中国','视觉'],['Doubao Seed 2.1 Pro','字节跳动火山方舟','中国','通用 / 推理'],['Doubao Seed 2.1 Turbo','字节跳动火山方舟','中国','通用 / 高性能'],['Doubao Seed 2.0 Lite','字节跳动火山方舟','中国','高性价比'],['Doubao Seed 1.6','字节跳动火山方舟','中国','通用'],['Doubao Seed 1.6 Flash','字节跳动火山方舟','中国','高性价比'],['Seedance 1.0 Pro','字节跳动火山方舟','中国','视频生成'],['Seedance 1.0 Pro Fast','字节跳动火山方舟','中国','视频生成 / 快速'],['Seedance 1.5 Pro','字节跳动火山方舟','中国','视频生成'],['Seedance 1.5 Pro Fast','字节跳动火山方舟','中国','视频生成 / 快速'],['Seedance 2.0','字节跳动火山方舟','中国','视频生成 / 视听一体'],['Seedance 2.0 Pro','字节跳动火山方舟','中国','视频生成 / 专业'],['Seedance 2.0 Lite','字节跳动火山方舟','中国','视频生成 / 轻量'],['Seedream 3.0 Text-to-Image','字节跳动火山方舟','中国','图片生成'],['Seedream 3.0 Image-to-Image','字节跳动火山方舟','中国','图片生成 / 编辑'],['Seedream 4.0','字节跳动火山方舟','中国','图片生成'],['Seedream 4.5','字节跳动火山方舟','中国','图片生成 / 编辑'],['Seedream 5.0','字节跳动火山方舟','中国','图片生成 / 联网检索'],['Qwen3 235B','阿里云百炼','中国','通用 / 推理'],['Qwen3 32B','阿里云百炼','中国','高性价比'],['Qwen VL Max','阿里云百炼','中国','视觉'],['Qwen Image','阿里云百炼','中国','生图'],['Qwen Image Edit','阿里云百炼','中国','图像编辑'],['Hunyuan TurboS','腾讯云混元','中国','通用'],['Hunyuan Video','腾讯云混元','中国','生视频'],['ERNIE 4.5 Turbo','百度千帆','中国','通用'],['ERNIE X1','百度千帆','中国','推理'],['Kimi K2','月之暗面','中国','通用 / 长上下文'],['MiniMax M2.5','MiniMax','中国','通用 / 编程'],['MiniMax Text-01','MiniMax','中国','通用'],['Hailuo Video','MiniMax','中国','生视频'],['Step 3','阶跃星辰','中国','多模态'],['Yi-Lightning','零一万物','中国','通用']
];
function catalogueControls(id, countries){return `<form class="catalog-filter" id="${id}"><input name="query" autocomplete="off" placeholder="输入名称、厂商或能力模糊搜索"><select name="country"><option value="">全部地区</option>${countries.map(country=>`<option>${country}</option>`).join('')}</select></form>`;}
function providerCatalogueIcon(website,name){
  const icon=`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(website)}&sz=64`;
  return `<span class="catalog-brand-icon"><span>${esc(name.slice(0,2))}</span><img src="${esc(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
}
const providerOfficialWebsites={
  openai:'https://openai.com/',anthropic:'https://www.anthropic.com/',xai:'https://x.ai/','google-gemini':'https://ai.google.dev/',
  deepseek:'https://www.deepseek.com/','meta-llama':'https://www.llama.com/','nvidia-nim':'https://www.nvidia.com/en-us/ai/',
  openrouter:'https://openrouter.ai/','zhipu-glm':'https://www.zhipuai.cn/','volcengine-ark':'https://www.volcengine.com/product/ark',
  moonshot:'https://www.moonshot.cn/',minimax:'https://www.minimax.io/','sensenova':'https://platform.sensenova.cn/',
  'kie-ai':'https://kie.ai/',dewatermark:'https://dewatermark.ai/',mistral:'https://mistral.ai/',cohere:'https://cohere.com/',
  groq:'https://groq.com/',together:'https://www.together.ai/',fireworks:'https://fireworks.ai/',perplexity:'https://www.perplexity.ai/',
  'aliyun-bailian':'https://bailian.console.aliyun.com/','tencent-hunyuan':'https://cloud.tencent.com/product/hunyuan',
  'baidu-qianfan':'https://cloud.baidu.com/product/wenxinworkshop','siliconflow':'https://siliconflow.cn/','stepfun':'https://www.stepfun.com/',
  'lingyiwanwu':'https://www.lingyiwanwu.com/',
};
function providerCatalogueIdentity(slug,name){
  const normalizedName=String(name||'').toLowerCase();
  const catalogueEntry=providerCatalogue.find(([providerName])=>providerName.toLowerCase()===normalizedName);
  const website=catalogueEntry?.[4]||providerOfficialWebsites[slug]||`https://${String(slug||'provider').replaceAll('_','-')}.com/`;
  return `${providerCatalogueIcon(website,name)}<span>${esc(name)}</span>`;
}
function bindProviderCatalogueIcons(){
  document.querySelectorAll('.catalog-brand-icon img').forEach(image=>image.addEventListener('error',()=>image.remove(),{once:true}));
}
function provider_catalog(){
  let selectedProviderKind='source';
  const draw=items=>table(['供应商','地区','类型','代表模型','官网'],items.map(([name,country,kind,models,website])=>`<tr><td><div class="brand-cell">${providerCatalogueIcon(website,name)}<strong>${esc(name)}</strong></div></td><td><span class="catalog-country catalog-flag" title="${esc(country)}" aria-label="${esc(country)}">${countryFlags[country]||'🌐'}</span></td><td>${esc(kind)}</td><td>${esc(models)}</td><td><a class="catalog-website" href="${esc(website)}" target="_blank" rel="noopener noreferrer">访问官网 <span aria-hidden="true">↗</span></a></td></tr>`));
  app.innerHTML=`<div class="category-tabs provider-kind-tabs"><button class="active" data-provider-kind="source">源头供应商</button><button data-provider-kind="integrated">集成供应商</button></div>${catalogueControls('provider-catalog-filter',['中国','美国','全球'])}<div id="provider-catalog-list"></div>`;
  const form=document.querySelector('#provider-catalog-filter');
  const apply=()=>{
    const f=Object.fromEntries(new FormData(form)),q=(f.query||'').toLowerCase();
    const items=providerCatalogue.filter(row=>(row[5]||'source')===selectedProviderKind&&(!f.country||row[1]===f.country)&&(!q||row.join(' ').toLowerCase().includes(q)));
    document.querySelector('#provider-catalog-list').innerHTML=`<div class="provider-catalog-table">${draw(items)}</div>`;
    bindProviderCatalogueIcons();
  };
  form.oninput=apply;
  form.onchange=apply;
  document.querySelectorAll('.provider-kind-tabs button').forEach(button=>button.onclick=()=>{
    selectedProviderKind=button.dataset.providerKind;
    document.querySelectorAll('.provider-kind-tabs button').forEach(item=>item.classList.toggle('active',item===button));
    apply();
  });
  apply();
}
const modelTypes={language:'纯语言模型',image:'图片模型',video:'视频模型'};
const countryFlags={'中国':'🇨🇳','美国':'🇺🇸','法国':'🇫🇷','加拿大':'🇨🇦','全球':'🌐'};
const providerCountries={
  openai:'美国',anthropic:'美国',xai:'美国','google-gemini':'美国',deepseek:'中国',
  'zhipu-glm':'中国','volcengine-ark':'中国','aliyun-bailian':'中国','tencent-hunyuan':'中国',
  'baidu-qianfan':'中国',moonshot:'中国',minimax:'中国',stepfun:'中国','lingyiwanwu':'中国',
  mistral:'法国',cohere:'加拿大',groq:'美国',together:'美国',fireworks:'美国',
  openrouter:'美国',perplexity:'美国',dewatermark:'全球','kie-ai':'全球',
};
function modelCountry(model){
  const exact=modelCatalogue.find(([name,provider])=>name.toLowerCase()===String(model.name).toLowerCase()&&provider.toLowerCase()===String(model.provider_name).toLowerCase());
  const providerMatch=modelCatalogue.find(([,provider])=>provider.toLowerCase()===String(model.provider_name).toLowerCase());
  return exact?.[2]||providerMatch?.[2]||providerCountries[model.provider_slug]||'全球';
}
function modelRegionFlag(model){
  const country=modelCountry(model);
  return `<span class="catalog-country catalog-flag" title="${esc(country)}" aria-label="${esc(country)}">${countryFlags[country]||'🌐'}</span>`;
}
function modelCapability(model){
  const exact=modelCatalogue.find(([name,provider])=>name.toLowerCase()===String(model.name).toLowerCase()&&provider.toLowerCase()===String(model.provider_name).toLowerCase());
  if(exact?.[3])return exact[3];
  const fallbacks={chat:'文本生成、对话与工具调用',image:'图片生成与编辑',video:'视频生成',embedding:'向量嵌入',audio:'语音理解与生成',document:'文档处理'};
  return fallbacks[model.request_type]||'通用 AI 能力';
}
function modelType(row){const text=row.join(' ').toLowerCase();if(/视频|video|sora|veo|hailuo/.test(text))return 'video';if(/图片|生图|图像|image|imagen|视觉|watermark/.test(text))return 'image';return 'language';}
function model_catalog(){
  let selectedType='',page=1,pageSize=10;
  const draw=items=>`<section class="section catalog-model-list">${table(
    ['供应商','模型','类型','能力','地区'],
    items.map(([name,provider,country,kind])=>`<tr><td><strong>${esc(provider)}</strong></td><td>${esc(name)}</td><td><span class="category-badge">${esc(modelTypes[modelType([name,provider,country,kind])])}</span></td><td>${esc(kind)}</td><td><span class="catalog-country catalog-flag" title="${esc(country)}" aria-label="${esc(country)}">${countryFlags[country]||'🌐'}</span></td></tr>`),
  )}</section>`;
  app.innerHTML=`<div class="section-head"><div><h2>全部模型</h2><p class="metric-label">全球常见模型目录；实际可调用模型以供应商账户权限为准。</p></div><a class="catalog-add" href="#models">管理已配置模型</a></div><div class="category-tabs model-type-tabs"><button class="active" data-type="">全部</button>${Object.entries(modelTypes).map(([key,label])=>`<button data-type="${key}">${label}</button>`).join('')}</div><form class="catalog-filter model-catalog-filter" id="model-catalog-filter"><input name="query" autocomplete="off" placeholder="输入模型、厂商或能力模糊搜索"></form><div id="model-catalog-list"></div>`;
  const form=document.querySelector('#model-catalog-filter');
  const renderPage=items=>{
    const totalPages=Math.max(1,Math.ceil(items.length/pageSize));
    page=Math.min(page,totalPages);
    const start=(page-1)*pageSize;
    document.querySelector('#model-catalog-list').innerHTML=`${draw(items.slice(start,start+pageSize))}<div class="pagination"><span>共 ${items.length} 条 · 第 ${page} / ${totalPages} 页</span><label>每页 <select id="model-catalog-page-size">${pageSizeChoices.map(size=>`<option value="${size}" ${size===pageSize?'selected':''}>${size}</option>`).join('')}</select> 条</label><div><button class="ghost" id="model-catalog-prev" ${page<=1?'disabled':''}>上一页</button><button class="ghost" id="model-catalog-next" ${page>=totalPages?'disabled':''}>下一页</button></div></div>`;
    document.querySelector('#model-catalog-page-size').onchange=event=>{pageSize=Number(event.target.value);page=1;renderPage(items)};
    const previous=document.querySelector('#model-catalog-prev'),next=document.querySelector('#model-catalog-next');if(previous)previous.onclick=()=>{page--;renderPage(items)};if(next)next.onclick=()=>{page++;renderPage(items)};
  };
  const apply=()=>{
    const f=Object.fromEntries(new FormData(form)),q=(f.query||'').toLowerCase();
    renderPage(modelCatalogue.filter(row=>(!selectedType||modelType(row)===selectedType)&&(!q||row.join(' ').toLowerCase().includes(q))));
  };
  form.oninput=()=>{page=1;apply()};
  document.querySelectorAll('.model-type-tabs button').forEach(button=>button.onclick=()=>{
    selectedType=button.dataset.type;page=1;
    document.querySelectorAll('.model-type-tabs button').forEach(item=>item.classList.toggle('active',item===button));
    apply();
  });
  apply();
}
function providerForm(provider){
  const editing=!!provider;
  const presets=providerPresets.map(([name,slug,url,adapter])=>`
    <button type="button" class="fuzzy-option provider-preset" data-name="${esc(name)}" data-slug="${esc(slug)}" data-url="${esc(url)}" data-adapter="${esc(adapter)}">
      ${brandMark(slug,name)}
      <span class="provider-preset-copy"><strong>${esc(name)}</strong><small>${esc(slug)} · ${esc(adapter)}</small></span>
      <span class="provider-preset-arrow" aria-hidden="true">›</span>
    </button>`).join('');
  openForm(`<section class="form-card split-form-card provider-form-card"><h2>${editing?'编辑供应商':'添加供应商'}</h2>
    <div class="split-layout"><aside class="split-nav">
      <button type="button" class="split-mode${editing?'':' active'}" data-mode="common">常用供应商<span>搜索并选择常见厂商</span></button>
      <button type="button" class="split-mode${editing?' active':''}" data-mode="custom">自定义供应商<span>填写完整连接信息</span></button>
    </aside><div class="split-content">
      <div id="provider-common" class="provider-common-panel"${editing?' hidden':''}>
        <div class="provider-common-intro"><strong>选择常用供应商</strong><p>搜索全球常见供应商，选择后再确认连接信息。</p></div>
        <label class="provider-preset-search">搜索供应商<input id="provider-preset-search" autocomplete="off" placeholder="KIE、Dewatermark、Claude、Grok、Gemini"></label>
        <div id="provider-preset-options" class="preset-options provider-preset-options">${presets}</div>
        <p id="provider-preset-empty" class="provider-preset-empty" hidden>没有匹配的常用供应商</p>
      </div>
      <div id="provider-custom"${editing?'':' hidden'}><p class="metric-label">自定义供应商连接信息</p><p class="form-error"></p>
        <form class="fields"><label>名称<input required name="name" value="${esc(provider?.name||'')}" placeholder="OpenAI"></label>
          ${editing?`<label>标识<input disabled value="${esc(provider.slug)}"></label>`:`<label>标识<input required name="slug" pattern="[a-z0-9_-]+" placeholder="openai"></label>`}
          <label>API Base URL<input required type="url" name="base_url" value="${esc(provider?.base_url||'')}" placeholder="https://api.openai.com/v1"></label>
          <label>适配器<select name="adapter_type">${['openai-compatible','custom','kie','dewatermark'].map(value=>`<option value="${value}" ${provider?.adapter_type===value?'selected':''}>${value}</option>`).join('')}</select></label>
          <label>超时（毫秒）<input name="timeout_ms" type="number" min="1" value="${provider?.timeout_ms||60000}"></label>
          <label>失败重试次数<input name="retry_count" type="number" min="0" value="${provider?.retry_count||1}"></label>
          <div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>${editing?'保存':'创建'}</button></div>
        </form>
      </div>
    </div></div>
  </section>`,async values=>{
    values.timeout_ms=Number(values.timeout_ms);
    values.retry_count=Number(values.retry_count);
    await api(editing?`/providers/${provider.id}/update`:'/providers',{method:'POST',body:JSON.stringify(values)});
    await providers();
  });
  const common=modalContent.querySelector('#provider-common');
  const custom=modalContent.querySelector('#provider-custom');
  const setMode=value=>{
    common.hidden=value!=='common';
    custom.hidden=value!=='custom';
    modalContent.querySelectorAll('.split-mode').forEach(button=>button.classList.toggle('active',button.dataset.mode===value));
  };
  modalContent.querySelectorAll('.split-mode').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
  const search=modalContent.querySelector('#provider-preset-search');
  const options=[...modalContent.querySelectorAll('.provider-preset')];
  const empty=modalContent.querySelector('#provider-preset-empty');
  search.oninput=()=>{
    const query=search.value.trim().toLowerCase();
    let visible=0;
    options.forEach(option=>{
      option.hidden=!!query&&!option.textContent.toLowerCase().includes(query);
      if(!option.hidden)visible++;
    });
    empty.hidden=visible>0;
  };
  options.forEach(option=>option.onclick=()=>{
    modalContent.querySelector('[name="name"]').value=option.dataset.name;
    if(!editing)modalContent.querySelector('[name="slug"]').value=option.dataset.slug;
    modalContent.querySelector('[name="base_url"]').value=option.dataset.url;
    modalContent.querySelector('[name="adapter_type"]').value=option.dataset.adapter;
    setMode('custom');
  });
}
function credentialForm(providerId){
  openForm(`<section class="form-card"><h2>更换真实 API Key</h2><p class="notice">保存后将替换该供应商当前使用的真实 Key；旧 Key 会立即失效。密钥仍只以 AES-GCM 密文保存。</p><p class="form-error"></p>
    <form class="fields"><label>名称<input required name="name" value="Primary key"></label><label>新的真实 API Key<input required name="secret" type="password" autocomplete="off"></label>
      <div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>确认更换</button></div>
    </form></section>`,async values=>{
      await api(`/providers/${providerId}/credentials`,{method:'POST',body:JSON.stringify(values)});
      showPageNotice('Key 已更换');
      await providers();
    });
}
async function legacyModelForm(){const providers=(await api('/providers')).providers;openForm(`<section class="form-card"><h2>添加模型</h2><p class="form-error"></p><form class="fields"><label>供应商<select required name="provider_id">${providers.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>名称<input required name="name" placeholder="GPT-4.1 mini"></label><label>内部别名<input required name="alias" pattern="[a-z0-9_-]+" placeholder="gpt-4-1-mini"></label><label>供应商模型 ID<input required name="provider_model_id" placeholder="gpt-4.1-mini"></label><label>固定预估成本（分）<input name="fixed_cost_cents" type="number" min="0" value="0"></label><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>创建</button></div></form></section>`,async f=>{f.fixed_cost_cents=Number(f.fixed_cost_cents);await api('/models',{method:'POST',body:JSON.stringify(f)});render('models')});}

const modelPresets=[
  ['openai','GPT-5.6 Sol','gpt-5-6-sol','gpt-5.6-sol','chat',0,0,'OpenAI'],['openai','GPT-5.6 Terra','gpt-5-6-terra','gpt-5.6-terra','chat',0,0,'OpenAI'],['openai','GPT-5.6 Luna','gpt-5-6-luna','gpt-5.6-luna','chat',0,0,'OpenAI'],['openai','GPT-5.5','gpt-5-5','gpt-5.5','chat',0,0,'OpenAI'],['openai','GPT-5.4','gpt-5-4','gpt-5.4','chat',0,0,'OpenAI'],['openai','GPT-5.3-Codex-Spark','gpt-5-3-codex-spark','gpt-5.3-codex-spark','chat',0,0,'OpenAI research preview','OpenAI 官方：research preview；未公布常规 API Token 单价'],['anthropic','Claude Opus 4.6','claude-opus-4-6','claude-opus-4-6','chat',500,2500,'Anthropic 2026-05'],['anthropic','Claude Sonnet 4.5','claude-sonnet-4-5','claude-sonnet-4-5','chat',300,1500,'Anthropic 2026-05'],['anthropic','Claude Haiku 4.5','claude-haiku-4-5','claude-haiku-4-5','chat',100,500,'Anthropic 2026-05'],['xai','Grok 4.5','grok-4-5','grok-4.5','chat',200,600,'xAI 2026-07'],['xai','Grok 4.3','grok-4-3','grok-4.3','chat',125,250,'xAI 2026-07'],['google-gemini','Gemini 2.5 Pro','gemini-2-5-pro','gemini-2.5-pro','chat',125,1000,'Google standard ≤200K'],['google-gemini','Gemini 2.5 Flash','gemini-2-5-flash','gemini-2.5-flash','chat',30,250,'Google standard'],['deepseek','DeepSeek V4 Flash','deepseek-v4-flash','deepseek-v4-flash','chat',0,0,'DeepSeek 官方 2026-07','官方人民币价 / 1M Token：缓存命中 ¥0.02；缓存未命中 ¥1；输出 ¥2'],['deepseek','DeepSeek V4 Pro','deepseek-v4-pro','deepseek-v4-pro','chat',0,0,'DeepSeek 官方 2026-07','官方人民币价 / 1M Token：缓存命中 ¥0.025；缓存未命中 ¥3；输出 ¥6'],['dewatermark','Dewatermark Image','dewatermark-image','/api/object_removal/v3/erase_watermark','image',0,0,'Dewatermark API v3','官方按积分计费：每次图片去水印消耗 1 credit'],['dewatermark','Dewatermark Image Pro','dewatermark-image-pro','/api/object_removal/v3/erase_watermark_pro','image',0,0,'Dewatermark API','官方按积分计费：高质量图片去水印'],['dewatermark','Dewatermark Video','dewatermark-video','/api/video_removal','video',0,0,'Dewatermark API','官方按积分计费：视频去水印异步任务'],['dewatermark','Dewatermark PDF','dewatermark-pdf','/api/pdf_removal','document',0,0,'Dewatermark API','官方按积分计费：PDF 去水印异步任务'],['zhipu-glm','GLM-4.5','glm-4-5','glm-4.5','chat',60,220,'官方标准价'],['volcengine-ark','Doubao Seed 2.1 Pro','doubao-seed-2-1-pro','doubao-seed-2-1-pro-260628','chat',0,0,'火山方舟官方模型','按火山方舟账户实际账单计费'],['volcengine-ark','Doubao Seed 2.1 Turbo','doubao-seed-2-1-turbo','doubao-seed-2-1-turbo-260628','chat',0,0,'火山方舟官方模型','按火山方舟账户实际账单计费'],['volcengine-ark','Doubao Seed 2.0 Lite','doubao-seed-2-0-lite','doubao-seed-2-0-lite-260428','chat',0,0,'火山方舟官方模型','按火山方舟账户实际账单计费'],['volcengine-ark','Doubao Seed 1.6','doubao-seed-1-6','doubao-seed-1-6-251015','chat',80,800,'官方标准价'],
  ['volcengine-ark','Seedance 1.0 Pro','seedance-1-0-pro','seedance-1-0-pro','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedance 1.0 Pro Fast','seedance-1-0-pro-fast','seedance-1-0-pro-fast','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedance 1.5 Pro','seedance-1-5-pro','seedance-1-5-pro','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedance 1.5 Pro Fast','seedance-1-5-pro-fast','seedance-1-5-pro-fast','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedance 2.0','seedance-2-0','seedance-2-0','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedance 2.0 Pro','seedance-2-0-pro','seedance-2-0-pro','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedance 2.0 Lite','seedance-2-0-lite','seedance-2-0-lite','video',0,0,'火山方舟视频模型','按生成时长、分辨率和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedream 3.0 Text-to-Image','seedream-3-0-text-to-image','seedream-3-0-t2i','image',0,0,'火山方舟图片模型','按图片规格和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedream 3.0 Image-to-Image','seedream-3-0-image-to-image','seedream-3-0-i2i','image',0,0,'火山方舟图片模型','按图片规格和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedream 4.0','seedream-4-0','seedream-4-0','image',0,0,'火山方舟图片模型','按图片规格和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedream 4.5','seedream-4-5','seedream-4-5','image',0,0,'火山方舟图片模型','按图片规格和实际接入点计费，以火山方舟账单为准'],
  ['volcengine-ark','Seedream 5.0','seedream-5-0','seedream-5-0','image',0,0,'火山方舟图片模型','按图片规格和实际接入点计费，以火山方舟账单为准'],
  ['aliyun-bailian','Qwen3 235B','qwen3-235b','qwen3-235b-a22b','chat',20,80,'官方标准价'],['mistral','Mistral Large 3','mistral-large-3','mistral-large-3','chat',50,150,'官方标准价']
];
async function modelForm(){const providers=(await api('/providers')).providers;const options=modelPresets.map((p,i)=>`<button class="fuzzy-option model-preset" type="button" data-index="${i}"><strong>${esc(p[1])}</strong><span>${esc(p[0])} · ${esc(p[8]||`$${(p[5]/100).toFixed(2)} 输入 / $${(p[6]/100).toFixed(2)} 输出 / 1M Token`)}</span></button>`).join('');openForm(`<section class="form-card split-form-card"><h2>添加模型与价格</h2><div class="split-layout"><aside class="split-nav"><button type="button" class="split-mode active" data-mode="custom">自定义模型<span>手动填写模型与价格</span></button><button type="button" class="split-mode" data-mode="common">常用模型<span>按模型名称模糊搜索</span></button></aside><div class="split-content"><div id="model-common" hidden><p class="notice">标准价格来自公开 API 定价页；缓存、长上下文和批处理按供应商实际账单计算。</p><label>搜索常用模型<input id="model-preset-search" autocomplete="off" placeholder="GPT、Claude、Grok、Gemini、DeepSeek、GLM"><div class="preset-options">${options}</div></label></div><div id="model-custom"><p class="form-error"></p><form class="fields"><label>供应商<select required name="provider_id">${providers.map(p=>`<option value="${p.id}" data-slug="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select></label><label>名称<input required name="name" placeholder="GPT-5 mini"></label><label>内部别名<input required name="alias" pattern="[a-z0-9_-]+" placeholder="gpt-5-mini"></label><label>供应商模型 ID<input required name="provider_model_id" placeholder="gpt-5-mini"></label><label>请求类型<select name="request_type"><option value="chat">chat</option><option value="image">image</option><option value="embedding">embedding</option></select></label><label>固定预估成本（分）<input name="fixed_cost_cents" type="number" min="0" value="0"></label><label>输入 Token 单价（微分）<input name="input_cost_microunits" type="number" min="0" value="0"></label><label>输出 Token 单价（微分）<input name="output_cost_microunits" type="number" min="0" value="0"></label><label>价格版本<input name="price_version" value="v1"></label><label>价格说明（可选）<textarea name="pricing_note" rows="3" placeholder="例如：缓存命中、未命中及输出的官方价"></textarea></label><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>创建</button></div></form></div></div></div></section>`,async f=>{for(const key of ['fixed_cost_cents','input_cost_microunits','output_cost_microunits'])f[key]=Number(f[key]);await api('/models',{method:'POST',body:JSON.stringify(f)});render('models')});const common=modalContent.querySelector('#model-common'),custom=modalContent.querySelector('#model-custom');const mode=value=>{common.hidden=value!=='common';custom.hidden=value!=='custom';modalContent.querySelectorAll('.split-mode').forEach(button=>button.classList.toggle('active',button.dataset.mode===value))};modalContent.querySelectorAll('.split-mode').forEach(button=>button.onclick=()=>mode(button.dataset.mode));const search=modalContent.querySelector('#model-preset-search');const items=modalContent.querySelectorAll('.model-preset');search.oninput=()=>{const q=search.value.toLowerCase();items.forEach(item=>item.hidden=!item.textContent.toLowerCase().includes(q))};items.forEach(item=>item.onclick=()=>{const p=modelPresets[Number(item.dataset.index)],form=modalContent.querySelector('form');form.name.value=p[1];form.alias.value=p[2];form.provider_model_id.value=p[3];form.request_type.value=p[4];form.input_cost_microunits.value=p[5];form.output_cost_microunits.value=p[6];form.price_version.value=p[7];form.pricing_note.value=p[8]||'';const choice=[...form.provider_id.options].find(option=>option.dataset.slug===p[0]);if(choice)form.provider_id.value=choice.value;mode('custom')});}
function editModelForm(model){openForm(`<section class="form-card"><h2>编辑模型价格</h2><p class="form-error"></p><form class="fields"><label>名称<input required name="name" value="${esc(model.name)}"></label><label>内部别名<input disabled value="${esc(model.alias)}"></label><label>供应商模型 ID<input required name="provider_model_id" value="${esc(model.provider_model_id)}"></label><label>请求类型<select name="request_type">${['chat','image','video','embedding','audio','document'].map(value=>`<option value="${value}" ${model.request_type===value?'selected':''}>${value}</option>`).join('')}</select></label><label>固定预估成本（分）<input name="fixed_cost_cents" type="number" min="0" value="${model.fixed_cost_cents}"></label><label>输入 Token 单价（微分）<input name="input_cost_microunits" type="number" min="0" value="${model.input_cost_microunits}"></label><label>输出 Token 单价（微分）<input name="output_cost_microunits" type="number" min="0" value="${model.output_cost_microunits}"></label><label>额外计费单位<select name="billing_unit">${Object.entries(billingUnitLabels).map(([value,label])=>`<option value="${value}" ${model.billing_unit===value?'selected':''}>${label}</option>`).join('')}</select></label><label>单位价格（微分）<input name="unit_cost_microunits" type="number" min="0" value="${model.unit_cost_microunits||0}"></label><label>价格版本<input name="price_version" value="${esc(model.price_version)}"></label><label class="span-all">价格说明<textarea name="pricing_note" rows="3">${esc(model.pricing_note||'')}</textarea></label><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>保存</button></div></form></section>`,async f=>{for(const key of ['fixed_cost_cents','input_cost_microunits','output_cost_microunits','unit_cost_microunits'])f[key]=Number(f[key]);await api(`/models/${model.id}/update`,{method:'POST',body:JSON.stringify(f)});showToast('模型价格已保存');render('models')});}

async function projectForm(){
  const models=(await api('/models?page_size=100')).models;
  openForm(`<section class="form-card"><h2>创建项目</h2><p class="notice">创建后会显示一次虚拟 Key。请至少选择一个允许调用的模型。</p><p class="form-error"></p><form class="fields"><label>项目名称<input required name="name" placeholder="PixelBloom"></label><label>项目标识<input required name="slug" pattern="[a-z0-9_-]{2,63}" placeholder="pixelbloom"></label><label>项目分类<select name="category">${Object.entries(projectCategories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>项目描述<textarea name="description" rows="2" placeholder="项目用途（可选）"></textarea></label><label>联系人邮箱<input name="contact_email" type="email"></label><label>环境<select name="environment"><option value="production">生产</option><option value="staging">预发布</option><option value="development">开发</option></select></label><label>RPM<input name="rpm_limit" type="number" min="1" value="60"></label><label>并发上限<input name="concurrency_limit" type="number" min="1" value="5"></label><label>日请求上限（可选）<input name="daily_request_limit" type="number" min="1"></label><label>月请求上限（可选）<input name="monthly_request_limit" type="number" min="1"></label><label>日费用上限（分，可选）<input name="daily_cost_limit_cents" type="number" min="1"></label><label>月费用上限（分，可选）<input name="monthly_cost_limit_cents" type="number" min="1"></label><input class="model-search" id="model-search" placeholder="搜索模型或供应商"><fieldset class="model-picker"><legend>允许调用的模型</legend>${models.map(m=>`<label class="check" data-model-search="${esc(`${m.name} ${m.alias} ${m.provider_name}`.toLowerCase())}"><input type="checkbox" name="model_ids" value="${m.id}">${brandMark(m.provider_slug,m.provider_name)} ${esc(m.alias)}</label>`).join('')||'<p class="metric-label">请先创建模型。</p>'}</fieldset><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button>创建并显示 Key</button></div></form></section>`,async f=>{const limits=Object.fromEntries(Object.entries(f).filter(([k,v])=>k.includes('limit')&&v).map(([k,v])=>[k,Number(v)]));const model_ids=[...modalContent.querySelectorAll('input[name="model_ids"]:checked')].map(input=>input.value);if(!model_ids.length)throw new Error('请至少选择一个允许调用的模型。');const result=await api('/projects',{method:'POST',body:JSON.stringify({...f,limits,model_ids})});modalContent.innerHTML=`<section class="form-card"><h2>项目已创建</h2><div class="notice">请立即复制以下虚拟 Key；关闭后不会再次显示。</div><code style="display:block;overflow-wrap:anywhere">${esc(result.virtual_key)}</code></section>`;});
  modalContent.querySelector('#model-search').oninput=e=>{const query=e.currentTarget.value.trim().toLowerCase();modalContent.querySelectorAll('[data-model-search]').forEach(item=>item.hidden=!!query&&!item.dataset.modelSearch.includes(query));};
}

async function modelFormOverride(){
  const [providerData, modelData]=await Promise.all([api('/providers?page_size=100'),api('/models?page_size=100')]);
  const providers=providerData.providers, existingAliases=new Set(modelData.models.map(model=>model.alias));
  const options=modelPresets.map((preset,index)=>`<button class="fuzzy-option model-preset" type="button" data-index="${index}"><strong>${esc(preset[1])}</strong><span>${esc(preset[0])} · ${esc(preset[8]||`$${(preset[5]/100).toFixed(2)} 输入 / $${(preset[6]/100).toFixed(2)} 输出 / 1M Token`)}</span></button>`).join('');
  openForm(`<section class="form-card split-form-card"><h2>添加模型与价格</h2><div class="split-layout"><aside class="split-nav"><button type="button" class="split-mode active" data-mode="custom">自定义模型<span>手动填写模型与价格</span></button><button type="button" class="split-mode" data-mode="common">常用模型<span>按模型名称模糊搜索</span></button></aside><div class="split-content"><div id="model-common" hidden><p class="notice">选择预设后会带入模型信息；如内部别名已存在，会提示你编辑现有模型或更换别名。</p><label>搜索常用模型<input id="model-preset-search" autocomplete="off" placeholder="GPT、Claude、Grok、Gemini、DeepSeek、Seedance、Seedream"><div class="preset-options">${options}</div></label></div><div id="model-custom"><p class="form-error"></p><form class="fields"><label>供应商<select required name="provider_id"><option value="">请选择供应商</option>${providers.map(provider=>`<option value="${provider.id}" data-slug="${esc(provider.slug)}">${esc(provider.name)}</option>`).join('')}</select></label><label>名称<input required name="name" placeholder="GPT-5 mini"></label><label>内部别名<input required name="alias" pattern="[a-z0-9_-]+" placeholder="gpt-5-mini"></label><label>供应商模型 ID<input required name="provider_model_id" placeholder="gpt-5-mini"></label><label>请求类型<select name="request_type"><option value="chat">chat（聊天 / 语言）</option><option value="image">image（图片）</option><option value="video">video（视频）</option><option value="embedding">embedding（嵌入）</option><option value="audio">audio（音频）</option><option value="document">document（文档）</option></select></label><label>固定预估成本（分）<input name="fixed_cost_cents" type="number" min="0" value="0"></label><label>输入 Token 单价（微分）<input name="input_cost_microunits" type="number" min="0" value="0"></label><label>输出 Token 单价（微分）<input name="output_cost_microunits" type="number" min="0" value="0"></label><label>额外计费单位<select name="billing_unit">${Object.entries(billingUnitLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>单位价格（微分）<input name="unit_cost_microunits" type="number" min="0" value="0"></label><label>价格版本<input name="price_version" value="v1"></label><label class="span-all">价格说明（可选）<textarea name="pricing_note" rows="3" placeholder="例如：每秒、每张图片或缓存命中的官方价"></textarea></label><div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button type="submit">创建模型</button></div></form></div></div></div></section>`,async values=>{if(existingAliases.has(values.alias))throw new Error('内部别名已存在。请编辑现有模型，或使用新的内部别名后再创建。');for(const key of ['fixed_cost_cents','input_cost_microunits','output_cost_microunits','unit_cost_microunits'])values[key]=Number(values[key]);await api('/models',{method:'POST',body:JSON.stringify(values)});showToast('模型已创建');render('models')});
  const common=modalContent.querySelector('#model-common'),custom=modalContent.querySelector('#model-custom');
  const setMode=value=>{common.hidden=value!=='common';custom.hidden=value!=='custom';modalContent.querySelectorAll('.split-mode').forEach(button=>button.classList.toggle('active',button.dataset.mode===value));};
  modalContent.querySelectorAll('.split-mode').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
  const search=modalContent.querySelector('#model-preset-search'),items=modalContent.querySelectorAll('.model-preset');
  search.oninput=()=>{const query=search.value.toLowerCase();items.forEach(item=>item.hidden=!item.textContent.toLowerCase().includes(query));};
  items.forEach(item=>item.onclick=()=>{const preset=modelPresets[Number(item.dataset.index)],form=modalContent.querySelector('form');clearFieldErrors(form);form.querySelector('[name="name"]').value=preset[1];form.querySelector('[name="alias"]').value=preset[2];form.querySelector('[name="provider_model_id"]').value=preset[3];form.querySelector('[name="request_type"]').value=preset[4];form.querySelector('[name="input_cost_microunits"]').value=preset[5];form.querySelector('[name="output_cost_microunits"]').value=preset[6];form.querySelector('[name="billing_unit"]').value=preset[4]==='image'?'image':preset[4]==='video'?'second':preset[4]==='audio'?'audio_minute':'token';form.querySelector('[name="price_version"]').value=preset[7];form.querySelector('[name="pricing_note"]').value=preset[8]||'';const providerSelect=form.querySelector('[name="provider_id"]');const choice=[...providerSelect.options].find(option=>option.dataset.slug===preset[0]);providerSelect.value=choice?.value||'';setMode('custom');if(!choice)showFormError(form,new Error(`尚未配置 ${preset[0]} 供应商，请先到供应商页面添加后再创建该模型。`));});
}

function showToast(message,type='success'){
  const region=document.querySelector('#toast-region');
  const toast=document.createElement('div');
  toast.className=`toast ${type}`;
  toast.innerHTML=`<i></i><p>${esc(message)}</p><button type="button" aria-label="关闭">×</button>`;
  region.append(toast);
  const remove=()=>toast.remove();
  toast.querySelector('button').onclick=remove;
  setTimeout(remove,4200);
}

function showPageNotice(message,type='success'){
  document.querySelectorAll('.page-inline-notice').forEach(notice=>notice.remove());
  const notice=document.createElement('div');
  notice.className=`page-inline-notice ${type}`;
  notice.setAttribute('role',type==='error'?'alert':'status');
  notice.innerHTML=`<i></i><span>${esc(message)}</span>`;
  document.body.append(notice);
  requestAnimationFrame(()=>notice.classList.add('visible'));
  setTimeout(()=>{
    notice.classList.remove('visible');
    setTimeout(()=>notice.remove(),180);
  },2600);
}

async function copyText(value,message='已复制到剪贴板'){
  try{
    await navigator.clipboard.writeText(value);
  }catch{
    const input=document.createElement('textarea');
    input.value=value;
    input.style.position='fixed';
    input.style.opacity='0';
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
  showToast(message);
}

function integrationRequestBody(integration,prompt){
  if(integration.request_type==='image')return {model:integration.model,prompt};
  if(integration.request_type==='embedding')return {model:integration.model,input:prompt};
  if(integration.endpoint==='/v1/responses')return {model:integration.model,input:prompt};
  return {model:integration.model,messages:[{role:'user',content:prompt}]};
}

function shellQuote(value){
  return `'${String(value).replaceAll("'","'\\''")}'`;
}

function integrationCurl(integration,key,prompt){
  return `curl ${shellQuote(integration.url)} \\\n  -H ${shellQuote(`Authorization: Bearer ${key}`)} \\\n  -H 'Content-Type: application/json' \\\n  --data ${shellQuote(JSON.stringify(integrationRequestBody(integration,prompt)))}`;
}

function integrationBundle(integration,key){
  return JSON.stringify({url:integration.url,key,model:integration.model},null,2);
}

function integrationCopyButton(id,label){
  return `<button class="ghost integration-copy-button" id="${id}" type="button" title="${esc(label)}" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>`;
}

function integrationMarkup(integration,key,keyEditable=false,keyMask=''){
  if(!integration)return '<div class="notice">当前项目没有可用的默认模型，请先启用并设置默认模型。</div>';
  const keyField=keyEditable
    ? `<input id="integration-key-input" type="password" autocomplete="off" placeholder="粘贴完整虚拟 Key" value="${esc(key||'')}"><span class="metric-label">为安全起见，历史 Key 不能从后台反查；粘贴后仅保留在当前页面内。${keyMask?` 当前 Key：${esc(keyMask)}`:''}</span>`
    : `<code id="integration-key-value">${esc(key)}</code>`;
  return `<section class="integration-card" id="integration-card">
    <div class="section-head">${integrationCopyButton('copy-integration-all','复制 JSON 配置')}</div>
    <div class="integration-grid">
      <div class="integration-field"><span>请求 URL</span><div class="copy-row"><code id="integration-url">${esc(integration.url)}</code>${integrationCopyButton('copy-integration-url','复制 URL')}</div></div>
      <div class="integration-field"><span>虚拟key</span><div class="copy-row integration-key-field">${keyField}${integrationCopyButton('copy-integration-key','复制 Key')}</div></div>
      <div class="integration-field"><span>默认模型</span><div class="copy-row"><code id="integration-model">${esc(integration.model)}</code>${integrationCopyButton('copy-integration-model','复制 Model')}</div></div>
    </div>
  </section>`;
}

function projectCreatedReveal(result,done){
  const key=result.virtual_key,integration=result.integration,keyId=result.virtual_key_id;
  if(keyId)revealedVirtualKeys.set(keyId,{key,integration});
  modalContent.innerHTML=`<section class="form-card integration-reveal integration-only project-created-reveal"><div class="key-secret"><strong>虚拟key</strong><div class="copy-row"><code id="revealed-key">${esc(key)}</code><button id="copy-revealed-key" type="button">复制 Key</button></div></div><div id="integration-details">${integrationMarkup(integration,key)}</div><div class="form-actions"><button class="ghost" id="key-finish" type="button">确定</button></div></section>`;
  modal.showModal();
  modalContent.querySelector('#copy-revealed-key').onclick=()=>copyText(key);
  bindIntegrationCard(modalContent.querySelector('#integration-details'),integration,key);
  modalContent.querySelector('#key-finish').onclick=done;
}

function bindIntegrationCard(root,integration,key){
  if(!integration)return;
  const keyInput=root.querySelector('#integration-key-input');
  const currentKey=()=>keyInput?.value.trim()||key||'YOUR_VIRTUAL_KEY';
  root.querySelector('#copy-integration-url').onclick=()=>copyText(integration.url);
  root.querySelector('#copy-integration-key').onclick=()=>copyText(currentKey());
  root.querySelector('#copy-integration-model').onclick=()=>copyText(integration.model);
  root.querySelector('#copy-integration-all').onclick=()=>copyText(integrationBundle(integration,currentKey()));
}

function keyReveal(titleText,result,description,back){
  const key=result.virtual_key,integration=result.integration;
  const keyId=result.id||result.virtual_key_id;
  if(keyId)revealedVirtualKeys.set(keyId,{key,integration});
  modalContent.innerHTML=`<section class="form-card integration-reveal"><h2>${esc(titleText)}</h2><div class="notice">${esc(description)}</div><div class="key-secret"><strong>项目专用虚拟 Key</strong><div class="copy-row"><code id="revealed-key">${esc(key)}</code><button id="copy-revealed-key" type="button">复制 Key</button></div><span class="metric-label">该完整 Key 仅显示一次，请立即保存到安全的密钥管理工具中。</span></div><button class="integration-toggle" id="toggle-integration" type="button">显示接入信息</button><div id="integration-details" hidden>${integrationMarkup(integration,key)}</div><div class="form-actions"><button class="ghost" id="key-finish" type="button">${back?'返回项目':'完成'}</button></div></section>`;
  modal.showModal();
  modalContent.querySelector('#copy-revealed-key').onclick=()=>copyText(key);
  const details=modalContent.querySelector('#integration-details');
  const toggle=modalContent.querySelector('#toggle-integration');
  toggle.onclick=()=>{details.hidden=!details.hidden;toggle.textContent=details.hidden?'显示接入信息':'隐藏接入信息';if(!details.hidden)details.scrollIntoView({block:'nearest',behavior:'smooth'});};
  bindIntegrationCard(details,integration,key);
  modalContent.querySelector('#key-finish').onclick=()=>back?back():modal.close();
}

function showKeyIntegration(keyRecord,integration,back){
  const revealed=revealedVirtualKeys.get(keyRecord.id);
  const fullKey=revealed?.key||'';
  const activeIntegration=revealed?.integration||integration;
  const keyMask=`${keyRecord.key_prefix}…${keyRecord.key_last4}`;
  modalContent.innerHTML=`<section class="form-card integration-reveal integration-only"><h2>接入信息</h2>${fullKey?'':'<div class="notice">完整虚拟 Key 只在创建时显示。请粘贴你保存的 Key，系统不会上传或保存输入内容。</div>'}${integrationMarkup(activeIntegration,fullKey,!fullKey,keyMask)}</section>`;
  modal.showModal();
  bindIntegrationCard(modalContent,activeIntegration,fullKey);
}

function secretReveal(titleText,label,secret,description,back){
  modalContent.innerHTML=`<section class="form-card"><h2>${esc(titleText)}</h2><div class="notice">${esc(description)}</div><div class="key-secret"><strong>${esc(label)}</strong><div class="copy-row"><code id="revealed-key">${esc(secret)}</code><button id="copy-revealed-key" type="button">复制密钥</button></div><span class="metric-label">该完整密钥仅显示一次，请立即保存到安全的密钥管理工具中。</span></div><div class="form-actions"><button class="ghost" id="key-finish" type="button">${back?'返回项目':'完成'}</button></div></section>`;
  modal.showModal();
  modalContent.querySelector('#copy-revealed-key').onclick=()=>copyText(secret);
  modalContent.querySelector('#key-finish').onclick=()=>back?back():modal.close();
}

function localDate(value){
  return value?new Date(value).toLocaleString():'—';
}

function dailyBarChart(rows,key,formatter,kind){
  const values=rows.map(row=>Number(row[key]||0));
  const max=Math.max(1,...values);
  if(!rows.length)return '<p class="empty chart-empty">当前筛选周期暂无数据</p>';
  return `<div class="daily-bar-chart ${kind}" role="img" aria-label="${kind==='cost'?'每日费用柱状图':'每日请求柱状图'}"><div class="daily-bars">${rows.map((row,index)=>{
    const value=values[index],height=value?Math.max(6,Math.round(value*100/max)):2;
    const label=new Date(`${row.usage_date}T00:00:00`).toLocaleDateString(undefined,{month:'numeric',day:'numeric'});
    return `<div class="daily-bar-item" title="${esc(`${row.usage_date}：${formatter(value)}`)}"><span class="daily-bar-value">${esc(formatter(value))}</span><div class="daily-bar-track"><i style="height:${height}%"></i></div><span class="daily-bar-label">${esc(label)}</span></div>`;
  }).join('')}</div></div>`;
}

function completeDailyUsage(rows,range){
  const byDate=new Map(rows.map(row=>[row.usage_date,row]));
  const endText=(range?.started_before||new Date().toISOString()).slice(0,10);
  const startText=(range?.started_after||endText).slice(0,10);
  let start=new Date(`${startText}T00:00:00Z`),end=new Date(`${endText}T00:00:00Z`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start>end)return rows;
  const maximumDays=120,totalDays=Math.floor((end-start)/86_400_000)+1;
  if(totalDays>maximumDays)start=new Date(end.getTime()-(maximumDays-1)*86_400_000);
  const completed=[];
  for(let cursor=start;cursor<=end;cursor=new Date(cursor.getTime()+86_400_000)){
    const usage_date=cursor.toISOString().slice(0,10);
    completed.push(byDate.get(usage_date)||{usage_date,requests:0,cost_cents:0,successes:0,failures:0});
  }
  return completed;
}

function serviceStatusStrip(rows){
  const completed=completeDailyUsage(rows,{started_after:new Date(Date.now()-29*86_400_000).toISOString(),started_before:new Date().toISOString()});
  const totals=completed.reduce((sum,row)=>({requests:sum.requests+Number(row.requests||0),successes:sum.successes+Number(row.successes||0)}),{requests:0,successes:0});
  const successRate=totals.requests?totals.successes*100/totals.requests:null;
  const label=successRate===null?'暂无足够请求':successRate>=99.9?'运行稳定':successRate>=99?'基本稳定':'需要关注';
  const tone=successRate===null?'unknown':successRate>=99.9?'stable':successRate>=99?'warning':'critical';
  return `<section class="uptime-card">
    <div class="uptime-heading"><div><span class="uptime-kicker">运行状态</span><h2><i class="${tone}"></i>${label}</h2></div><strong>${successRate===null?'—':`${successRate.toFixed(2)}%`}</strong></div>
    <div class="uptime-segments" aria-label="近 30 天网关请求成功率">${completed.map(row=>{
      const requests=Number(row.requests||0),rate=requests?Number(row.successes||0)*100/requests:null;
      const state=rate===null?'unknown':rate>=99?'stable':rate>=95?'warning':'critical';
      const description=rate===null?'无请求':`${rate.toFixed(2)}% 成功`;
      return `<i class="${state}" title="${esc(`${row.usage_date} · ${description} · ${requests} 次请求`)}"></i>`;
    }).join('')}</div>
    <div class="uptime-footer"><span>近 30 天请求成功率，基于网关请求记录</span><div class="uptime-legend"><i class="stable"></i>稳定<i class="warning"></i>波动<i class="critical"></i>异常<i class="unknown"></i>无请求</div></div>
  </section>`;
}

async function overviewRefined(){
  const params=new URLSearchParams(location.hash.split('?')[1]||'');
  const [data,projectsData]=await Promise.all([api(`/dashboard?${params}`),api('/projects')]);
  const today=data.summary||data.today||{},month=data.month||{};
  const projects=projectsData.projects.map(x=>({id:x.id,label:x.name,detail:x.slug,search:`${x.name} ${x.slug} ${x.id}`}));
  const successRate=Number(today.requests)?Math.round(Number(today.successes||0)*100/Number(today.requests)):100;
  const active=(data.projects||[]).filter(x=>x.status==='active').reduce((sum,x)=>sum+Number(x.count||0),0);
  const inactive=(data.projects||[]).filter(x=>x.status!=='active').reduce((sum,x)=>sum+Number(x.count||0),0);
  const dailyUsage=completeDailyUsage(data.daily_usage||[],data.range);
  const startDate=(params.get('started_after')||'').slice(0,10);
  const endDate=(params.get('started_before')||'').slice(0,10);
  const rangeLabel=startDate&&endDate?`${startDate} — ${endDate}`:'选择时间范围';
  app.innerHTML=`<div class="dashboard-status-row"><div class="dashboard-filter-scroll"><div id="dashboard-filter" class="dashboard-filter"><select id="dashboard-period" aria-label="时间范围">${[['today','今天'],['7d','最近 7 天'],['30d','最近 30 天'],['month','本月'],['custom','自定义时间']].map(([value,label])=>`<option value="${value}" ${data.period===value?'selected':''}>${label}</option>`).join('')}</select><details class="date-range-picker" id="dashboard-date-range" ${data.period==='custom'?'':'hidden'}><summary>${esc(rangeLabel)}</summary><div class="date-range-popover"><label>开始日期<input type="date" id="dashboard-range-start" value="${esc(startDate)}"></label><span>至</span><label>结束日期<input type="date" id="dashboard-range-end" value="${esc(endDate)}"></label><p class="metric-label">选择开始和结束日期后会立即查询。</p></div></details>${fuzzySelectHtml('project','全部项目',params.get('project_id'),projects)}</div></div>
  ${serviceStatusStrip(data.service_status||[])}</div>
  <div class="grid dashboard-grid">
    <article class="card"><p>请求总数</p><strong>${Number(today.requests||0).toLocaleString()}</strong><span class="metric-trend">当前筛选周期</span></article>
    <article class="card"><p>成功率</p><strong>${successRate}%</strong><span class="metric-trend ${successRate>=99?'good':successRate<95?'bad':''}">${today.successes||0} 成功 / ${today.failures||0} 失败</span></article>
    <article class="card"><p>预估费用</p><strong>${money(today.cost)}</strong><span class="metric-trend">基于模型价格表</span></article>
    <article class="card"><p>平均响应</p><strong>${Math.round(today.average_duration_ms||0)}ms</strong><span class="metric-trend">端到端耗时</span></article>
    <article class="card"><p>本月请求</p><strong>${Number(month.requests||0).toLocaleString()}</strong><span class="metric-trend">${money(month.cost)} 预估费用</span></article>
    <article class="card"><p>项目状态</p><strong>${active} / ${inactive}</strong><span class="metric-trend">启用 / 暂停或停用</span></article>
  </div>
  <div class="dashboard-trend-grid">
    <section class="section trend-section"><div class="section-head"><div><h2>近期请求</h2><p class="metric-label">按天统计当前筛选周期内的全部请求</p></div><a href="#requests">查看全部</a></div>${dailyBarChart(dailyUsage,'requests',value=>Number(value).toLocaleString(),'requests')}</section>
    <section class="section trend-section"><div class="section-head"><div><h2>近期费用</h2><p class="metric-label">按天统计当前筛选周期内的预估费用</p></div></div>${dailyBarChart(dailyUsage,'cost_cents',value=>money(value),'cost')}</section>
  </div>
  <div class="dashboard-lower">
    <section class="section"><div class="section-head"><h2>接近额度的项目</h2><a href="#projects">管理项目</a></div>${table(['项目','请求用量','费用用量'],(data.at_risk_projects||[]).map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="metric-label">${esc(x.slug)}</span></td><td>${x.request_count||0}${x.daily_request_limit?` / ${x.daily_request_limit}`:' / 未设置'}</td><td>${money(x.estimated_cost_cents||0)}${x.daily_cost_limit_cents?` / ${money(x.daily_cost_limit_cents)}`:' / 未设置'}</td></tr>`))}</section>
    <div class="dashboard-rank-grid">
      <section class="section"><div class="section-head"><h2>项目费用排行</h2></div>${table(['项目','预估费用'],(data.cost_by_project||[]).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.cost_cents)}</td></tr>`))}</section>
      <section class="section"><div class="section-head"><h2>模型使用排行</h2></div>${table(['模型','请求数','费用'],(data.model_usage||[]).map(x=>`<tr><td><code>${esc(x.alias)}</code></td><td>${x.requests}</td><td>${money(x.cost_cents)}</td></tr>`))}</section>
    </div>
  </div>`;
  const updateDashboard=(updates={},remove=[])=>{
    const next=new URLSearchParams(params);
    remove.forEach(key=>next.delete(key));
    Object.entries(updates).forEach(([key,value])=>value?next.set(key,value):next.delete(key));
    location.hash=`overview${next.size?`?${next}`:''}`;
  };
  setupFuzzySelect('project',projects,projectId=>updateDashboard({project_id:projectId}));
  const periodSelect=document.querySelector('#dashboard-period');
  const rangePicker=document.querySelector('#dashboard-date-range');
  const startInput=document.querySelector('#dashboard-range-start');
  const endInput=document.querySelector('#dashboard-range-end');
  periodSelect.onchange=()=>{
    if(periodSelect.value==='custom'){
      rangePicker.hidden=false;
      rangePicker.open=true;
      return;
    }
    updateDashboard({period:periodSelect.value},['started_after','started_before']);
  };
  const applyRange=()=>{
    if(!startInput.value||!endInput.value)return;
    if(startInput.value>endInput.value){
      showToast('开始日期不能晚于结束日期。','error');
      return;
    }
    rangePicker.open=false;
    updateDashboard({period:'custom',started_after:`${startInput.value}T00:00:00`,started_before:`${endInput.value}T23:59:59`});
  };
  startInput.onchange=applyRange;
  endInput.onchange=applyRange;
}

function selectedProjectModelRows(models,selectedMap=new Map()){
  return models.filter(model=>model.status==='active'||selectedMap.has(model.id)).map(model=>{
    const configured=selectedMap.get(model.id)||{};
    return `<div class="project-model-row" data-model-row="${model.id}" data-search="${esc(`${model.name} ${model.alias} ${model.provider_name||''}`.toLowerCase())}" hidden>
      <label class="check model-choice"><input type="checkbox" name="model_ids" value="${model.id}" ${selectedMap.has(model.id)?'checked':''}>${brandMark(model.provider_slug,model.provider_name)}<span><strong>${esc(model.alias)}</strong><small>${esc(model.provider_name||model.name)}</small></span></label>
      <label>默认<input type="radio" name="default_model_id" value="${model.id}" ${Number(configured.is_default)===1?'checked':''}></label>
    </div>`;
  }).join('');
}

function fuzzyModelMatch(text,query){
  const normalizedText=text.toLowerCase().replace(/\s+/g,' ').trim();
  const normalizedQuery=query.toLowerCase().replace(/\s+/g,' ').trim();
  if(!normalizedQuery)return false;
  if(normalizedText.includes(normalizedQuery))return true;
  const tokens=normalizedQuery.split(' ').filter(Boolean);
  if(tokens.length>1&&tokens.every(token=>normalizedText.includes(token)))return true;
  let cursor=0;
  for(const character of normalizedText){
    if(character===normalizedQuery[cursor])cursor+=1;
    if(cursor===normalizedQuery.length)return true;
  }
  return false;
}

function collectProjectModels(form){
  const model_ids=[...form.querySelectorAll('input[name="model_ids"]:checked')].map(input=>input.value);
  if(!model_ids.length)throw new Error('请至少选择一个允许调用的模型。');
  let default_model_id=form.querySelector('input[name="default_model_id"]:checked')?.value;
  if(!model_ids.includes(default_model_id))default_model_id=model_ids[0];
  return {model_ids,default_model_id,model_aliases:{},fallback_order:model_ids,model_limits:{}};
}

function bindProjectModelPicker(form){
  const rows=[...form.querySelectorAll('.project-model-row')];
  const search=form.querySelector('.project-model-search');
  const state=form.querySelector('.project-model-search-state');
  const selectedCount=form.querySelector('.project-model-selected-count');
  const applySearch=()=>{
    const query=search?.value.trim()||'';
    let matched=0;
    rows.forEach(row=>{
      const visible=!!query&&matched<12&&fuzzyModelMatch(row.dataset.search||'',query);
      row.hidden=!visible;
      if(visible)matched+=1;
    });
    if(state)state.textContent=query?(matched?`显示 ${matched} 条匹配结果`:'没有找到匹配模型，请尝试模型名、别名或供应商。'):'输入关键词后显示匹配模型，最多展示 12 条。';
  };
  const sync=()=>{
    const checked=[...form.querySelectorAll('input[name="model_ids"]:checked')];
    rows.forEach(row=>row.classList.toggle('selected',row.querySelector('input[name="model_ids"]').checked));
    form.querySelectorAll('input[name="default_model_id"]').forEach(radio=>{radio.disabled=!form.querySelector(`input[name="model_ids"][value="${radio.value}"]`)?.checked});
    const selectedDefault=form.querySelector('input[name="default_model_id"]:checked');
    if(selectedDefault?.disabled)selectedDefault.checked=false;
    if(!form.querySelector('input[name="default_model_id"]:checked')&&checked.length){
      const first=form.querySelector(`input[name="default_model_id"][value="${checked[0].value}"]`);
      if(first)first.checked=true;
    }
    if(selectedCount)selectedCount.textContent=`已选择 ${checked.length} 个模型`;
  };
  form.querySelectorAll('input[name="model_ids"]').forEach(input=>input.onchange=sync);
  if(search)search.oninput=applySearch;
  sync();
  applySearch();
}

function createProjectModelOptions(models){
  return models.map(model=>`<label class="project-model-option" data-search="${esc(`${model.name} ${model.alias} ${model.provider_name||''}`.toLowerCase())}">
    <input type="checkbox" name="model_ids" value="${model.id}">
    ${brandMark(model.provider_slug,model.provider_name)}
    <span><strong>${esc(model.alias)}</strong><small>${esc(model.provider_name||model.name)} · ${esc(model.name)}</small></span>
  </label>`).join('');
}

function bindCreateProjectModelPicker(form,models){
  const picker=form.querySelector('.project-model-picker');
  const trigger=form.querySelector('#project-model-trigger');
  const dropdown=form.querySelector('#project-model-dropdown');
  const search=form.querySelector('.project-model-search');
  const chips=form.querySelector('#project-selected-models');
  const advancedToggle=form.querySelector('#project-advanced-toggle');
  const advancedFields=form.querySelector('#project-advanced-fields');
  const byId=new Map(models.map(model=>[String(model.id),model]));

  const sync=()=>{
    const checked=[...form.querySelectorAll('input[name="model_ids"]:checked')];
    trigger.classList.toggle('has-selection',checked.length>0);
    chips.innerHTML=checked.length?checked.map(input=>{
      const model=byId.get(input.value);
      return `<span class="project-model-chip"><span>${esc(model?.alias||model?.name||input.value)}</span><button type="button" data-remove-model="${esc(input.value)}" aria-label="移除模型">×</button></span>`;
    }).join(''):`<span class="metric-label">${uiLocale==='en'?'No models selected.':'尚未选择模型。'}</span>`;
    chips.querySelectorAll('[data-remove-model]').forEach(button=>button.onclick=()=>{
      const input=form.querySelector(`input[name="model_ids"][value="${button.dataset.removeModel}"]`);
      if(input)input.checked=false;
      sync();
    });
  };

  trigger.onclick=()=>{
    dropdown.hidden=!dropdown.hidden;
    trigger.setAttribute('aria-expanded',String(!dropdown.hidden));
    if(!dropdown.hidden)search.focus();
  };
  search.oninput=()=>{
    const query=search.value.trim().toLowerCase();
    form.querySelectorAll('.project-model-option').forEach(option=>option.hidden=!!query&&!option.dataset.search.includes(query));
  };
  form.querySelectorAll('input[name="model_ids"]').forEach(input=>input.onchange=sync);
  const dropdownController=new AbortController();
  modal.addEventListener('click',event=>{
    if(!picker.contains(event.target)){
      dropdown.hidden=true;
      trigger.setAttribute('aria-expanded','false');
    }
  },{signal:dropdownController.signal});
  modal.addEventListener('close',()=>dropdownController.abort(),{once:true});
  advancedToggle.onclick=()=>{
    const opening=advancedFields.hidden;
    advancedFields.hidden=!opening;
    advancedToggle.classList.toggle('active',opening);
    advancedToggle.setAttribute('aria-expanded',String(opening));
    advancedToggle.querySelector('b').textContent=uiLocale==='en'?(opening?'Hide advanced options':'Show advanced options'):(opening?'隐藏高级选项':'显示高级选项');
  };
  sync();
}

async function projectFormRefined(){
  const models=(await api('/models?page_size=100')).models.filter(model=>model.status==='active');
  modalContent.innerHTML=`<section class="form-card project-create-card"><h2>创建项目</h2><p class="form-error"></p><form id="create-project-form" class="project-create-form">
    <div class="project-create-layout">
      <section class="project-create-pane project-create-required" data-modal-label="基本设置">
        <div class="project-required-fields">
          <label>项目名称 *<input required name="name" placeholder=""></label>
        </div>
        <div class="project-model-field">
          <label>指定模型</label>
          <div class="project-model-picker">
            <button id="project-model-trigger" class="project-model-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span>选择模型</span></button>
            <div id="project-model-dropdown" class="project-model-dropdown" hidden>
              <input class="project-model-search" autocomplete="off" placeholder="搜索模型、别名或供应商">
              <div class="project-model-options" role="listbox" aria-multiselectable="true">${createProjectModelOptions(models)}</div>
              ${models.length?'':'<p class="notice">暂无启用中的模型，请先到模型页面添加并启用模型。</p>'}
            </div>
          </div>
          <div id="project-selected-models" class="project-selected-models"></div>
        </div>
      </section>
      <section class="project-create-pane project-create-advanced" hidden>
        <button id="project-advanced-toggle" class="project-advanced-toggle" type="button" aria-expanded="false" aria-controls="project-advanced-fields" hidden><div><strong>高级选项</strong></div></button>
        <div id="project-advanced-fields" class="project-advanced-fields" hidden>
          <section><h4>配额限制</h4><div class="project-advanced-grid project-quota-grid"><label>每分钟请求数（RPM）<input name="rpm_limit" type="number" min="1" value="60"></label><label>并发上限<input name="concurrency_limit" type="number" min="1" value="5"></label><label>日请求上限<input name="daily_request_limit" type="number" min="1" placeholder="不填则不限"></label><label>月请求上限<input name="monthly_request_limit" type="number" min="1" placeholder="不填则不限"></label></div></section>
        </div>
      </section>
    </div>
    <div class="form-actions"><button class="ghost" type="button" value="cancel">取消</button><button type="submit">创建</button></div>
  </form></section>`;
  modal.showModal();
  modalContent.querySelector('[value="cancel"]').onclick=()=>modal.close();
  const form=modalContent.querySelector('#create-project-form');
  bindCreateProjectModelPicker(form,models);
  attachValidatedSubmit(form,async values=>{
    const routing=collectProjectModels(form);
    const limits={};
    ['rpm_limit','concurrency_limit','daily_request_limit','monthly_request_limit'].forEach(key=>{if(values[key])limits[key]=Number(values[key])});
    const slugBase=values.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,44)||'project';
    const slug=`${slugBase}-${Date.now().toString(36)}`;
    const result=await api('/projects',{method:'POST',body:JSON.stringify({...values,slug,category:'other_tools',environment:'production',model_fallback_enabled:false,limits,...routing})});
    projectCreatedReveal(result,async()=>{
      if(location.hash!=='#projects')location.hash='projects';
      await render('projects');
      modal.close();
    });
  },{closeOnSuccess:false});
}

function renderProjectKeys(keys){
  return `<div class="key-list">${keys.filter(key=>key.status!=='revoked').map(key=>{
    const requests=Number(key.request_count||0),successes=Number(key.success_count||0);
    const successRate=requests?Math.round(successes/requests*100):100;
    const tokens=Number(key.input_tokens||0)+Number(key.output_tokens||0);
    const keyMask=`${key.key_prefix}…${key.key_last4}`;
    return `<article class="key-row">
      <div class="key-row-heading"><strong>${esc(key.name)}</strong><span>${status(key.status)}${key.status==='active'?` <button class="danger key-revoke" data-id="${key.id}">删除</button>`:''}</span></div>
      <div class="key-row-value"><code>${esc(keyMask)}</code><button class="ghost key-copy-icon" type="button" data-id="${key.id}" data-mask="${esc(keyMask)}" title="复制 Key" aria-label="复制 Key"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button></div>
      <p class="key-usage">调用 ${requests} · 成功率 ${successRate}% · Token ${tokens.toLocaleString()} · ${money(key.estimated_cost_cents)} · ${Math.round(Number(key.average_duration_ms||0))}ms</p>
      <p>创建于 ${localDate(key.created_at)}${key.rotation_expires_at?` · 旧 Key 有效至 ${localDate(key.rotation_expires_at)}`:''}</p>
      <div class="row-actions">${key.status==='disabled'?`<button class="ghost key-enable" data-id="${key.id}">恢复</button><button class="danger key-revoke" data-id="${key.id}">删除</button>`:''}</div>
    </article>`;
  }).join('')||'<p class="metric-label">还没有虚拟 Key。</p>'}</div>`;
}

function renderIpRules(rules){
  return `<div class="ip-rules">${rules.map(rule=>`<article class="ip-rule">
    <div class="ip-rule-heading"><span class="status ${rule.rule_type==='allow'?'active':'rejected'}">${rule.rule_type==='allow'?'允许':'阻止'}</span>${status(rule.status)}</div>
    <code class="ip-rule-value">${esc(rule.value)}</code>
    ${rule.note?`<p class="ip-rule-note">${esc(rule.note)}</p>`:''}
    <div class="row-actions"><button class="ghost ip-toggle" data-id="${rule.id}" data-status="${rule.status}">${rule.status==='active'?'停用':'启用'}</button><button class="danger ip-delete" data-id="${rule.id}">删除</button></div>
  </article>`).join('')||'<p class="metric-label">未配置 IP 规则，默认允许所有来源。配置允许规则后，只允许匹配的来源访问。</p>'}</div>`;
}

function renderProjectAdmins(admins){
  return `<div class="key-list">${admins.map(admin=>`<div class="key-row"><div><strong>${esc(admin.email)}</strong><p>${admin.role==='manager'?'项目管理员':'只读查看者'} · 添加于 ${localDate(admin.created_at)}</p></div>${status(admin.status)}<div class="row-actions"><button class="ghost project-admin-toggle" data-id="${admin.id}" data-status="${admin.status}">${admin.status==='active'?'停用':'启用'}</button><button class="danger project-admin-delete" data-id="${admin.id}">移除</button></div></div>`).join('')||'<p class="metric-label">尚未分配项目管理员。全局管理员仍可管理该项目。</p>'}</div>`;
}

function renderProjectWebhooks(webhooks,deliveries){
  return `<div class="key-list">${webhooks.map(webhook=>`<div class="key-row"><div><strong>${esc(webhook.name)}</strong><p>${esc(webhook.url)} · 签名密钥 ••••${esc(webhook.secret_last4)} · ${esc(webhook.event_types)}</p></div>${status(webhook.status)}<div class="row-actions"><button class="ghost webhook-toggle" data-id="${webhook.id}" data-status="${webhook.status}">${webhook.status==='active'?'停用':'启用'}</button><button class="danger webhook-delete" data-id="${webhook.id}">删除</button></div></div>`).join('')||'<p class="metric-label">尚未配置 Webhook。</p>'}</div><div class="webhook-deliveries">${table(['事件','状态','尝试','HTTP','最近错误','时间'],(deliveries||[]).map(delivery=>`<tr><td>${esc(delivery.event_type)}<br><code>${esc(String(delivery.event_id).slice(0,14))}</code></td><td>${status(delivery.status)}</td><td>${delivery.attempt_count}</td><td>${delivery.http_status||'—'}</td><td>${esc(delivery.last_error||'—')}</td><td>${localDate(delivery.updated_at)}</td></tr>`))}</div>`;
}

async function projectDetailFormRefined(projectId){
  const canWrite=canManageProject(projectId);
  const [detail,modelData]=await Promise.all([api(`/projects/${projectId}`),api('/models?page_size=100')]);
  const p=detail.project,selectedMap=new Map(detail.models.map(model=>[model.id,model]));
  modalContent.innerHTML=`<section class="form-card project-management"><p class="form-error"></p>
  <nav class="project-management-tabs" role="tablist" aria-label="项目管理选项">
    <button class="project-management-tab active" type="button" data-management-tab="basic"><strong>基本与额度</strong></button>
    <button class="project-management-tab" type="button" data-management-tab="models"><strong>模型路由</strong></button>
    <button class="project-management-tab" type="button" data-management-tab="keys"><strong>虚拟 Key</strong><small>创建、复制和删除</small></button>
  </nav>
  <form id="project-settings-form" class="project-management-form">
    <div data-management-panel="basic">
      <section class="form-section project-basic-section">
        <div class="project-settings-heading"><div><h3>基本信息</h3></div></div>
        <div class="project-basic-grid"><label>项目名称<input required name="name" value="${esc(p.name)}"></label><label class="span-all">项目描述<textarea name="description" rows="2" placeholder="简要说明项目用途">${esc(p.description||'')}</textarea></label></div>
      </section>
      <section class="form-section project-quota-section">
        <div class="project-settings-heading"><div><h3>项目额度</h3></div></div>
        <div class="project-quota-stack">
          <div class="project-quota-group"><div class="project-quota-heading"><strong>实时容量</strong><small>控制瞬时流量，避免单个项目占满网关。</small></div><div class="project-quota-fields"><label>每分钟请求数（RPM）<input name="rpm_limit" type="number" min="1" value="${p.rpm_limit||60}"></label><label>并发上限<input name="concurrency_limit" type="number" min="1" value="${p.concurrency_limit||5}"></label></div></div>
          <div class="project-quota-group"><div class="project-quota-heading"><strong>请求量限制</strong><small>限制每日和每月允许发起的请求总数。</small></div><div class="project-quota-fields"><label>日请求上限<input name="daily_request_limit" type="number" min="1" value="${p.daily_request_limit||10000}"></label><label>月请求上限<input name="monthly_request_limit" type="number" min="1" value="${p.monthly_request_limit||300000}"></label></div></div>
        </div>
      </section>
    </div>
    <div data-management-panel="models" hidden><div class="form-section"><div class="section-head"><h3>模型路由</h3></div><div class="project-model-search-wrap"><input class="project-model-search" autocomplete="off" placeholder="输入模型、别名或供应商进行搜索"><span class="project-model-selected-count"></span></div><p class="project-model-search-state" aria-live="polite"></p><div class="project-model-config">${selectedProjectModelRows(modelData.models,selectedMap)}</div></div></div>
    <div class="form-actions"><button class="ghost" id="close-project" type="button">关闭</button><button type="submit">保存</button></div>
  </form>
  <section class="form-section project-operations" data-management-panel="keys" hidden><div class="section-head"><div><h3>虚拟key</h3><span class="metric-label">删除后 Key 将立即失效，且不能恢复。</span></div><button id="detail-new-key" type="button">创建虚拟 Key</button></div>${renderProjectKeys(keyData.virtual_keys||[])}</section>
  </section>`;
  modal.showModal();
  const form=modalContent.querySelector('#project-settings-form');
  bindProjectModelPicker(form);
  const panels=[...modalContent.querySelectorAll('[data-management-panel]')];
  modalContent.querySelectorAll('[data-management-tab]').forEach(button=>button.onclick=()=>{
    const selected=button.dataset.managementTab;
    modalContent.querySelectorAll('[data-management-tab]').forEach(tab=>tab.classList.toggle('active',tab===button));
    panels.forEach(panel=>panel.hidden=panel.dataset.managementPanel!==selected);
    form.hidden=!['basic','models'].includes(selected);
    if(!form.hidden){
      form.querySelectorAll(':scope > [data-management-panel]').forEach(panel=>panel.hidden=panel.dataset.managementPanel!==selected);
    }
  });
  modalContent.querySelector('#close-project').onclick=()=>modal.close();
  if(!canWrite){
    modalContent.querySelector('.form-error').insertAdjacentHTML('afterend','<p class="notice">当前账号是只读查看者，可以查看配置和虚拟 Key。</p>');
    form.querySelectorAll('input, select, textarea').forEach(control=>control.disabled=true);
    const submit=form.querySelector('button[type="submit"]');
    if(submit)submit.hidden=true;
    ['#detail-new-key','.key-revoke','.key-enable'].forEach(selector=>{
      modalContent.querySelectorAll(selector).forEach(element=>element.hidden=true);
    });
  }
  attachValidatedSubmit(form,async values=>{
    const routing=collectProjectModels(form),limits={};
    ['rpm_limit','concurrency_limit','daily_request_limit','monthly_request_limit'].forEach(key=>{limits[key]=values[key]?Number(values[key]):null});
    await api(`/projects/${projectId}`,{method:'PATCH',body:JSON.stringify({...values,limits,...routing})});
    showToast('项目设置已保存');
    await projectDetailFormRefined(projectId);
  },{closeOnSuccess:false});
  modalContent.querySelector('#detail-new-key').onclick=()=>keyFormRefined(projectId,()=>projectDetailFormRefined(projectId));
  modalContent.querySelectorAll('.key-copy-icon').forEach(button=>button.onclick=()=>{
    const revealed=revealedVirtualKeys.get(button.dataset.id);
    copyText(revealed?.key||button.dataset.mask||'',revealed?.key?'完整 Key 已复制':'完整 Key 仅在创建时显示，本次已复制 Key 掩码。');
  });
  modalContent.querySelectorAll('.key-revoke').forEach(button=>button.onclick=()=>confirmAction('删除虚拟 Key','删除后该 Key 将立即停止认证，且不能恢复。','确认删除',async()=>{await api(`/virtual-keys/${button.dataset.id}/revoke`,{method:'POST'});showToast('虚拟 Key 已删除');await projectDetailFormRefined(projectId)}));
  modalContent.querySelectorAll('.key-enable').forEach(button=>button.onclick=async()=>{await api(`/virtual-keys/${button.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:'active'})});showToast('虚拟 Key 已恢复');await projectDetailFormRefined(projectId)});
}

function webhookForm(projectId,back){
  modalContent.innerHTML=`<section class="form-card"><h2>添加项目 Webhook</h2><p class="notice">接收方应使用时间戳与原始请求体验证 <code>x-openpass-signature</code>。只允许 HTTPS 地址。</p><p class="form-error"></p><form id="webhook-form" class="fields"><label>名称 *<input required name="name" placeholder="Production events"></label><label class="span-all">回调 URL *<input required name="url" type="url" pattern="https://.*" placeholder="https://example.com/api/webhooks/openpass"></label><fieldset class="span-all"><legend>订阅事件 *</legend><label class="check"><input type="checkbox" name="event_types" value="request.completed" checked>请求完成</label><label class="check"><input type="checkbox" name="event_types" value="job.completed" checked>异步任务完成</label><label class="check"><input type="checkbox" name="event_types" value="alert.created">新告警</label></fieldset><div class="form-actions"><button class="ghost" id="webhook-cancel" type="button">返回</button><button type="submit">创建并显示签名密钥</button></div></form></section>`;
  modal.showModal();
  modalContent.querySelector('#webhook-cancel').onclick=back;
  const form=modalContent.querySelector('#webhook-form');
  attachValidatedSubmit(form,async values=>{
    const event_types=[...form.querySelectorAll('input[name="event_types"]:checked')].map(input=>input.value);
    if(!event_types.length)throw new Error('请至少选择一个 Webhook 事件。');
    const result=await api(`/projects/${projectId}/webhooks`,{method:'POST',body:JSON.stringify({...values,event_types})});
    secretReveal('Webhook 已创建','Webhook 签名密钥',result.signing_secret,'请立即复制签名密钥；关闭后不会再次显示。',back);
  },{closeOnSuccess:false});
}

function rotateKeyForm(keyId,projectId){
  modalContent.innerHTML=`<section class="form-card"><h2>轮换项目专用虚拟 Key</h2><p class="notice">新 Key 立即可用；旧 Key 会在宽限期结束后自动撤销，便于平滑更新线上服务。</p><p class="form-error"></p><form id="rotate-key-form" class="fields"><label>旧 Key 宽限期（分钟）<input required name="grace_period_minutes" type="number" min="1" max="10080" value="1440"></label><label>新 Key 名称（可选）<input name="name" placeholder="Production replacement"></label><label>新 Key 到期时间（可选）<input name="new_key_expires_at" type="datetime-local"></label><div class="form-actions"><button class="ghost" type="button" id="rotate-cancel">返回</button><button type="submit">确认轮换并显示新 Key</button></div></form></section>`;
  modal.showModal();
  modalContent.querySelector('#rotate-cancel').onclick=()=>projectDetailFormRefined(projectId);
  const form=modalContent.querySelector('#rotate-key-form');
  attachValidatedSubmit(form,async values=>{
    values.grace_period_minutes=Number(values.grace_period_minutes);
    const result=await api(`/virtual-keys/${keyId}/rotate`,{method:'POST',body:JSON.stringify(values)});
    keyReveal('虚拟 Key 已轮换',result,`旧 Key 可继续使用至 ${localDate(result.previous_key_active_until)}，之后会自动撤销。`,()=>projectDetailFormRefined(projectId));
  },{closeOnSuccess:false});
}

function keyFormRefined(projectId,back){
  const returnToProject=back||(()=>{modal.close();render('projects')});
  modalContent.innerHTML=`<section class="form-card"><h2>创建项目专用虚拟 Key</h2><p class="notice">真实供应商密钥不会暴露给项目；项目只使用此虚拟 Key 调用网关。</p><p class="form-error"></p><form id="create-key-form" class="fields"><label>Key 名称 *<input name="name" required placeholder="Production API"></label><label>到期时间（可选）<input name="expires_at" type="datetime-local"></label><div class="form-actions"><button class="ghost" type="button" id="key-cancel">${back?'返回':'取消'}</button><button type="submit">创建并显示 Key</button></div></form></section>`;
  modal.showModal();
  modalContent.querySelector('#key-cancel').onclick=returnToProject;
  const form=modalContent.querySelector('#create-key-form');
  attachValidatedSubmit(form,async values=>{const result=await api(`/projects/${projectId}/keys`,{method:'POST',body:JSON.stringify(values)});keyReveal('虚拟 Key 已创建',result,'请立即复制；关闭后不会再次显示。',returnToProject)},{closeOnSuccess:false});
}

async function requestDetailFormRefined(requestId,back){
  const data=await api(`/requests/${requestId}`),r=data.request;
  const attempts=(data.attempts||[]).map(attempt=>{
    const state=attempt.status==='succeeded'?'success':'failed';
    return `<div class="attempt ${state}"><span class="attempt-index">${attempt.attempt_number}</span><div class="attempt-body"><strong>${esc(attempt.model_alias||attempt.model_name||'未知模型')} · ${esc(attempt.provider_name||'未知供应商')}</strong><p>${esc(attempt.credential_name||'未知凭证')}${attempt.credential_last4?`（••••${esc(attempt.credential_last4)}）`:''} · HTTP ${attempt.http_status||'—'} · ${attempt.duration_ms||'—'}ms${attempt.error_code?` · ${esc(attempt.error_code)} ${esc(attempt.error_message||'')}`:''}</p></div><span class="attempt-time">${status(attempt.status)}</span></div>`;
  }).join('');
  modalContent.innerHTML=`<section class="form-card wide"><h2>请求详情</h2><div class="detail-summary"><dl class="detail-list"><dt>Request ID</dt><dd><code>${esc(r.id)}</code></dd><dt>项目 / 虚拟 Key</dt><dd>${esc(r.project_name||'—')} / ${esc(r.virtual_key_name||'—')}</dd><dt>最终模型 / 供应商</dt><dd>${esc(r.model_alias||r.model_name||'—')} / ${esc(r.provider_name||'—')}</dd><dt>状态 / HTTP</dt><dd>${status(r.status)} ${esc(r.http_status||'—')}</dd><dt>来源</dt><dd>${esc(r.source_ip||'—')} · ${esc(r.source_country||'—')}</dd><dt>耗时 / 费用</dt><dd>${esc(r.duration_ms||'—')}ms / ${money(r.estimated_cost_cents)}</dd><dt>错误</dt><dd>${esc(r.error_code||'—')} ${esc(r.error_message||'')}</dd></dl></div><section class="form-section"><h3>路由尝试链路（${(data.attempts||[]).length} 次）</h3>${attempts||'<p class="metric-label">该请求没有记录到独立路由尝试。</p>'}</section><section class="form-section metadata-section"><h3>请求与响应</h3><div class="metadata-grid"><article><h4>请求</h4><pre>${esc(r.request_metadata||'—')}</pre></article><article><h4>响应</h4><pre>${esc(r.response_metadata||'—')}</pre></article></div></section><div class="form-actions"><button class="ghost" id="request-close" type="button">${back?'返回项目':'关闭'}</button></div></section>`;
  modal.showModal();
  modalContent.querySelector('#request-close').onclick=()=>back?back():modal.close();
}

async function settingsRefined(){
  const data=await api('/settings');
  const s=data.settings;
  const logPolicyOptions={
    metadata:{label:'metadata — 仅元数据',description:'只保存请求参数结构、用量与耗时等统计信息，不保存请求或响应正文。'},
    request:{label:'request — 请求内容',description:'保存请求正文和调用元数据，不保存响应正文，便于排查输入问题。'},
    full:{label:'full — 完整内容',description:'保存请求与响应正文，排查能力最强，但敏感数据与存储风险也最高。'}
  };
  const ipLoggingOptions={
    masked:{label:'masked — 脱敏记录（推荐）',description:'隐藏 IP 的部分地址后保存，兼顾来源分析与隐私保护。'},
    full:{label:'full — 完整记录',description:'保存完整来源 IP，适合严格审计场景，请同时确认隐私与合规要求。'},
    none:{label:'none — 不记录',description:'不保存来源 IP，隐私保护最强，但无法进行基于 IP 的历史追踪。'}
  };
  app.innerHTML=`<section class="form-card settings-card"><div class="section-head"><div><h2>系统默认与治理策略</h2><p class="metric-label">设置会写入操作审计；保留策略由计划任务自动执行。</p></div></div><p class="form-error"></p><form id="settings-form" class="fields">
    <div class="form-section"><h3>网关默认值</h3><div class="form-section-grid"><label class="described-field">默认日志策略<select name="default_log_policy">${Object.entries(logPolicyOptions).map(([value,option])=>`<option value="${value}" ${s.default_log_policy===value?'selected':''}>${option.label}</option>`).join('')}</select><small id="default-log-policy-help">${logPolicyOptions[s.default_log_policy]?.description||logPolicyOptions.metadata.description}</small></label><label class="described-field">默认 IP 记录<select name="default_ip_logging">${Object.entries(ipLoggingOptions).map(([value,option])=>`<option value="${value}" ${s.default_ip_logging===value?'selected':''}>${option.label}</option>`).join('')}</select><small id="default-ip-logging-help">${ipLoggingOptions[s.default_ip_logging]?.description||ipLoggingOptions.masked.description}</small></label><label>供应商超时（毫秒）<input type="number" min="1" name="default_timeout_ms" value="${esc(s.default_timeout_ms||60000)}"></label><label>默认重试次数<input type="number" min="0" name="default_retry_count" value="${esc(s.default_retry_count||1)}"></label><label>虚拟 Key 轮换宽限（分钟）<input type="number" min="1" max="10080" name="virtual_key_rotation_grace_minutes" value="${esc(s.virtual_key_rotation_grace_minutes||1440)}"></label><label>额度系统故障策略<select name="quota_failure_policy"><option value="deny" ${s.quota_failure_policy!=='allow'?'selected':''}>拒绝请求（安全默认）</option><option value="allow" ${s.quota_failure_policy==='allow'?'selected':''}>允许请求</option></select></label><label>凭证自动健康检查<select name="credential_health_check_enabled"><option value="true" ${s.credential_health_check_enabled!=='false'?'selected':''}>启用</option><option value="false" ${s.credential_health_check_enabled==='false'?'selected':''}>停用</option></select></label><label class="span-all">额外脱敏字段（逗号或换行分隔）<textarea name="custom_redaction_fields" rows="3" placeholder="customer_email, phone, internal_user_id">${esc(s.custom_redaction_fields||'')}</textarea><span class="metric-label">完整日志中命中这些字段名的值会替换为 [redacted]；最多 50 个字段。</span></label></div></div>
    <div class="form-section"><h3>数据保留</h3><div class="form-section-grid"><label>请求元数据保留天数<input type="number" min="1" name="request_metadata_retention_days" value="${esc(s.request_metadata_retention_days||180)}"></label><label>原始 IP 保留天数<input type="number" min="1" name="raw_ip_retention_days" value="${esc(s.raw_ip_retention_days||30)}"></label></div></div>
    <div class="form-section"><h3>告警阈值</h3><div class="form-section-grid"><label>额度预警阈值（%）<input type="number" min="1" max="100" name="alert_threshold_warning" value="${esc(s.alert_threshold_warning||70)}"></label><label>额度严重阈值（%）<input type="number" min="1" max="100" name="alert_threshold_critical" value="${esc(s.alert_threshold_critical||90)}"></label><label>错误率阈值（%）<input type="number" min="1" max="100" name="error_rate_alert_percent" value="${esc(s.error_rate_alert_percent||20)}"></label><label>错误率最小样本数<input type="number" min="1" name="error_rate_min_requests" value="${esc(s.error_rate_min_requests||10)}"></label><label>请求突增倍数<input type="number" min="2" name="request_spike_multiplier" value="${esc(s.request_spike_multiplier||3)}"></label><label>单 IP 请求告警阈值<input type="number" min="1" name="ip_request_alert_threshold" value="${esc(s.ip_request_alert_threshold||50)}"></label></div></div>
    <div class="form-actions"><button type="submit">保存系统设置</button></div>
  </form></section>`;
  const logPolicySelect=document.querySelector('[name="default_log_policy"]');
  const ipLoggingSelect=document.querySelector('[name="default_ip_logging"]');
  logPolicySelect.onchange=()=>document.querySelector('#default-log-policy-help').textContent=logPolicyOptions[logPolicySelect.value].description;
  ipLoggingSelect.onchange=()=>document.querySelector('#default-ip-logging-help').textContent=ipLoggingOptions[ipLoggingSelect.value].description;
  attachValidatedSubmit(document.querySelector('#settings-form'),async values=>{
    const numeric=['default_timeout_ms','default_retry_count','request_metadata_retention_days','raw_ip_retention_days','alert_threshold_warning','alert_threshold_critical','virtual_key_rotation_grace_minutes','error_rate_alert_percent','error_rate_min_requests','request_spike_multiplier','ip_request_alert_threshold'];
    numeric.forEach(key=>values[key]=Number(values[key]));
    await api('/settings',{method:'PATCH',body:JSON.stringify(values)});
    showToast('系统设置已保存');
    await settingsRefined();
  },{closeOnSuccess:false});
}

modelForm = modelFormOverride;
overview = overviewRefined;
projectForm = projectFormRefined;
projectDetailForm = projectDetailFormRefined;
keyForm = keyFormRefined;
requestDetailForm = requestDetailFormRefined;
settings = settingsRefined;

document.querySelector('#refresh-view').onclick=async event=>{
  const button=event.currentTarget;
  button.classList.add('is-loading');
  button.disabled=true;
  await render();
  button.classList.remove('is-loading');
  button.disabled=false;
  showToast('页面已刷新');
};
window.addEventListener('hashchange',()=>render());
const localeSelect=document.querySelector('#locale-select');
localeSelect.value=uiLocale;
localeSelect.onchange=()=>{
  localStorage.setItem('openpass-locale',localeSelect.value);
  localStorage.removeItem('apihub-locale');
  location.reload();
};
applyLocale(document);
if(uiLocale==='en'){
  new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType===Node.TEXT_NODE)node.nodeValue=englishize(node.nodeValue||'');
      else if(node.nodeType===Node.ELEMENT_NODE)applyLocale(node);
    }));
  }).observe(document.body,{childList:true,subtree:true});
}
async function initializeAdmin(){
  try{
    adminSession=await api('/session');
    const logoutButton=document.querySelector('#logout-button');
    logoutButton.hidden=!['password','oauth','hybrid'].includes(adminSession.auth_mode);
    logoutButton.onclick=async()=>{
      await fetch('/admin/auth/logout',{method:'POST'});
      location.assign('/admin/login.html');
    };
    const sessionNote=document.querySelector('.sidebar-note span');
    if(adminSession.role==='project'){
      document.querySelectorAll('nav a').forEach(link=>{if(globalOnlyViews.has(link.dataset.view))link.hidden=true});
      document.querySelectorAll('.nav-group').forEach(group=>{if(!group.querySelector('a:not([hidden])'))group.hidden=true});
      document.querySelector('.brand').href='#projects';
      sessionNote.textContent=`${adminSession.email} · 项目权限`;
      const current=location.hash.slice(1).split('?')[0]||'overview';
      if(globalOnlyViews.has(current)){location.hash='projects';return}
    }else{
      sessionNote.textContent=adminSession.email
        ? `${adminSession.email} · 全局管理员`
        : adminSession.auth_mode==='password'?'账号密码登录':'Cloudflare Access 已保护';
    }
    await render();
  }catch(error){
    app.innerHTML=`<div class="notice">${esc(error.message)}</div>`;
  }
}
initializeAdmin();
