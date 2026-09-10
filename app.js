/* 副业收集工作台 - 主逻辑 */
(function () {
  'use strict';
  var LS = 'shh.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return (Math.round(n * 100) / 100).toLocaleString('zh-CN'); };
  var money = function (n) { return '¥' + fmt(Math.round(n)); };

  /* ---------------- state ---------------- */
  var DEF = {
    settings: { capital: 500, hours: 3, maxSkill: 5, maxRisk: 5, expanded: false, view: 'sources' },
    filters: { cats: [], sort: 'match', kw: '' },
    tracked: {}, plans: [], custom: [], scout: {}
  };
  var state = load();
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || '{}');
      return {
        settings: Object.assign({}, DEF.settings, raw.settings || {}),
        filters: Object.assign({}, DEF.filters, raw.filters || {}),
        tracked: raw.tracked || {}, plans: raw.plans || [], custom: raw.custom || [],
        scout: raw.scout || {}
      };
    } catch (e) { return JSON.parse(JSON.stringify(DEF)); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { } }

  var STATUS = [
    { k: 'wish', label: '待调研', color: '#6B7280' },
    { k: 'testing', label: '测试中', color: '#2563EB' },
    { k: 'running', label: '已启动', color: '#7C3AED' },
    { k: 'profit', label: '已盈利', color: '#059669' },
    { k: 'drop', label: '已放弃', color: '#DC2626' }
  ];
  var statusOf = function (k) { return STATUS.filter(function (s) { return s.k === k; })[0] || STATUS[0]; };

  var allHustles = function () { return window.HUSTLES.concat(state.custom); };
  var byId = function (id) { return allHustles().filter(function (h) { return h.id === id; })[0]; };

  /* ---------------- 匹配度 ---------------- */
  function matchScore(h) {
    var s = state.settings;
    var f = 0;
    // 资金：最低启动资金在预算内
    f += h.capital[0] <= s.capital ? 1 : Math.max(0, 1 - (h.capital[0] - s.capital) / Math.max(s.capital, 500));
    // 时间
    f += h.time[0] <= s.hours ? 1 : Math.max(0, 1 - (h.time[0] - s.hours) / 4);
    // 技能：越低越好，且在允许范围内
    f += h.skill <= s.maxSkill ? (6 - h.skill) / 5 : 0;
    // 风险
    f += h.risk <= s.maxRisk ? (6 - h.risk) / 5 : 0;
    // 收入潜力（对数归一）
    var inc = Math.log10(Math.max(h.income[1], 100)) / Math.log10(100000);
    f += Math.min(1, inc);
    return Math.round((f / 5) * 100);
  }

  function catColor(cat) {
    var c = (window.CATEGORIES || []).filter(function (x) { return x.key === cat; })[0];
    return c ? c.color : '#6B7280';
  }
  function stars(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '<span class="off">★</span>';
    return '<span class="stars">' + s + '</span>';
  }

  /* ---------------- 点子库 ---------------- */
  function filtered() {
    var s = state.settings, f = state.filters;
    var kw = (f.kw || '').trim().toLowerCase();
    var list = allHustles().filter(function (h) {
      if (h.capital[0] > s.capital) return false;
      if (h.time[0] > s.hours) return false;
      if (h.skill > s.maxSkill) return false;
      if (h.risk > s.maxRisk) return false;
      if (f.cats.length && f.cats.indexOf(h.cat) < 0) return false;
      if (kw) {
        var hay = (h.name + ' ' + h.cat + ' ' + h.desc + ' ' + (h.channels || []).join(' ') + ' ' + (h.tags || []).join(' ') + ' ' + (h.picks || []).join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    var sort = f.sort;
    list.sort(function (a, b) {
      if (sort === 'payback') return a.payback - b.payback;
      if (sort === 'income') return b.income[1] - a.income[1];
      if (sort === 'lowrisk') return a.risk - b.risk || a.skill - b.skill;
      if (sort === 'lowskill') return a.skill - b.skill || a.risk - b.risk;
      return matchScore(b) - matchScore(a);
    });
    return list;
  }

  function cardHTML(h) {
    var t = state.tracked[h.id];
    var m = matchScore(h);
    return '<article class="hcard" data-id="' + esc(h.id) + '">' +
      '<div class="hcard-top"><h3>' + esc(h.name) + '</h3>' +
      '<span class="cat-tag" style="background:' + catColor(h.cat) + '1A;color:' + catColor(h.cat) + '">' + esc(h.cat) + '</span></div>' +
      '<p class="hcard-desc">' + esc(h.desc) + '</p>' +
      '<div class="metrics">' +
      '<span><i>启动</i> <b>' + (h.capital[0] === 0 ? '0 起' : money(h.capital[0]) + '起') + '</b></span>' +
      '<span><i>每天</i> <b>' + h.time[0] + '-' + h.time[1] + 'h</b></span>' +
      '<span><i>见钱</i> <b>' + (h.payback <= 7 ? h.payback + '天' : h.payback + '天') + '</b></span>' +
      '<span><i>月入</i> <b>' + money(h.income[0]) + '~' + money(h.income[1]) + '</b></span>' +
      '</div>' +
      '<div class="hcard-foot"><div class="badges">' +
      (h.tags || []).slice(0, 3).map(function (x) { return '<span class="badge">' + esc(x) + '</span>'; }).join('') +
      (t ? '<span class="badge" style="color:' + statusOf(t.status).color + '">' + statusOf(t.status).label + '</span>' : '') +
      '</div><div class="row" style="gap:8px">' +
      (m >= 70 ? '<span class="match">匹配 ' + m + '%</span>' : '') +
      '<button class="star' + (t ? ' on' : '') + '" data-star="' + esc(h.id) + '" title="收藏">★</button></div></div>' +
      '</article>';
  }

  function renderLibrary() {
    var list = filtered();
    $('#cardGrid').innerHTML = list.map(cardHTML).join('');
    $('#libEmpty').hidden = list.length > 0;
    $('#resultCount').innerHTML = '共 <b>' + list.length + '</b> 个方向' + (state.custom.length ? '（含你导入的 ' + state.custom.length + ' 个）' : '');
    $('#filterHint').textContent = '可投入 ¥' + fmt(state.settings.capital) + ' · 每天 ' + state.settings.hours + 'h';
  }

  function renderCatChips() {
    var wrap = $('#catChips');
    wrap.innerHTML = (window.CATEGORIES || []).map(function (c) {
      var on = state.filters.cats.indexOf(c.key) >= 0;
      return '<span class="chip' + (on ? ' on' : '') + '" data-cat="' + esc(c.key) + '">' + esc(c.key) + '</span>';
    }).join('');
  }

  /* ---------------- 详情抽屉 ---------------- */
  function openDrawer(id) {
    var h = byId(id);
    if (!h) return;
    var t = state.tracked[id];
    $('#dTitle').textContent = h.name;
    $('#dSub').innerHTML = '<span class="cat-tag" style="background:' + catColor(h.cat) + '1A;color:' + catColor(h.cat) + '">' + esc(h.cat) + '</span>' +
      '<span class="hint">匹配度 ' + matchScore(h) + '%</span>';
    var html = '<div class="dsec kv-grid">' +
      '<div class="kv"><span>启动资金</span><b>' + (h.capital[0] === 0 ? '几乎为零' : money(h.capital[0]) + ' ~ ' + money(h.capital[1])) + '</b></div>' +
      '<div class="kv"><span>每天投入</span><b>' + h.time[0] + ' - ' + h.time[1] + ' 小时</b></div>' +
      '<div class="kv"><span>首次变现</span><b>约 ' + h.payback + ' 天</b></div>' +
      '<div class="kv"><span>月收入潜力</span><b>' + money(h.income[0]) + ' ~ ' + money(h.income[1]) + '</b></div>' +
      '<div class="kv"><span>技能门槛</span><b>' + stars(h.skill) + '</b></div>' +
      '<div class="kv"><span>风险等级</span><b>' + stars(h.risk) + '</b></div>' +
      '</div>' +
      '<div class="dsec"><h4>是什么</h4><p>' + esc(h.desc) + '</p></div>' +
      (h.channels && h.channels.length ? '<div class="dsec"><h4>主战场</h4><div class="badges">' + h.channels.map(function (c) { return '<span class="badge">' + esc(c) + '</span>'; }).join('') + '</div></div>' : '') +
      '<div class="dsec"><h4>启动步骤</h4><ol class="steps">' + (h.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>' +
      (h.picks && h.picks.length ? '<div class="dsec"><h4>可以优先试的方向 / 选品</h4><div class="pick-box"><ul>' + h.picks.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div></div>' : '') +
      '<div class="dsec"><h4>运营建议</h4><div class="tip-box">' + esc(h.tips) + '</div></div>' +
      (h.tags && h.tags.length ? '<div class="dsec"><h4>标签</h4><div class="badges">' + h.tags.map(function (x) { return '<span class="badge">' + esc(x) + '</span>'; }).join('') + '</div></div>' : '');
    $('#dBody').innerHTML = html;

    var foot = '<select id="dStatus" class="status-sel">' + STATUS.map(function (s) {
      return '<option value="' + s.k + '"' + (t && t.status === s.k ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('') + '</select>' +
      '<button class="btn primary" id="dSave">保存记录</button>' +
      '<button class="btn ghost" id="dCalc">用它测算</button>' +
      (t ? '<button class="btn ghost danger" id="dRemove">取消收藏</button>' : '<button class="btn ghost" id="dStar">★ 收藏</button>');
    $('#dFoot').innerHTML = foot;

    if (t) {
      var extra = document.createElement('div');
      extra.className = 'dsec';
      extra.innerHTML = '<h4>我的记录</h4><div class="note-area"><label>笔记 / 观察到的情况</label><textarea id="dNote">' + esc(t.note || '') + '</textarea></div>' +
        '<div class="note-area"><label>下一步行动</label><textarea id="dNext">' + esc(t.next || '') + '</textarea></div>' +
        '<div class="track-row"><input type="number" id="dSpent" placeholder="已投入(元)" value="' + (t.spent || '') + '"><input type="number" id="dEarned" placeholder="已收入(元)" value="' + (t.earned || '') + '"></div>';
      $('#dBody').appendChild(extra);
    }

    $('#drawer').hidden = false; $('#mask').hidden = false;
    var bSave = $('#dSave'), bCalc = $('#dCalc'), bStar = $('#dStar'), bRemove = $('#dRemove');
    if (bSave) bSave.onclick = function () { saveTrack(h.id); };
    if (bCalc) bCalc.onclick = function () { switchView('calc'); $('#cName').value = h.name; $('#cSetup').value = h.capital[0] || 0; closeDrawer(); calc(); };
    if (bStar) bStar.onclick = function () { toggleStar(h.id); openDrawer(h.id); };
    if (bRemove) bRemove.onclick = function () { delete state.tracked[h.id]; save(); closeDrawer(); renderLibrary(); renderMine(); toast('已取消收藏'); };
  }
  function closeDrawer() { $('#drawer').hidden = true; $('#mask').hidden = true; }

  function saveTrack(id) {
    var now = Date.now();
    var old = state.tracked[id] || {};
    state.tracked[id] = {
      status: $('#dStatus').value,
      note: ($('#dNote') && $('#dNote').value) || old.note || '',
      next: ($('#dNext') && $('#dNext').value) || old.next || '',
      spent: parseFloat(($('#dSpent') && $('#dSpent').value) || old.spent || 0),
      earned: parseFloat(($('#dEarned') && $('#dEarned').value) || old.earned || 0),
      addedAt: old.addedAt || now, updatedAt: now
    };
    save(); renderLibrary(); renderMine(); toast('已保存');
  }
  function toggleStar(id) {
    if (state.tracked[id]) delete state.tracked[id];
    else state.tracked[id] = { status: 'wish', note: '', next: '', spent: 0, earned: 0, addedAt: Date.now(), updatedAt: Date.now() };
    save(); renderLibrary(); renderMine();
  }

  /* ---------------- 我的副业 ---------------- */
  var mineFilter = 'all';
  function renderMine() {
    var tabs = [{ k: 'all', label: '全部', color: '#4F46E5' }].concat(STATUS);
    $('#statusTabs').innerHTML = tabs.map(function (s) {
      var n = Object.keys(state.tracked).filter(function (id) { return s.k === 'all' || state.tracked[id].status === s.k; }).length;
      return '<span class="chip' + (mineFilter === s.k ? ' on' : '') + '" data-status="' + s.k + '">' + s.label + ' ' + n + '</span>';
    }).join('');
    var ids = Object.keys(state.tracked).filter(function (id) { return mineFilter === 'all' || state.tracked[id].status === mineFilter; })
      .sort(function (a, b) { return (state.tracked[b].updatedAt || 0) - (state.tracked[a].updatedAt || 0); });
    var list = ids.map(byId).filter(Boolean);
    $('#mineGrid').innerHTML = list.map(function (h) {
      var t = state.tracked[h.id], st = statusOf(t.status);
      return '<article class="hcard mine-card" data-id="' + esc(h.id) + '">' +
        '<div class="hcard-top"><h3>' + esc(h.name) + '</h3>' +
        '<span class="cat-tag" style="background:' + st.color + '1A;color:' + st.color + '">' + st.label + '</span></div>' +
        (t.next ? '<p class="hcard-desc" style="-webkit-line-clamp:2">下一步：' + esc(t.next) + '</p>' : '<p class="hcard-desc" style="-webkit-line-clamp:2">' + esc(h.desc) + '</p>') +
        (t.note ? '<p class="hcard-desc" style="-webkit-line-clamp:2;color:var(--text-3)">笔记：' + esc(t.note) + '</p>' : '') +
        '<div class="metrics">' +
        '<span><i>已投入</i> <b>' + money(t.spent || 0) + '</b></span>' +
        '<span><i>已收入</i> <b>' + money(t.earned || 0) + '</b></span>' +
        '<span><i>净额</i> <b style="color:' + ((t.earned || 0) - (t.spent || 0) >= 0 ? 'var(--ok)' : 'var(--danger)') + '">' + money((t.earned || 0) - (t.spent || 0)) + '</b></span>' +
        '</div>' +
        '<div class="hcard-foot"><span class="hint">更新于 ' + new Date(t.updatedAt || Date.now()).toLocaleDateString('zh-CN') + '</span>' +
        '<button class="star on" data-star="' + esc(h.id) + '">★</button></div>' +
        '</article>';
    }).join('');
    $('#mineEmpty').hidden = list.length > 0;
    if (!list.length && Object.keys(state.tracked).length) {
      $('#mineEmpty').textContent = '这个状态下还没有副业。换个标签看看。';
    } else {
      $('#mineEmpty').textContent = '还没有收藏任何副业。去「点子库」点击卡片右下角的 ☆ 收藏。';
    }
    renderStats();
  }
  function renderStats() {
    var ids = Object.keys(state.tracked);
    var spent = 0, earned = 0;
    ids.forEach(function (id) { spent += state.tracked[id].spent || 0; earned += state.tracked[id].earned || 0; });
    var counts = STATUS.map(function (s) { return { l: s.label, n: ids.filter(function (id) { return state.tracked[id].status === s.k; }).length }; });
    $('#statsBox').innerHTML = '<div class="stat"><span>收藏方向</span><b>' + ids.length + '</b></div>' +
      '<div class="stat"><span>累计投入</span><b>' + money(spent) + '</b></div>' +
      '<div class="stat"><span>累计收入</span><b>' + money(earned) + '</b></div>' +
      '<div class="stat"><span>净收益</span><b style="color:' + (earned - spent >= 0 ? 'var(--ok)' : 'var(--danger)') + '">' + money(earned - spent) + '</b></div>' +
      '<div class="stat"><span>测算方案</span><b>' + state.plans.length + '</b></div>' +
      counts.map(function (c) { return '<div class="stat"><span>' + c.l + '</span><b>' + c.n + '</b></div>'; }).join('');
  }

  /* ---------------- AI 挖掘（本地组合引擎） ---------------- */
  var ASSETS = [
    { k: 'design', label: '设计/审美' }, { k: 'write', label: '写作/文案' }, { k: 'edit', label: '剪辑/拍摄' },
    { k: 'code', label: '编程/技术' }, { k: 'sell', label: '销售/沟通' }, { k: 'lang', label: '外语' },
    { k: 'domain', label: '某行业经验' }, { k: 'craft', label: '手工/厨艺' }, { k: 'local', label: '本地人脉/场地' },
    { k: 'data', label: '数据/表格' }, { k: 'teach', label: '教学/表达' }, { k: 'none', label: '没有特别的' }
  ];
  var AVOIDS = [
    { k: 'cam', label: '出镜露脸' }, { k: 'stock', label: '囤货压货' }, { k: 'social', label: '跟人打交道' },
    { k: 'content', label: '长期写内容' }, { k: 'offline', label: '外出跑腿' }, { k: 'en', label: '英文/跨境' },
    { k: 'tech', label: '学新技术' }, { k: 'risk', label: '承担亏损' }
  ];
  var MODES = [
    { k: 'goods', label: '卖货赚差价', cap: 2000, payback: 15, need: ['data', 'sell'], flags: { stock: 2, risk: 2 }, offer: '找一款你能拿到稳定货源、有 30% 以上毛利的商品', money: '毛利 = 售价 - 进货 - 运费 - 平台扣点' },
    { k: 'affiliate', label: '带货拿佣金', cap: 500, payback: 20, need: ['write', 'edit', 'sell'], flags: { content: 2 }, offer: '选 3-5 个高佣商品，围绕使用场景做内容', money: '收入 = 曝光 × 点击率 × 转化率 × 佣金' },
    { k: 'service', label: '技能接单', cap: 200, payback: 4, need: ['design', 'write', 'edit', 'code', 'data', 'lang', 'teach'], flags: {}, offer: '把你的能力包装成 1 个明确的交付物（如"3 天交付一套详情页"）', money: '收入 = 客单价 × 月接单数；瓶颈在时间' },
    { k: 'ads', label: '内容流量变现', cap: 300, payback: 45, need: ['write', 'edit', 'design'], flags: { content: 2, cam: 1 }, offer: '固定一个垂类持续输出，先做到 1000 粉', money: '收入 = 播放量 × 千次单价 + 广告商单' },
    { k: 'course', label: '知识付费', cap: 500, payback: 40, need: ['domain', 'teach', 'write'], flags: { content: 1 }, offer: '把你做成过的一件事，拆成别人能照做的步骤', money: '收入 = 单价 × 学员数；先预售再制作' },
    { k: 'digital', label: '数字产品', cap: 200, payback: 25, need: ['design', 'data', 'write', 'code'], flags: {}, offer: '做一份能反复售卖的模板/素材/工具包', money: '一次制作无限复制，边际成本≈0' },
    { k: 'match', label: '撮合信息差', cap: 800, payback: 8, need: ['sell', 'local', 'domain'], flags: { social: 2, offline: 1 }, offer: '把 A 有需求、B 有供给的两端连起来，收撮合费或差价', money: '收入 = 单笔撮合费 × 成交笔数' },
    { k: 'rent', label: '闲置资源出租', cap: 1000, payback: 18, need: ['local'], flags: { risk: 1 }, offer: '盘点你手里别人偶尔需要的东西，按次/按天出租', money: '近乎纯利，取决于出租率' }
  ];
  var CHANNELS = [
    { k: 'xhs', label: '小红书', cap: 300, payback: 40, need: ['design', 'write', 'edit'], flags: { content: 2 }, first: '拆解 20 篇同赛道爆款的封面与标题公式，第 4 天起日更 3 条，坚持 14 天看第一篇数据' },
    { k: 'dy', label: '抖音 / 视频号', cap: 500, payback: 30, need: ['edit', 'write'], flags: { content: 2, cam: 1 }, first: '先做 10 条 15 秒短视频测试完播率，跑出 1 条数据好的就复制它的结构 20 遍' },
    { k: 'xianyu', label: '闲鱼 / 二手平台', cap: 200, payback: 3, need: [], flags: {}, first: '今天上架 5 个品，标题写真实自用场景，每天擦亮，3 天内必出第一单' },
    { k: 'shop', label: '电商店铺（淘/拼/抖店）', cap: 2000, payback: 20, need: ['data'], flags: { stock: 1, risk: 1 }, first: '用生意参谋找"搜索量涨、在售商品少"的蓝海词，先上 10 个品测点击率' },
    { k: 'wechat', label: '微信私域 / 社群', cap: 100, payback: 7, need: ['sell'], flags: { social: 2 }, first: '拉起 30 人小群，先做一次口碑团，重点是把售后服务做到位' },
    { k: 'local', label: '本地社群 / 线下', cap: 300, payback: 5, need: ['local', 'craft'], flags: { offline: 2, social: 1 }, first: '在小区群/本地群发一条真实服务说明，前 5 单只求好评不求赚钱' },
    { k: 'freelance', label: '技能接单平台', cap: 200, payback: 5, need: ['design', 'write', 'edit', 'code', 'data', 'lang', 'teach'], flags: {}, first: '先做 3 份"假想项目"当作品集，定价从低起步，出 3 单好评后提价 50%' },
    { k: 'b2b', label: '企业直客（B端）', cap: 500, payback: 25, need: ['domain', 'sell', 'code'], flags: { social: 2 }, first: '列 30 家目标企业，用你能解决的一个具体问题去换一次免费诊断机会' },
    { k: 'global', label: '跨境平台（Etsy/Gumroad）', cap: 500, payback: 35, need: ['lang', 'design', 'code'], flags: { en: 2 }, first: '研究平台上同类热销品的标题与标签，先上 10 个品，主图用 mockup 提升质感' }
  ];
  var ASSET_EDGE = {
    design: '你的审美是硬通货——视觉平台上的第一关就是图好不好看，你能省掉外包成本、起号更快。',
    write: '会写文案等于自带转化率，无论卖货还是做内容，你能把同样的流量多赚 30%。',
    edit: '短视频是这个时代最大的流量入口，剪辑能力让你能直接用最低成本换流量。',
    code: '你能把重复劳动自动化——别人雇人干的活，你写个脚本，边际成本几乎为零。',
    sell: '会沟通的人做撮合类业务最占便宜，这类生意不需要投一分钱，靠的就是把两端连起来。',
    lang: '外语让你直接面对全球市场，同样的产品能卖更高的价格，竞争反而更小。',
    domain: '行业经验是最难被复制的护城河，"懂行"本身就是产品。',
    craft: '手作与厨艺天然有溢价，标准化大厂做不了的事，就是你的机会。',
    local: '本地资源是互联网巨头抢不走的地盘，线下信任转化率远高于线上。',
    data: '会算账的人不会亏钱。在人人靠感觉选品的赛道里，数据能力就是降维打击。',
    teach: '能把复杂的东西讲明白，是知识付费、培训、咨询三种变现的共同底层能力。',
    none: '没有特别技能也能起步——优先选"信息差"和"服务执行"类，先赚到第一块钱再补技能。'
  };

  function renderAiChips() {
    $('#skillChips').innerHTML = ASSETS.map(function (a) { return '<span class="chip" data-asset="' + a.k + '">' + a.label + '</span>'; }).join('');
    $('#avoidChips').innerHTML = AVOIDS.map(function (a) { return '<span class="chip" data-avoid="' + a.k + '">' + a.label + '</span>'; }).join('');
  }

  function generateCombos() {
    var capital = parseFloat($('#aiCapital').value) || 0;
    var hours = parseFloat($('#aiTime').value) || 1;
    var days = parseFloat($('#aiDays').value) || 5;
    var speed = $('#aiSpeed').value;
    var assets = $$('#skillChips .chip.on').map(function (c) { return c.dataset.asset; });
    var avoids = $$('#avoidChips .chip.on').map(function (c) { return c.dataset.avoid; });
    var weeklyHours = hours * days;

    var combos = [];
    MODES.forEach(function (m) {
      CHANNELS.forEach(function (c) {
        var cap = Math.max(m.cap, c.cap);
        var score = 50;
        // 资金
        score += capital >= cap ? 20 : -Math.min(40, (cap - capital) / cap * 60);
        // 时间：周投入 vs 需求（渠道内容型更吃时间）
        var needWeekly = (m.k === 'ads' || c.flags.content) ? 12 : 6;
        score += weeklyHours >= needWeekly ? 12 : -Math.min(30, (needWeekly - weeklyHours) * 3);
        // 能力匹配
        var need = m.need.concat(c.need);
        var hit = need.filter(function (n) { return assets.indexOf(n) >= 0; });
        score += hit.length * 12;
        if (!assets.length && m.need.length === 0) score += 5;
        // 变现速度
        var pb = Math.max(m.payback, c.payback);
        if (speed === 'fast') score += pb <= 7 ? 18 : (pb <= 20 ? 4 : -18);
        else if (speed === 'mid') score += pb <= 30 ? 10 : -4;
        else score += pb >= 30 ? 10 : 0;
        // 排斥项惩罚
        var penalty = 0, why = [];
        Object.keys(c.flags).concat(Object.keys(m.flags)).forEach(function (k) {
          if (avoids.indexOf(k) >= 0) penalty += 18 * ((c.flags[k] || 0) + (m.flags[k] || 0));
        });
        if (avoids.indexOf('risk') >= 0) penalty += (m.flags.risk || 0) * 10;
        score -= penalty;
        // 收入天花板轻微加权
        score += (m.k === 'goods' || m.k === 'course' || m.k === 'ads') ? 4 : 0;
        combos.push({ m: m, c: c, score: Math.round(score), cap: cap, hit: hit, pb: pb, weekly: weeklyHours });
      });
    });
    combos.sort(function (a, b) { return b.score - a.score; });
    return { combos: combos.slice(0, 6), assets: assets, avoids: avoids, capital: capital, weeklyHours: weeklyHours, speed: speed };
  }

  function renderAi() {
    var r = generateCombos();
    var edge = r.assets.length ? r.assets.map(function (a) { return ASSET_EDGE[a]; }).slice(0, 2).join(' ') : ASSET_EDGE.none;
    var html = r.combos.map(function (x) {
      var name = x.m.label + ' × ' + x.c.label;
      var why = [];
      why.push('启动约 ' + money(x.cap) + (r.capital >= x.cap ? '，在你的预算内' : '，超出预算 ¥' + fmt(x.cap - r.capital) + '，需要降配或延后'));
      why.push('预计 ' + x.pb + ' 天见到第一笔钱');
      if (x.hit.length) why.push('直接用到你的' + x.hit.map(function (h) { return (ASSETS.filter(function (a) { return a.k === h; })[0] || {}).label; }).join('、'));
      why.push('每周约需 ' + (x.m.k === 'ads' || x.c.flags.content ? 10 : 6) + ' 小时' + (r.weeklyHours >= (x.m.k === 'ads' || x.c.flags.content ? 10 : 6) ? '，你的时间够' : '，时间偏紧，需压缩范围'));
      if (r.avoids.length) {
        var conflict = Object.keys(x.c.flags).concat(Object.keys(x.m.flags)).filter(function (k) { return r.avoids.indexOf(k) >= 0; });
        if (conflict.length) why.push('⚠️ 与你的排斥项有冲突：' + conflict.map(function (k) { return (AVOIDS.filter(function (a) { return a.k === k; })[0] || {}).label; }).join('、'));
      }
      return '<div class="ai-item">' +
        '<h3><span>' + esc(name) + '</span><span class="score">' + x.score + ' 分</span></h3>' +
        '<p>做法：' + esc(x.m.offer) + '，主战场放在' + esc(x.c.label) + '。收入逻辑：' + esc(x.m.money) + '。</p>' +
        '<div class="ai-meta">' + why.map(function (w) { return '<span>· ' + esc(w) + '</span>'; }).join('') + '</div>' +
        '<p style="color:var(--text)"><b>7 天冷启动：</b>' + esc(x.c.first) + '</p>' +
        '</div>';
    }).join('');
    $('#aiResults').innerHTML = '<div class="tip-box" style="margin-bottom:12px">' + esc(edge) + '</div>' + html;
    $('#aiResultCard').hidden = false;
    $('#promptText').textContent = buildPrompt(r);
  }

  function buildPrompt(r) {
    var s = state.settings;
    var assets = r.assets.map(function (a) { return (ASSETS.filter(function (x) { return x.k === a; })[0] || {}).label; }).join('、') || '暂无特别技能';
    var avoids = r.avoids.map(function (a) { return (AVOIDS.filter(function (x) { return x.k === a; })[0] || {}).label; }).join('、') || '无';
    return '你是一位有 10 年经验的副业与电商运营顾问，请帮我挖掘适合我的副业方向。\n\n' +
      '【我的条件】\n' +
      '- 可投入启动资金：¥' + r.capital + '（超出这个数目的方案不要给）\n' +
      '- 每天可投入：' + $('#aiTime').value + ' 小时，每周 ' + $('#aiDays').value + ' 天\n' +
      '- 变现速度期望：' + $('#aiSpeed').selectedOptions[0].text + '\n' +
      '- 我具备的能力：' + assets + '\n' +
      '- 我不愿意做的事：' + avoids + '\n' +
      '- 我所在地的资源：请参考通用情况给出建议，并在需要本地资源时标注出来\n\n' +
      '【要求】\n' +
      '1. 给出 8 个具体、可执行的副业方向，避开我已排除的事项。\n' +
      '2. 每个方向必须说明：做什么、第一批客户/流量从哪来、第一笔钱多久能到、具体的前 3 步动作、最容易踩的坑。\n' +
      '3. 优先低成本、可验证的方向，不要推荐需要大额投流或加盟的项目。\n' +
      '4. 如果涉及电商卖货，请额外给出 3 个具体的选品方向并说明判断理由。\n\n' +
      '【输出格式】只输出一个 JSON 数组，不要任何解释文字，字段如下：\n' +
      '[{"name":"名称","cat":"电商卖货|内容创作|技能接单|知识付费|数字产品|本地生活|AI 应用|信息差","capital":[最低启动资金,常规启动资金],"time":[每天最少小时,每天最多小时],"skill":1-5,"risk":1-5,"payback":首次变现天数,"income":[保守月收入,较好月收入],"channels":["平台1","平台2"],"desc":"一两句话说明","steps":["步骤1","步骤2","步骤3"],"tips":"关键运营建议","picks":["选品方向1","选品方向2"],"tags":["标签1","标签2"]}]';
  }

  function doImport() {
    var txt = $('#importJson').value.trim();
    var msg = $('#importMsg');
    if (!txt) { msg.textContent = '请先粘贴内容'; return; }
    var arr;
    try {
      arr = JSON.parse(txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
    } catch (e) { msg.textContent = 'JSON 解析失败：' + e.message; return; }
    if (!Array.isArray(arr)) { msg.textContent = '需要是一个数组'; return; }
    var ok = 0;
    arr.forEach(function (o) {
      if (!o || !o.name) return;
      o.id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      o.cat = o.cat || '信息差';
      o.capital = o.capital || [0, 0]; o.time = o.time || [1, 2];
      o.skill = o.skill || 2; o.risk = o.risk || 2; o.payback = o.payback || 30;
      o.income = o.income || [500, 5000]; o.channels = o.channels || [];
      o.steps = o.steps || []; o.tags = o.tags || []; o.desc = o.desc || ''; o.tips = o.tips || '';
      state.custom.push(o); ok++;
    });
    save(); renderLibrary();
    msg.textContent = '成功导入 ' + ok + ' 个方向，去点子库查看';
    if (ok) { $('#importJson').value = ''; switchView('library'); toast('已导入 ' + ok + ' 个新方向'); }
  }

  /* ---------------- 收益测算 ---------------- */
  function calc() {
    var type = $('#cType').value;
    var setup = parseFloat($('#cSetup').value) || 0;
    var fixed = parseFloat($('#cFixed').value) || 0;
    var price = parseFloat($('#cPrice').value) || 0;
    var cost = type === 'goods' ? (parseFloat($('#cCost').value) || 0) : 0;
    var traffic = parseFloat($('#cTraffic').value) || 0;
    var conv = (parseFloat($('#cConv').value) || 0) / 100;
    var refund = (parseFloat($('#cRefund').value) || 0) / 100;
    var hours = parseFloat($('#cHours').value) || 1;

    var orders = traffic * conv;
    var validOrders = orders * (1 - refund);
    var revenue = validOrders * price;
    var goodsCost = validOrders * cost;
    var gross = revenue - goodsCost;
    var net = gross - fixed;
    var profitM1 = net - setup;
    var margin = revenue ? (gross / revenue * 100) : 0;
    var paybackMonths = net > 0 ? setup / net : Infinity;
    var hourly = net / Math.max(hours * 30, 1);
    var roi = setup > 0 && net > 0 ? (net / setup * 100) : 0;

    var verdict, cls;
    if (net <= 0) { verdict = '每月净利为负，这个模型不成立。先想办法提高转化率或客单价，否则投入的钱会持续消耗。'; cls = 'bad'; }
    else if (paybackMonths <= 1) { verdict = '回本周期在 1 个月内，风险很低，值得立刻小步测试。'; cls = 'good'; }
    else if (paybackMonths <= 3) { verdict = '回本周期 ' + paybackMonths.toFixed(1) + ' 个月，属于健康区间。建议先用最小投入跑通一单，再决定是否加码。'; cls = 'good'; }
    else if (paybackMonths <= 6) { verdict = '回本需要 ' + paybackMonths.toFixed(1) + ' 个月，偏长。优先降低一次性投入，或寻找更高转化的渠道。'; cls = 'mid'; }
    else { verdict = '回本超过半年，风险偏高。建议重新评估选品/渠道，或改为按单结算的服务型模式降低前期投入。'; cls = 'bad'; }

    $('#cResult').innerHTML = '<h2>测算结果</h2>' +
      '<div class="big-num' + (net < 0 ? ' neg' : '') + '" style="color:' + (net < 0 ? '' : 'var(--ok)') + '">' + money(net) + '<span style="font-size:13px;font-weight:600;color:var(--text-3)"> / 月净利</span></div>' +
      '<div style="margin-top:14px">' +
      '<div class="res-row"><span>月订单（有效）</span><b>' + fmt(validOrders) + ' 单</b></div>' +
      '<div class="res-row"><span>月营收</span><b>' + money(revenue) + '</b></div>' +
      '<div class="res-row"><span>货品成本</span><b>' + money(goodsCost) + '</b></div>' +
      '<div class="res-row"><span>毛利 / 毛利率</span><b>' + money(gross) + ' · ' + margin.toFixed(0) + '%</b></div>' +
      '<div class="res-row"><span>固定支出</span><b>' + money(fixed) + '</b></div>' +
      '<div class="res-row"><span>首月实际（扣投入）</span><b style="color:' + (profitM1 >= 0 ? 'var(--ok)' : 'var(--danger)') + '">' + money(profitM1) + '</b></div>' +
      '<div class="res-row"><span>回本周期</span><b>' + (isFinite(paybackMonths) ? paybackMonths.toFixed(1) + ' 个月' : '无法回本') + '</b></div>' +
      '<div class="res-row"><span>月 ROI</span><b>' + (roi ? roi.toFixed(0) + '%' : '—') + '</b></div>' +
      '<div class="res-row"><span>折合时薪</span><b>' + money(hourly) + ' / 小时</b></div>' +
      '</div>' +
      '<div class="verdict ' + cls + '">' + esc(verdict) + '</div>';

    calc._current = { type: type, setup: setup, fixed: fixed, price: price, cost: cost, traffic: traffic, conv: conv, refund: refund, hours: hours, net: net, payback: paybackMonths, margin: margin, hourly: hourly, revenue: revenue };
  }

  function savePlan() {
    var c = calc._current; if (!c) return;
    var name = $('#cName').value.trim() || '未命名方案';
    state.plans.push({ name: name, t: Date.now(), setup: c.setup, revenue: c.revenue, net: c.net, payback: c.payback, margin: c.margin, hourly: c.hourly });
    save(); renderCompare(); renderStats(); toast('已保存：' + name);
  }
  function renderCompare() {
    if (!state.plans.length) { $('#cmpCard').hidden = true; return; }
    $('#cmpCard').hidden = false;
    var rows = state.plans.map(function (p, i) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + money(p.setup) + '</td><td>' + money(p.revenue) + '</td><td><b style="color:' + (p.net >= 0 ? 'var(--ok)' : 'var(--danger)') + '">' + money(p.net) + '</b></td>' +
        '<td>' + (isFinite(p.payback) ? p.payback.toFixed(1) + ' 月' : '—') + '</td><td>' + p.margin.toFixed(0) + '%</td><td>' + money(p.hourly) + '</td>' +
        '<td><button class="btn ghost sm" data-delplan="' + i + '">删除</button></td></tr>';
    }).join('');
    var best = state.plans.slice().sort(function (a, b) { return b.net - a.net; })[0];
    $('#cmpTable').innerHTML = '<thead><tr><th>方案</th><th>投入</th><th>月营收</th><th>月净利</th><th>回本</th><th>毛利率</th><th>时薪</th><th></th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="8" class="hint">当前最优：' + esc(best.name) + '（月净利 ' + money(best.net) + '，' + (isFinite(best.payback) ? best.payback.toFixed(1) + ' 个月回本' : '无法回本') + '）</td></tr></tfoot>';
  }

  /* ---------------- 导航 ---------------- */
  var TITLES = {
    sources: ['源头导航', '别从「副业列表」里挑，从「谁在为这件事付钱」倒推'],
    library: ['副业点子库', ''], ai: ['AI 挖掘扩充', '用你的条件组合出新方向，也可以让 AI 生成后导入'],
    calc: ['收益测算', '把模糊的副业变成可比较的数字'], mine: ['我的副业', '跟踪状态、笔记与真实收支'],
    data: ['数据与备份', '']
  };
  function switchView(v) {
    state.settings.view = v; save();
    $$('.view').forEach(function (el) { el.classList.toggle('active', el.id === 'view-' + v); });
    $$('#nav li').forEach(function (li) { li.classList.toggle('active', li.dataset.view === v); });
    var t = TITLES[v] || ['', ''];
    $('#viewTitle').textContent = t[0];
    $('#viewSub').textContent = v === 'library' ? (allHustles().length + ' 个真实可执行的副业方向，按你的资金与时间筛选') : t[1];
    if (v === 'library') renderLibrary();
    if (v === 'sources') renderSources();
    if (v === 'mine') renderMine();
    if (v === 'calc') calc();
    if (v === 'data') renderStats();
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 侧栏
    $('#nav').addEventListener('click', function (e) {
      var li = e.target.closest('li'); if (li) switchView(li.dataset.view);
    });
    $('#collapseBtn').addEventListener('click', function () {
      state.settings.expanded = !state.settings.expanded;
      $('#sidebar').classList.toggle('expanded', state.settings.expanded);
      save();
    });
    // 资金
    $('#capitalChip').addEventListener('click', function () {
      var v = prompt('你现在能投入多少启动资金？（元）', state.settings.capital);
      if (v === null) return;
      var n = parseFloat(v);
      if (!isNaN(n) && n >= 0) { setCapital(Math.min(n, 50000)); }
    });
    // 筛选
    function syncFilters() {
      state.settings.capital = parseInt($('#capRange').value, 10);
      state.settings.hours = parseFloat($('#timeRange').value);
      state.settings.maxSkill = parseInt($('#skillRange').value, 10);
      state.settings.maxRisk = parseInt($('#riskRange').value, 10);
      $('#capitalVal').textContent = fmt(state.settings.capital);
      $('#capLabel').textContent = fmt(state.settings.capital);
      $('#timeLabel').textContent = state.settings.hours;
      $('#skillLabel').textContent = state.settings.maxSkill;
      $('#riskLabel').textContent = state.settings.maxRisk;
      save(); renderLibrary();
    }
    ['capRange', 'timeRange', 'skillRange', 'riskRange'].forEach(function (id) {
      $('#' + id).addEventListener('input', syncFilters);
    });
    $('#catChips').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      var k = c.dataset.cat, i = state.filters.cats.indexOf(k);
      if (i >= 0) state.filters.cats.splice(i, 1); else state.filters.cats.push(k);
      c.classList.toggle('on'); save(); renderLibrary();
    });
    $('#sortSel').addEventListener('change', function () { state.filters.sort = this.value; save(); renderLibrary(); });
    $('#kwInput').addEventListener('input', function () { state.filters.kw = this.value; save(); renderLibrary(); });
    $('#resetFilter').addEventListener('click', function () {
      state.settings.capital = 1000; state.settings.hours = 3; state.settings.maxSkill = 5; state.settings.maxRisk = 5;
      state.filters = { cats: [], sort: 'match', kw: '' };
      save(); initFilterUI(); renderLibrary();
    });
    // 卡片
    document.addEventListener('click', function (e) {
      var star = e.target.closest('[data-star]');
      if (star) { e.stopPropagation(); toggleStar(star.dataset.star); return; }
      var card = e.target.closest('.hcard');
      if (card && card.dataset.id) openDrawer(card.dataset.id);
    });
    $('#dClose').addEventListener('click', closeDrawer);
    $('#mask').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    // AI
    $('#aiGenBtn').addEventListener('click', renderAi);
    $('#skillChips').addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
    $('#avoidChips').addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
    $('#copyPrompt').addEventListener('click', function () {
      var t = $('#promptText').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast('提示词已复制'); });
      else toast('请手动选中复制');
    });
    $('#doImport').addEventListener('click', doImport);
    $('#sampleImport').addEventListener('click', function () {
      $('#importJson').value = JSON.stringify([{
        name: '示例：小区旧物改造转卖', cat: '本地生活', capital: [0, 300], time: [1, 2], skill: 2, risk: 2, payback: 5,
        income: [800, 6000], channels: ['闲鱼', '小区群'], desc: '收小区免费丢弃的旧家具，简单打磨翻新后挂闲鱼卖出。',
        steps: ['在小区群发"免费上门搬走旧家具"', '用砂纸+木器漆简单翻新，重点拍对比图', '挂闲鱼定价 100-400 元，同城自提'],
        tips: '只收实木和品牌板材家具，板式家具翻新后也不值钱。', picks: ['实木小凳', '儿童桌椅', '置物架'], tags: ['零成本', '同城']
      }], null, 2);
    });
    // 测算
    ['cType', 'cSetup', 'cFixed', 'cPrice', 'cCost', 'cTraffic', 'cConv', 'cRefund', 'cHours'].forEach(function (id) {
      $('#' + id).addEventListener('input', calc);
    });
    $('#cType').addEventListener('change', function () { $('#costWrap').style.display = this.value === 'goods' ? '' : 'none'; calc(); });
    $('#cSave').addEventListener('click', savePlan);
    $('#cClear').addEventListener('click', function () {
      $('#cName').value = ''; $('#cSetup').value = 500; $('#cFixed').value = 0; $('#cPrice').value = 99;
      $('#cCost').value = 45; $('#cTraffic').value = 3000; $('#cConv').value = 2; $('#cRefund').value = 5; $('#cHours').value = 2; calc();
    });
    $('#cmpTable').addEventListener('click', function (e) {
      var b = e.target.closest('[data-delplan]'); if (!b) return;
      state.plans.splice(parseInt(b.dataset.delplan, 10), 1); save(); renderCompare(); renderStats();
    });
    // 我的
    $('#statusTabs').addEventListener('click', function (e) {
      var c = e.target.closest('[data-status]'); if (!c) return;
      mineFilter = c.dataset.status; renderMine();
    });
    // 源头导航
    var sl = $('#scoutList');
    if (sl) sl.addEventListener('change', function (e) {
      var cb = e.target.closest('[data-scout]'); if (!cb) return;
      state.scout[cb.dataset.scout] = cb.checked; save(); renderScout();
    });
    var sr = $('#scoutReset');
    if (sr) sr.addEventListener('click', function () {
      if (!confirm('重置本周侦察清单的勾选进度？')) return;
      state.scout = {}; save(); renderScout();
    });
    var st = $('#srcTabs');
    if (st) st.addEventListener('click', function (e) {
      var c = e.target.closest('[data-srcg]'); if (!c) return;
      srcGroup = c.dataset.srcg; renderSrc();
    });
    // 数据
    $('#expBtn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '副业工作台备份-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click(); toast('已导出备份');
    });
    $('#impBtn').addEventListener('click', function () { $('#impFile').click(); });
    $('#impFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { applyBackup(fr.result); };
      fr.readAsText(f);
    });
    $('#pasteImportBtn').addEventListener('click', function () { applyBackup($('#pasteBackup').value); });
    $('#wipeBtn').addEventListener('click', function () {
      if (!confirm('确定清空全部收藏、笔记、测算方案与导入的方向？此操作不可恢复。')) return;
      state = JSON.parse(JSON.stringify(DEF)); save(); location.reload();
    });
  }
  function applyBackup(txt) {
    try {
      var o = JSON.parse(txt);
      if (!o || typeof o !== 'object') throw new Error('格式不对');
      state = {
        settings: Object.assign({}, DEF.settings, o.settings || {}),
        filters: Object.assign({}, DEF.filters, o.filters || {}),
        tracked: o.tracked || {}, plans: o.plans || [], custom: o.custom || []
      };
      save(); initFilterUI(); renderCompare(); switchView(state.settings.view || 'library');
      $('#dataMsg').textContent = '已恢复备份';
      toast('备份已恢复');
    } catch (e) { $('#dataMsg').textContent = '恢复失败：' + e.message; }
  }

  /* ---------------- 源头导航 ---------------- */
  var SRC_GROUPS = [
    { k: 'all', label: '全部' },
    { k: 'demand', label: '① 需求信号' },
    { k: 'data', label: '② 数据验证' },
    { k: 'case', label: '③ 案例验证' }
  ];
  var srcGroup = 'all';
  function renderSources() { renderScout(); renderSrc(); }

  function renderScout() {
    var wrap = $('#scoutList'); if (!wrap) return;
    var tasks = window.SCOUT_TASKS || [];
    wrap.innerHTML = tasks.map(function (t) {
      var done = !!state.scout[t.id];
      return '<label class="scout-item' + (done ? ' done' : '') + '">' +
        '<input type="checkbox" data-scout="' + esc(t.id) + '"' + (done ? ' checked' : '') + ' hidden>' +
        '<span class="scout-chk">' + (done ? '✓' : '') + '</span>' +
        '<div class="sc-body">' +
        '<div class="sc-title">' + esc(t.title) + '</div>' +
        '<div class="sc-detail">' + esc(t.detail) + '</div>' +
        '</div><span class="sc-time">' + esc(t.time) + '</span></label>';
    }).join('');
    var n = tasks.filter(function (t) { return state.scout[t.id]; }).length;
    var el = $('#scoutProgress');
    if (el) el.textContent = '已完成 ' + n + ' / ' + tasks.length + ' 项' + (n === tasks.length ? '，侦察阶段完成，可以去接第一单了' : '');
  }

  function renderSrc() {
    var tabs = $('#srcTabs'); if (!tabs) return;
    tabs.innerHTML = SRC_GROUPS.map(function (g) {
      var n = g.k === 'all' ? (window.SOURCES || []).length : (window.SOURCES || []).filter(function (s) { return s.group === g.k; }).length;
      return '<button class="chip' + (srcGroup === g.k ? ' on' : '') + '" data-srcg="' + g.k + '">' + esc(g.label) + ' <b>' + n + '</b></button>';
    }).join('');
    var listEl = $('#srcList'); if (!listEl) return;
    var list = (window.SOURCES || []).filter(function (s) { return srcGroup === 'all' || s.group === srcGroup; });
    listEl.innerHTML = list.map(function (s) {
      return '<div class="src-item">' +
        '<div class="src-head"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>' +
        '<span class="src-cost' + (s.cost === 'paid' ? ' paid' : '') + '">' + (s.cost === 'paid' ? '付费' : '免费') + '</span></div>' +
        '<div class="src-line"><b>进去看什么</b><span>' + esc(s.what) + '</span></div>' +
        '<div class="src-line"><b>值得做的信号</b><span>' + esc(s.signal) + '</span></div>' +
        '<div class="src-line tip"><b>怎么用</b><span>' + esc(s.tip) + '</span></div>' +
        '</div>';
    }).join('');
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2000);
  }
  function setCapital(n) {
    state.settings.capital = n;
    $('#capRange').value = Math.min(n, 50000);
    $('#capitalVal').textContent = fmt(n);
    $('#capLabel').textContent = fmt(n);
    save(); renderLibrary();
  }
  function initFilterUI() {
    $('#capRange').value = state.settings.capital;
    $('#timeRange').value = state.settings.hours;
    $('#skillRange').value = state.settings.maxSkill;
    $('#riskRange').value = state.settings.maxRisk;
    $('#sortSel').value = state.filters.sort;
    $('#kwInput').value = state.filters.kw || '';
    $('#capitalVal').textContent = fmt(state.settings.capital);
    $('#capLabel').textContent = fmt(state.settings.capital);
    $('#timeLabel').textContent = state.settings.hours;
    $('#skillLabel').textContent = state.settings.maxSkill;
    $('#riskLabel').textContent = state.settings.maxRisk;
    $('#sidebar').classList.toggle('expanded', !!state.settings.expanded);
    renderCatChips();
  }

  /* ---------------- init ---------------- */
  function init() {
    renderCatChips(); renderAiChips(); initFilterUI(); renderLibrary(); renderCompare(); renderStats();
    if ($('#view-sources')) renderSources();
    bind();
    switchView(state.settings.view || 'library');
    $('#costWrap').style.display = $('#cType').value === 'goods' ? '' : 'none';
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
    }
    var deferred;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      var b = $('#installBtn'); b.hidden = false;
      b.onclick = function () { deferred.prompt(); deferred.userChoice.then(function () { b.hidden = true; }); };
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
