// 监听扩展安装
chrome.runtime.onInstalled.addListener(function() {
  console.log('潜入者阅读器安装/更新');
  
  // 初始化存储
  chrome.storage.local.set({
    isReaderActive: false,
    disguiseMode: 'auto',
    fontFamily: 'auto',
    opacity: 0.95,
    novelContent: '',
    novelTitle: '',
    novelChapters: [],
    currentChapter: 0,
    lastReadPosition: 0
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('初始化存储失败:', chrome.runtime.lastError);
    } else {
      console.log('初始化存储完成');
    }
  });
});

// 处理来自内容脚本或popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('后台接收到消息:', request.action, sender.tab ? '来自内容脚本' : '来自扩展页面');
  
  // 记录活动
  if (request.action === 'logActivity') {
    console.log('潜入者阅读器活动:', request.details);
    sendResponse({success: true});
  }
  
  // 中继消息给当前活动标签页
  if (request.action === 'relayToActiveTab') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, request.message, function(response) {
          if (chrome.runtime.lastError) {
            console.error('发送消息到内容脚本失败:', chrome.runtime.lastError);
            sendResponse({success: false, error: chrome.runtime.lastError.message});
          } else {
            console.log('消息已转发到内容脚本:', request.message.action);
            sendResponse({success: true, response: response});
          }
        });
      } else {
        console.error('没有找到活动标签页');
        sendResponse({success: false, error: '没有找到活动标签页'});
      }
    });
    return true; // 保持消息通道开放以进行异步响应
  }
  
  // 处理导入请求
  if (request.action === 'importNovel') {
    console.log('处理导入小说请求');
    // 保存小说数据到存储
    chrome.storage.local.set({
      novelContent: request.content,
      novelTitle: request.title,
      novelChapters: request.chapters,
      currentChapter: 0,
      lastReadPosition: 0
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('保存小说数据失败:', chrome.runtime.lastError);
        sendResponse({success: false, error: chrome.runtime.lastError.message});
      } else {
        console.log('小说数据已保存');
        
        // 通知当前活动标签页更新内容
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'updateContent'}, function(response) {
              if (chrome.runtime.lastError) {
                console.error('通知内容脚本更新失败:', chrome.runtime.lastError);
              } else {
                console.log('内容脚本已通知更新');
              }
            });
          }
        });
        
        sendResponse({success: true});
      }
    });
    return true; // 保持消息通道开放以进行异步响应
  }

  return false; // 对于同步处理的消息，返回false
}); 