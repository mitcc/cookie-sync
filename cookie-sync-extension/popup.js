let isCookieValid = false;
let editingRuleId = null;

// 防抖渲染调度器，合并高频 Storage 变化
let renderTimer = null;
function scheduleRestoreRules() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    restoreRules();
    renderTimer = null;
  }, 50);
}

document.addEventListener('DOMContentLoaded', () => {
  restoreRules();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.cookieSyncRules) {
      scheduleRestoreRules();
    }
  });

  const showAddFormBtn = document.getElementById('showAddFormBtn');
  const testBtn = document.getElementById('testBtn');
  const addBtn = document.getElementById('addBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const syncAllBtn = document.getElementById('syncAllBtn');
  const urlInput = document.getElementById('siteUrl');
  const ruleList = document.getElementById('ruleList');

  if (showAddFormBtn) showAddFormBtn.addEventListener('click', openCreateForm);
  if (testBtn) testBtn.addEventListener('click', testAndPreviewCookie);
  if (addBtn) addBtn.addEventListener('click', saveRule);
  if (cancelBtn) cancelBtn.addEventListener('click', closeForm);
  if (syncAllBtn) syncAllBtn.addEventListener('click', syncAllRules);

  if (urlInput) {
    urlInput.addEventListener('input', resetTestState);
  }

  if (ruleList) {
    ruleList.addEventListener('click', handleListClick);
  }
});

// 打开新建表单
function openCreateForm() {
  editingRuleId = null;
  document.getElementById('formTitle').innerText = '新建同步任务';
  document.getElementById('siteUrl').value = '';
  document.getElementById('filePath').value = '';
  document.getElementById('interval').value = '15';
  document.getElementById('intervalUnit').value = 'minutes';
  document.getElementById('autoRefreshTab').checked = false;

  resetTestState();
  const formCard = document.getElementById('formCard');
  formCard.style.display = 'block';
  formCard.scrollIntoView({ behavior: 'smooth' });
}

// 关闭/收起表单
function closeForm() {
  editingRuleId = null;
  document.getElementById('siteUrl').value = '';
  document.getElementById('filePath').value = '';
  document.getElementById('interval').value = '15';
  document.getElementById('intervalUnit').value = 'minutes';
  document.getElementById('autoRefreshTab').checked = false;

  document.getElementById('formCard').style.display = 'none';
  resetTestState();
}

function resetTestState() {
  isCookieValid = false;
  const addBtn = document.getElementById('addBtn');
  const previewArea = document.getElementById('previewArea');

  if (addBtn) {
    addBtn.disabled = true;
    addBtn.style.backgroundColor = '#8e8e93';
    addBtn.style.cursor = 'not-allowed';
    addBtn.innerText = editingRuleId ? '确认修改并保存' : '第二步：确认保存';
  }
  if (previewArea) {
    previewArea.style.display = 'none';
  }
}

// 第一步：测试并预览 Cookie
function testAndPreviewCookie() {
  const urlInput = document.getElementById('siteUrl');
  if (!urlInput) return;

  let url = urlInput.value.trim();
  if (!url) {
    alert('请输入目标网站 URL！');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
    urlInput.value = url;
  }

  const previewArea = document.getElementById('previewArea');
  const previewStatus = document.getElementById('previewStatus');
  const previewText = document.getElementById('previewText');
  const addBtn = document.getElementById('addBtn');

  previewArea.style.display = 'block';
  previewStatus.style.color = '#007aff';
  previewStatus.textContent = '🔍 正在读取该网站 Cookie...';
  previewText.value = '';

  chrome.cookies.getAll({ url: url }, (cookies) => {
    if (chrome.runtime.lastError) {
      previewStatus.style.color = '#ff3b30';
      previewStatus.textContent = `❌ 检测失败: ${chrome.runtime.lastError.message}`;
      resetTestState();
      return;
    }

    if (!cookies || cookies.length === 0) {
      previewStatus.style.color = '#ff9500';
      previewStatus.textContent = '⚠️ 未检测到 Cookie！请确认已在 Chrome 中登录该网站。';
      previewText.value = '（结果为空，无法保存）';
      resetTestState();
      return;
    }

    const headerString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    if (!headerString.trim()) {
      previewStatus.style.color = '#ff9500';
      previewStatus.textContent = '⚠️ 提取到的 Cookie 内容为空！';
      resetTestState();
      return;
    }

    isCookieValid = true;
    previewStatus.style.color = '#34c759';
    previewStatus.textContent = `✅ 检测成功！捕获到 ${cookies.length} 条 Cookie:`;
    previewText.value = headerString;

    if (addBtn) {
      addBtn.disabled = false;
      addBtn.style.backgroundColor = '#34c759';
      addBtn.style.cursor = 'pointer';
      addBtn.innerText = editingRuleId ? '确认修改并保存' : '第二步：确认保存';
    }
  });
}

function convertToMinutes(value, unit) {
  if (unit === 'hours') return value * 60;
  if (unit === 'days') return value * 60 * 24;
  return value;
}

function getUnitLabel(unit) {
  if (unit === 'hours') return '小时';
  if (unit === 'days') return '天';
  return '分钟';
}

// 保存规则（区分新建同步与编辑仅改配置）
function saveRule() {
  if (!isCookieValid) {
    alert('请先完成【第一步：检测并预览 Cookie】！');
    return;
  }

  const urlInput = document.getElementById('siteUrl');
  const pathInput = document.getElementById('filePath');
  const intervalInput = document.getElementById('interval');
  const unitSelect = document.getElementById('intervalUnit');
  const autoRefreshTab = document.getElementById('autoRefreshTab').checked;

  const url = urlInput.value.trim();
  const path = pathInput.value.trim();
  const intervalValue = parseInt(intervalInput.value, 10);
  const intervalUnit = unitSelect.value;

  if (!url || !path || isNaN(intervalValue) || intervalValue < 1) {
    alert('请填写完整的路径和有效参数！');
    return;
  }

  const periodInMinutes = convertToMinutes(intervalValue, intervalUnit);

  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    let rules = result.cookieSyncRules || [];

    if (editingRuleId) {
      // ===== 编辑模式：仅修改配置，不立即同步 =====
      const targetIndex = rules.findIndex(r => r.id === editingRuleId);
      if (targetIndex !== -1) {
        const isEnabled = rules[targetIndex].enabled !== false;
        rules[targetIndex] = {
          ...rules[targetIndex],
          url: url,
          path: path,
          intervalValue: intervalValue,
          intervalUnit: intervalUnit,
          periodInMinutes: periodInMinutes,
          autoRefreshTab: autoRefreshTab,
          lastStatus: isEnabled ? (rules[targetIndex].lastStatus || '已修改，等待定时同步') : '已暂停'
        };

        // 重新设定定时器周期，不发送 sync_now 消息
        if (isEnabled) {
          chrome.alarms.create(editingRuleId, {
            delayInMinutes: periodInMinutes,
            periodInMinutes: periodInMinutes
          });
        }
      }
    } else {
      // ===== 新建模式：保存配置并立即触发一次同步 =====
      const newRule = {
        id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        url: url,
        path: path,
        intervalValue: intervalValue,
        intervalUnit: intervalUnit,
        periodInMinutes: periodInMinutes,
        autoRefreshTab: autoRefreshTab,
        enabled: true,
        lastSyncTime: 0,
        lastStatus: '等待首次同步...'
      };
      rules.push(newRule);

      chrome.alarms.create(newRule.id, {
        delayInMinutes: newRule.periodInMinutes,
        periodInMinutes: newRule.periodInMinutes
      });

      // 新建任务立即触发同步
      chrome.runtime.sendMessage({ action: 'sync_now', rule: newRule });
    }

    chrome.storage.local.set({ cookieSyncRules: rules }, () => {
      closeForm();
    });
  });
}

function handleListClick(e) {
  const target = e.target;
  if (!target || target.tagName !== 'BUTTON') return;

  const ruleId = target.getAttribute('data-id');
  if (!ruleId) return;

  if (target.classList.contains('btn-sync')) {
    manualSync(ruleId);
  } else if (target.classList.contains('btn-edit')) {
    editRule(ruleId);
  } else if (target.classList.contains('btn-delete')) {
    deleteRule(ruleId);
  } else if (target.classList.contains('btn-toggle-pause') || target.classList.contains('btn-toggle-enable')) {
    toggleRuleStatus(ruleId);
  }
}

// 切换启用/暂停
function toggleRuleStatus(ruleId) {
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    let rules = result.cookieSyncRules || [];
    const targetIndex = rules.findIndex(r => r.id === ruleId);
    if (targetIndex === -1) return;

    const rule = rules[targetIndex];
    const nextEnabled = !(rule.enabled !== false);
    rule.enabled = nextEnabled;

    if (nextEnabled) {
      const minutes = Number(rule.periodInMinutes || rule.interval || 15);
      const elapsed = Date.now() - (rule.lastSyncTime || 0);
      const periodMs = minutes * 60 * 1000;

      if (elapsed >= periodMs || !rule.lastSyncTime) {
        chrome.alarms.create(rule.id, { delayInMinutes: minutes, periodInMinutes: minutes });
        chrome.runtime.sendMessage({ action: 'sync_now', rule: rule });
      } else {
        const remainingMinutes = Math.max(1, Math.ceil((periodMs - elapsed) / 60000));
        chrome.alarms.create(rule.id, { delayInMinutes: remainingMinutes, periodInMinutes: minutes });
        rule.lastStatus = `已启用 (${remainingMinutes}分钟后同步)`;
      }
    } else {
      chrome.alarms.clear(rule.id);
      rule.lastStatus = '已暂停';
    }

    chrome.storage.local.set({ cookieSyncRules: rules });
  });
}

// 点击编辑按钮展开表单并回显
function editRule(ruleId) {
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    const rules = result.cookieSyncRules || [];
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    editingRuleId = rule.id;
    document.getElementById('formTitle').innerText = '编辑同步任务';

    document.getElementById('siteUrl').value = rule.url;
    document.getElementById('filePath').value = rule.path;
    document.getElementById('interval').value = rule.intervalValue || rule.interval || 15;
    document.getElementById('intervalUnit').value = rule.intervalUnit || 'minutes';
    document.getElementById('autoRefreshTab').checked = !!rule.autoRefreshTab;

    const formCard = document.getElementById('formCard');
    formCard.style.display = 'block';
    formCard.scrollIntoView({ behavior: 'smooth' });

    testAndPreviewCookie();
  });
}

// 渲染任务列表
function restoreRules() {
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    const rules = result.cookieSyncRules || [];
    const listDiv = document.getElementById('ruleList');
    if (!listDiv) return;

    if (rules.length === 0) {
      listDiv.innerHTML = '<p style="color:#999;font-size:11px;text-align:center;padding:12px 0;">暂无同步任务，点击右上角「+ 新建」添加</p>';
      return;
    }

    const html = rules.map((rule) => {
      const isEnabled = rule.enabled !== false;
      let statusColor = '#888';
      if (rule.lastStatus) {
        if (rule.lastStatus.includes('成功')) statusColor = '#28a745';
        else if (rule.lastStatus.includes('正在')) statusColor = '#007aff';
        else if (rule.lastStatus.includes('暂停')) statusColor = '#ff9500';
        else if (rule.lastStatus.includes('错误') || rule.lastStatus.includes('失败') || rule.lastStatus.includes('报错')) statusColor = '#ff3b30';
      }

      let intervalDisplayText = '';
      if (rule.intervalValue && rule.intervalUnit) {
        intervalDisplayText = `${rule.intervalValue} ${getUnitLabel(rule.intervalUnit)}`;
      } else {
        intervalDisplayText = `${rule.interval || rule.periodInMinutes || 15} 分钟`;
      }

      const badgeHtml = isEnabled
        ? '<span class="badge badge-enabled">● 运行中</span>'
        : '<span class="badge badge-paused">⏸ 已暂停</span>';

      const refreshBadgeHtml = rule.autoRefreshTab
        ? '<span class="badge badge-mode" title="同步前在后台静默刷新网页">🔄 静默刷新</span>'
        : '';

      const toggleBtnHtml = isEnabled
        ? `<button class="btn-toggle-pause" data-id="${rule.id}">暂停</button>`
        : `<button class="btn-toggle-enable" data-id="${rule.id}">启用</button>`;

      const escapedUrl = escapeHtml(rule.url);
      const escapedPath = escapeHtml(rule.path);

      return `
        <div class="rule-item ${isEnabled ? '' : 'paused'}">
          <div>${badgeHtml}${refreshBadgeHtml}</div>
          <p title="${escapedUrl}"><strong>网址:</strong> ${escapedUrl}</p>
          <p title="${escapedPath}"><strong>路径:</strong> ${escapedPath}</p>
          <p><strong>周期:</strong> 每 ${intervalDisplayText}</p>
          <p title="${escapeHtml(rule.lastStatus || '')}"><strong>状态:</strong> <span style="color:${statusColor}; font-weight:500;">${escapeHtml(rule.lastStatus || (isEnabled ? '等待首次同步...' : '已暂停'))}</span></p>
          <div class="btn-group-item">
            <button class="btn-sync" data-id="${rule.id}">同步</button>
            ${toggleBtnHtml}
            <button class="btn-edit" data-id="${rule.id}">编辑</button>
            <button class="btn-delete" data-id="${rule.id}">删除</button>
          </div>
        </div>
      `;
    }).join('');

    listDiv.innerHTML = html;
  });
}

function manualSync(ruleId) {
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    const rules = result.cookieSyncRules || [];
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      chrome.runtime.sendMessage({ action: 'sync_now', rule: rule });
    }
  });
}

function syncAllRules() {
  chrome.runtime.sendMessage({ action: 'sync_all' });
}

// 删除任务（二次弹窗确认）
function deleteRule(ruleId) {
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    let rules = result.cookieSyncRules || [];
    const deletedRule = rules.find(r => r.id === ruleId);

    if (deletedRule) {
      const isConfirmed = window.confirm(`确定要删除该同步任务吗？\n\n网址: ${deletedRule.url}\n路径: ${deletedRule.path}`);
      if (!isConfirmed) return;

      chrome.alarms.clear(deletedRule.id);
      rules = rules.filter(r => r.id !== ruleId);
      chrome.storage.local.set({ cookieSyncRules: rules }, () => {
        if (editingRuleId === ruleId) {
          closeForm();
        }
      });
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
