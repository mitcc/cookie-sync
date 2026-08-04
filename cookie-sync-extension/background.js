// 格式化当前日期时间为 "YYYY-MM-DD HH:mm:ss" 24小时制格式
function formatDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 1. 浏览器启动或插件安装/更新时初始化
chrome.runtime.onInstalled.addListener(initAndCheckTasks);
chrome.runtime.onStartup.addListener(initAndCheckTasks);

function initAndCheckTasks() {
  console.log('🚀 正在初始化任务并检查到期同步...');
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    const rules = result.cookieSyncRules || [];
    const now = Date.now();

    rules.forEach(rule => {
      if (rule.enabled === false) return;

      const periodMinutes = Number(rule.periodInMinutes || rule.interval || 15);
      const periodMs = periodMinutes * 60 * 1000;
      const lastSync = rule.lastSyncTime || 0;
      const elapsed = now - lastSync;

      if (elapsed >= periodMs || lastSync === 0) {
        console.log(`⏰ 任务 [${rule.url}] 已到期，立即执行同步...`);
        exportCookieForSite(rule);
        chrome.alarms.create(rule.id, {
          delayInMinutes: periodMinutes,
          periodInMinutes: periodMinutes
        });
      } else {
        const remainingMinutes = Math.max(1, Math.ceil((periodMs - elapsed) / 60000));
        console.log(`⏳ 任务 [${rule.url}] 将在 ${remainingMinutes} 分钟后触发`);
        chrome.alarms.create(rule.id, {
          delayInMinutes: remainingMinutes,
          periodInMinutes: periodMinutes
        });
      }
    });
  });
}

// 2. 监听定时器触发
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`⏰ 定时器触发: ${alarm.name}`);
  chrome.storage.local.get(['cookieSyncRules'], (result) => {
    const rules = result.cookieSyncRules || [];
    const matchedRule = rules.find(r => r.id === alarm.name);
    if (matchedRule) {
      if (matchedRule.enabled === false) {
        console.log(`⏸️ 任务 [${matchedRule.id}] 已暂停，跳过执行`);
        return;
      }
      exportCookieForSite(matchedRule);
    }
  });
});

// 3. 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sync_now' && message.rule) {
    console.log('👆 收到手动同步请求:', message.rule.url);
    exportCookieForSite(message.rule);
    sendResponse({ status: 'started' });
  } else if (message.action === 'sync_all') {
    console.log('⚡ 收到批量同步请求');
    chrome.storage.local.get(['cookieSyncRules'], (result) => {
      const rules = result.cookieSyncRules || [];
      const activeRules = rules.filter(r => r.enabled !== false);
      activeRules.forEach(rule => exportCookieForSite(rule));
      sendResponse({ status: 'started_all', count: activeRules.length });
    });
  }
  return true;
});

/**
 * 提取主顶级域名（防止子域 Cookie 遗漏）
 */
function getTopDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return '.' + parts.slice(-2).join('.');
    }
    return hostname;
  } catch (e) {
    return null;
  }
}

/**
 * 方式 A：直接全量提取 Cookie（轻量、极速、无任何标签页弹出）
 */
async function getCookiesDirectly(targetUrl) {
  try {
    const urlCookies = await chrome.cookies.getAll({ url: targetUrl });
    const domain = getTopDomain(targetUrl);
    let domainCookies = [];
    if (domain) {
      domainCookies = await chrome.cookies.getAll({ domain: domain });
    }

    const cookieMap = new Map();
    [...domainCookies, ...urlCookies].forEach(c => {
      cookieMap.set(c.name, c.value);
    });

    const headerString = Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    return { success: true, count: cookieMap.size, headerString };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 方式 B：后台静默打开未激活标签页 -> 渲染并运行网页 JS -> 等待换票 -> 提取 Cookie -> 关闭标签页
 */
function refreshAndGetLatestCookies(targetUrl) {
  return new Promise((resolve) => {
    let createdTabId = null;
    let isResolved = false;

    const finish = async () => {
      if (isResolved) return;
      isResolved = true;

      // 1. 关闭临时打开的后台标签页
      if (createdTabId) {
        chrome.tabs.remove(createdTabId).catch(() => {});
      }

      // 2. 提取最新全量 Cookie
      const result = await getCookiesDirectly(targetUrl);
      resolve(result);
    };

    // 8 秒超时熔断保护
    const timeoutTimer = setTimeout(() => {
      console.warn(`⚠️ [${targetUrl}] 页面加载超时，执行兜底提取`);
      finish();
    }, 8000);

    // 打开静默、未激活的后台标签页 (active: false 不抢占用户窗口焦点)
    chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        clearTimeout(timeoutTimer);
        finish();
        return;
      }
      createdTabId = tab.id;

      // 监听标签页状态，当完全加载完成时等待 2.5 秒以确保换票 API 运行完毕
      const listener = (tabId, changeInfo) => {
        if (tabId === createdTabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            clearTimeout(timeoutTimer);
            finish();
          }, 2500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * 导出 Cookie 并发送给本地 Native 脚本
 */
async function exportCookieForSite(rule) {
  if (!rule || !rule.url) return;

  let targetUrl = rule.url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  let result;
  if (rule.autoRefreshTab) {
    // 开启了静默刷新：打开后台 tab 唤醒 JS 换票后提取
    console.log(`[1/3] [${rule.id}] 执行模式: 后台静默刷新 -> ${targetUrl}`);
    updateRuleStatus(rule.id, '正在静默刷新页面...');
    result = await refreshAndGetLatestCookies(targetUrl);
  } else {
    // 默认：直接快速读取 Cookie
    console.log(`[1/3] [${rule.id}] 执行模式: 直接提取 -> ${targetUrl}`);
    updateRuleStatus(rule.id, '正在获取 Cookie...');
    result = await getCookiesDirectly(targetUrl);
  }

  if (!result.success && !result.headerString) {
    console.error(`❌ [${rule.id}] Cookie 提取失败:`, result.error);
    updateRuleStatus(rule.id, `错误: ${result.error || '提取失败'}`);
    return;
  }

  console.log(`[2/3] [${rule.id}] 成功获取 ${result.count} 条 Cookie，开始写入文件: ${rule.path}`);
  updateRuleStatus(rule.id, '正在写入文件...');

  // 发送给本地 Python 脚本落盘
  chrome.runtime.sendNativeMessage(
    'com.cookie.sync',
    {
      path: rule.path,
      content: result.headerString
    },
    (response) => {
      if (chrome.runtime.lastError) {
        const nativeErr = chrome.runtime.lastError.message;
        console.error(`❌ [${rule.id}] Native 通信失败:`, nativeErr);
        updateRuleStatus(rule.id, `错误: ${nativeErr}`);
        return;
      }

      if (response && response.status === 'success') {
        const timeStr = formatDateTime();
        const nowTs = Date.now();
        console.log(`✅ [3/3] [${rule.id}] 成功同步至: ${response.path}`);
        updateRuleStatus(rule.id, `成功 (${timeStr})`, nowTs);
      } else {
        const scriptErr = response?.message || '未知错误';
        console.error(`❌ [${rule.id}] 本地脚本报错:`, scriptErr);
        updateRuleStatus(rule.id, `脚本报错: ${scriptErr}`);
      }
    }
  );
}

// 异步串行更新队列，防止多任务并发写入 Storage 时状态丢失
let updateQueue = Promise.resolve();
function updateRuleStatus(ruleId, statusText, syncTimestamp = null) {
  updateQueue = updateQueue.then(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cookieSyncRules'], (result) => {
        let rules = result.cookieSyncRules || [];
        const idx = rules.findIndex(r => r.id === ruleId);
        if (idx !== -1) {
          rules[idx].lastStatus = statusText;
          if (syncTimestamp) {
            rules[idx].lastSyncTime = syncTimestamp;
          }
          chrome.storage.local.set({ cookieSyncRules: rules }, () => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  });
}
