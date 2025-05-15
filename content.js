// 阅读器状态和设置
let readerSettings = {
  isActive: false,
  disguiseMode: 'auto', // 可选：auto, code, excel, document
  fontFamily: 'auto',
  opacity: 0.95
};

// 页面样式分析结果
let pageStyleAnalysis = {
  fontFamily: '',
  fontSize: '',
  color: '',
  backgroundColor: '',
  lineHeight: ''
};

// 阅读器元素及状态
let reader = null;
let readerContent = null;
let readerHeader = null;
let readerControls = null;
let isDragging = false;
let novel = {
  title: '',
  content: '',
  chapters: [],
  currentChapter: 0,
  position: 0
};

// 初始化
function init() {
  console.log('内容脚本初始化');
  // 从存储中加载设置
  chrome.storage.local.get(
    ['isReaderActive', 'disguiseMode', 'fontFamily', 'opacity', 
     'novelContent', 'novelTitle', 'novelChapters', 'currentChapter', 'lastReadPosition'],
    function(result) {
      // 检查是否有错误
      if (chrome.runtime.lastError) {
        console.error('加载设置失败:', chrome.runtime.lastError);
        return;
      }

      // 加载阅读器设置
      if (result.disguiseMode) readerSettings.disguiseMode = result.disguiseMode;
      if (result.fontFamily) readerSettings.fontFamily = result.fontFamily;
      if (result.opacity) readerSettings.opacity = result.opacity;
      
      // 加载小说内容
      if (result.novelContent) {
        novel.content = result.novelContent;
        novel.title = result.novelTitle || '未命名小说';
        novel.chapters = result.novelChapters || [];
        novel.currentChapter = result.currentChapter || 0;
        novel.position = result.lastReadPosition || 0;
        console.log('成功加载小说内容:', novel.title, '章节数:', novel.chapters.length);
      } else {
        console.log('没有找到小说内容');
      }
      
      // 如果阅读器应该是激活状态，则创建阅读器
      if (result.isReaderActive) {
        console.log('阅读器处于激活状态，正在创建阅读器');
        readerSettings.isActive = true;
        createReader();
      } else {
        console.log('阅读器处于非激活状态');
      }
    }
  );

  // 添加键盘快捷键监听
  addKeyboardShortcuts();

  // 监听消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('接收到消息:', request.action);
    
    if (request.action === 'showReader') {
      console.log('显示阅读器');
      createReader();
      sendResponse({success: true});
    } else if (request.action === 'hideReader') {
      console.log('隐藏阅读器');
      removeReader();
      sendResponse({success: true});
    } else if (request.action === 'updateContent') {
      console.log('更新内容');
      updateReaderContent();
      sendResponse({success: true});
    }
    
    // 注意：这里不要使用 return true，因为我们已经使用sendResponse了
  });
  
  // 监听存储变化
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace !== 'local') return;
    
    console.log('存储变化:', Object.keys(changes).join(', '));
    
    let needsUpdate = false;
    
    if (changes.disguiseMode) {
      console.log('伪装模式变更:', changes.disguiseMode.oldValue, '->', changes.disguiseMode.newValue);
      readerSettings.disguiseMode = changes.disguiseMode.newValue;
      needsUpdate = true;
    }
    
    if (changes.fontFamily) {
      readerSettings.fontFamily = changes.fontFamily.newValue;
      needsUpdate = true;
    }
    
    if (changes.opacity) {
      readerSettings.opacity = changes.opacity.newValue;
      needsUpdate = true;
    }
    
    if (needsUpdate && reader) {
      console.log('应用样式变化');
      applyStyles(); // 这会触发updateReaderContent
    } else if (changes.novelContent) {
      console.log('小说内容变化');
      novel.content = changes.novelContent.newValue;
      if (changes.novelChapters) {
        novel.chapters = changes.novelChapters.newValue;
      }
      if (reader) {
        updateReaderContent();
      }
    } else if (changes.currentChapter) {
      novel.currentChapter = changes.currentChapter.newValue;
      if (reader) {
        updateReaderContent();
      }
    } else if (changes.readerFontSize && reader) {
      // 更新字体大小
      readerContent.style.fontSize = changes.readerFontSize.newValue;
    }
  });
}

// 添加键盘快捷键
function addKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // 空格键按下时隐藏阅读器
    if (e.key === ' ' && reader) {
      console.log('检测到空格键按下，隐藏阅读器');
      hideReaderTemporarily();
      // 阻止默认行为（页面滚动）
      e.preventDefault();
    }
    
    // 单击Ctrl关闭阅读器
    if (e.key === 'Control' && reader) {
      console.log('检测到Ctrl键按下，关闭阅读器');
      removeReader();
    }
  });
  
  document.addEventListener('keyup', function(e) {
    // 空格键松开时显示阅读器（如果之前是临时隐藏的）
    if (e.key === ' ' && reader && reader.classList.contains('temporarily-hidden')) {
      console.log('检测到空格键释放，恢复阅读器');
      showReaderAfterHiding();
    }
  });
}

// 临时隐藏阅读器
function hideReaderTemporarily() {
  if (!reader) return;
  
  // 标记为临时隐藏状态
  reader.classList.add('temporarily-hidden');
  
  // 保存当前透明度并设为0（完全透明）
  reader.dataset.originalOpacity = reader.style.opacity;
  reader.style.opacity = '0';
  
  // 禁用指针事件，使阅读器不接收鼠标交互
  reader.style.pointerEvents = 'none';
}

// 恢复隐藏的阅读器
function showReaderAfterHiding() {
  if (!reader) return;
  
  // 检查是否处于临时隐藏状态
  if (!reader.classList.contains('temporarily-hidden')) return;
  
  // 移除临时隐藏标记
  reader.classList.remove('temporarily-hidden');
  
  // 恢复原来的透明度
  if (reader.dataset.originalOpacity) {
    reader.style.opacity = reader.dataset.originalOpacity;
  } else {
    reader.style.opacity = readerSettings.opacity.toString();
  }
  
  // 重新启用指针事件
  reader.style.pointerEvents = 'auto';
}

// 分析页面样式
function analyzePageStyle() {
  console.log('分析页面样式');
  // 获取页面上最常用的文本元素
  const textElements = document.querySelectorAll('p, div, span, td, li');
  const colorCounts = {};
  const fontFamilyCounts = {};
  const backgroundColorCounts = {};
  const fontSizeCounts = {};
  const lineHeightCounts = {};
  
  textElements.forEach(el => {
    const style = window.getComputedStyle(el);
    
    // 只考虑非空的文本元素
    if (el.textContent.trim().length < 10) return;
    
    // 计数颜色
    const color = style.color;
    colorCounts[color] = (colorCounts[color] || 0) + 1;
    
    // 计数字体
    const fontFamily = style.fontFamily;
    fontFamilyCounts[fontFamily] = (fontFamilyCounts[fontFamily] || 0) + 1;
    
    // 计数背景色
    const backgroundColor = style.backgroundColor;
    // 只考虑非透明背景
    if (backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      backgroundColorCounts[backgroundColor] = (backgroundColorCounts[backgroundColor] || 0) + 1;
    }
    
    // 计数字体大小
    const fontSize = style.fontSize;
    fontSizeCounts[fontSize] = (fontSizeCounts[fontSize] || 0) + 1;
    
    // 计数行高
    const lineHeight = style.lineHeight;
    if (lineHeight !== 'normal' && lineHeight !== 'auto') {
      lineHeightCounts[lineHeight] = (lineHeightCounts[lineHeight] || 0) + 1;
    }
  });
  
  // 选择最常见的样式
  pageStyleAnalysis.color = getMaxKey(colorCounts) || '#333';
  pageStyleAnalysis.fontFamily = getMaxKey(fontFamilyCounts) || 'sans-serif';
  pageStyleAnalysis.backgroundColor = getMaxKey(backgroundColorCounts) || '#fff';
  pageStyleAnalysis.fontSize = getMaxKey(fontSizeCounts) || '14px';
  pageStyleAnalysis.lineHeight = getMaxKey(lineHeightCounts) || '1.5';
  
  console.log('页面样式分析结果:', pageStyleAnalysis);
}

// 辅助函数：获取对象中值最大的键
function getMaxKey(obj) {
  let maxKey = null;
  let maxValue = 0;
  
  for (const [key, value] of Object.entries(obj)) {
    if (value > maxValue) {
      maxValue = value;
      maxKey = key;
    }
  }
  
  return maxKey;
}

// 创建阅读器
function createReader() {
  // 如果已经存在，则不重复创建
  if (reader) {
    console.log('阅读器已存在，不重复创建');
    return;
  }
  
  console.log('创建阅读器');
  
  // 分析页面样式
  analyzePageStyle();
  
  // 创建阅读器容器
  reader = document.createElement('div');
  reader.id = 'infiltra-reader';
  reader.style.position = 'fixed';
  
  // 获取上次保存的位置，如果没有则使用默认位置
  chrome.storage.local.get(['readerPosition', 'readerSize'], function(result) {
    // 设置位置
    if (result.readerPosition) {
      // 如果有保存的位置，使用保存的位置
      if (result.readerPosition.left !== undefined) {
        reader.style.left = result.readerPosition.left;
        reader.style.right = 'auto'; // 清除right属性
      } else if (result.readerPosition.right !== undefined) {
        reader.style.right = result.readerPosition.right;
        reader.style.left = 'auto'; // 清除left属性
      } else {
        // 默认右侧
        reader.style.right = '20px';
        reader.style.left = 'auto';
      }
      
      if (result.readerPosition.top !== undefined) {
        reader.style.top = result.readerPosition.top;
        reader.style.bottom = 'auto'; // 清除bottom属性
      } else if (result.readerPosition.bottom !== undefined) {
        reader.style.bottom = result.readerPosition.bottom;
        reader.style.top = 'auto'; // 清除top属性
      } else {
        // 默认顶部
        reader.style.top = '100px';
        reader.style.bottom = 'auto';
      }
    } else {
      // 默认位置：左侧中部，更容易看到
      reader.style.left = '20px';
      reader.style.top = '50%';
      reader.style.transform = 'translateY(-50%)';
      reader.style.right = 'auto';
      reader.style.bottom = 'auto';
    }
    
    // 设置尺寸
    if (result.readerSize) {
      reader.style.width = result.readerSize.width || '350px';
      reader.style.height = result.readerSize.height || '500px';
    } else {
      // 默认尺寸，稍微大一些以显示更多内容
      reader.style.width = '350px';
      reader.style.height = '500px';
    }
  });
  
  reader.style.zIndex = '9999';
  reader.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
  reader.style.borderRadius = '5px';
  reader.style.overflow = 'hidden';
  reader.style.transition = 'opacity 0.2s ease';
  reader.style.fontFamily = 'sans-serif';
  reader.style.fontSize = '14px';
  
  // 创建阅读器头部
  readerHeader = document.createElement('div');
  readerHeader.id = 'infiltra-reader-header';
  readerHeader.style.padding = '8px 10px';
  readerHeader.style.cursor = 'move';
  readerHeader.style.display = 'flex';
  readerHeader.style.justifyContent = 'space-between';
  readerHeader.style.alignItems = 'center';
  readerHeader.style.userSelect = 'none';
  
  // 标题
  const title = document.createElement('div');
  title.textContent = novel.title || '潜入者阅读器';
  title.style.fontWeight = 'bold';
  title.style.whiteSpace = 'nowrap';
  title.style.overflow = 'hidden';
  title.style.textOverflow = 'ellipsis';
  title.style.flexGrow = '1';
  
  // 控制按钮容器
  readerControls = document.createElement('div');
  readerControls.style.display = 'flex';
  readerControls.style.gap = '5px';
  
  // 添加控制按钮
  const buttons = [
    { text: '上一章', action: prevChapter },
    { text: '下一章', action: nextChapter },
    { text: '调整位置', action: togglePositionMenu, id: 'position-btn' },
    { text: '×', action: removeReader }
  ];
  
  buttons.forEach(btn => {
    const button = document.createElement('div');
    button.textContent = btn.text;
    button.style.cursor = 'pointer';
    button.style.padding = '2px 5px';
    button.style.fontSize = '12px';
    button.style.borderRadius = '3px';
    if (btn.id) {
      button.id = btn.id;
    }
    
    // 悬停效果
    button.addEventListener('mouseover', function() {
      this.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    button.addEventListener('mouseout', function() {
      this.style.backgroundColor = 'transparent';
    });
    
    button.addEventListener('click', btn.action);
    readerControls.appendChild(button);
  });
  
  readerHeader.appendChild(title);
  readerHeader.appendChild(readerControls);
  
  // 创建阅读器内容区
  readerContent = document.createElement('div');
  readerContent.id = 'infiltra-reader-content';
  readerContent.style.height = 'calc(100% - 36px)';
  readerContent.style.overflowY = 'auto';
  readerContent.style.padding = '10px 15px';
  readerContent.style.boxSizing = 'border-box';
  readerContent.style.lineHeight = '1.6';
  readerContent.style.textAlign = 'justify';
  readerContent.style.overflowWrap = 'break-word';
  readerContent.style.wordWrap = 'break-word';
  
  // 创建位置控制面板
  const positionMenu = document.createElement('div');
  positionMenu.id = 'infiltra-position-menu';
  positionMenu.style.position = 'absolute';
  positionMenu.style.top = '36px';
  positionMenu.style.right = '10px';
  positionMenu.style.backgroundColor = '#fff';
  positionMenu.style.border = '1px solid #ddd';
  positionMenu.style.borderRadius = '4px';
  positionMenu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  positionMenu.style.padding = '8px';
  positionMenu.style.zIndex = '10000';
  positionMenu.style.display = 'none';
  
  // 创建位置预设按钮
  const positions = [
    { text: '左上', left: '20px', top: '20px' },
    { text: '右上', right: '20px', top: '20px' },
    { text: '左下', left: '20px', bottom: '20px' },
    { text: '右下', right: '20px', bottom: '20px' },
    { text: '居中', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  ];
  
  // 添加位置控制按钮
  positions.forEach(pos => {
    const posButton = document.createElement('div');
    posButton.textContent = pos.text;
    posButton.style.padding = '5px 10px';
    posButton.style.margin = '3px 0';
    posButton.style.cursor = 'pointer';
    posButton.style.borderRadius = '3px';
    posButton.style.textAlign = 'center';
    
    // 悬停效果
    posButton.addEventListener('mouseover', function() {
      this.style.backgroundColor = '#f0f0f0';
    });
    posButton.addEventListener('mouseout', function() {
      this.style.backgroundColor = 'transparent';
    });
    
    // 点击设置位置
    posButton.addEventListener('click', function() {
      // 重置transform属性
      reader.style.transform = '';
      
      // 重置所有位置属性
      reader.style.left = 'auto';
      reader.style.right = 'auto';
      reader.style.top = 'auto';
      reader.style.bottom = 'auto';
      
      // 设置新位置
      if (pos.left) reader.style.left = pos.left;
      if (pos.right) reader.style.right = pos.right;
      if (pos.top) reader.style.top = pos.top;
      if (pos.bottom) reader.style.bottom = pos.bottom;
      if (pos.transform) reader.style.transform = pos.transform;
      
      // 保存位置到存储
      saveReaderPosition();
      
      // 隐藏菜单
      positionMenu.style.display = 'none';
    });
    
    positionMenu.appendChild(posButton);
  });
  
  // 添加字体大小控制
  const fontSizeControl = document.createElement('div');
  fontSizeControl.style.marginTop = '10px';
  fontSizeControl.style.borderTop = '1px solid #eee';
  fontSizeControl.style.paddingTop = '8px';
  
  const fontSizeLabel = document.createElement('div');
  fontSizeLabel.textContent = '字体大小:';
  fontSizeLabel.style.marginBottom = '5px';
  
  const fontSizeButtons = document.createElement('div');
  fontSizeButtons.style.display = 'flex';
  fontSizeButtons.style.justifyContent = 'space-between';
  
  const fontSizes = [
    { text: 'S', size: '12px' },
    { text: 'M', size: '14px' },
    { text: 'L', size: '16px' },
    { text: 'XL', size: '18px' }
  ];
  
  fontSizes.forEach(font => {
    const fontButton = document.createElement('div');
    fontButton.textContent = font.text;
    fontButton.style.padding = '3px 8px';
    fontButton.style.cursor = 'pointer';
    fontButton.style.borderRadius = '3px';
    fontButton.style.backgroundColor = '#f0f0f0';
    
    // 点击设置字体大小
    fontButton.addEventListener('click', function() {
      readerContent.style.fontSize = font.size;
      // 保存字体大小到存储
      chrome.storage.local.set({ readerFontSize: font.size });
      
      // 隐藏菜单
      positionMenu.style.display = 'none';
    });
    
    fontSizeButtons.appendChild(fontButton);
  });
  
  fontSizeControl.appendChild(fontSizeLabel);
  fontSizeControl.appendChild(fontSizeButtons);
  positionMenu.appendChild(fontSizeControl);
  
  // 添加快捷键提示
  const shortcutSection = document.createElement('div');
  shortcutSection.style.marginTop = '10px';
  shortcutSection.style.borderTop = '1px solid #eee';
  shortcutSection.style.paddingTop = '8px';
  
  const shortcutTitle = document.createElement('div');
  shortcutTitle.textContent = '快捷键:';
  shortcutTitle.style.marginBottom = '5px';
  
  const shortcutList = document.createElement('div');
  shortcutList.style.fontSize = '11px';
  shortcutList.style.color = '#666';
  shortcutList.innerHTML = 
    '按住 <b>空格</b> - 临时隐藏阅读器<br>' +
    '按下 <b>Ctrl</b> - 关闭阅读器';
  
  shortcutSection.appendChild(shortcutTitle);
  shortcutSection.appendChild(shortcutList);
  positionMenu.appendChild(shortcutSection);
  
  // 组装阅读器
  reader.appendChild(readerHeader);
  reader.appendChild(readerContent);
  reader.appendChild(positionMenu);
  
  // 添加到页面
  document.body.appendChild(reader);
  
  // 应用样式
  applyStyles();
  
  // 更新内容
  updateReaderContent();
  
  // 添加拖拽功能
  addDragSupport();
  
  // 添加缩放功能
  addResizeSupport();
  
  // 加载保存的字体大小
  chrome.storage.local.get('readerFontSize', function(result) {
    if (result.readerFontSize) {
      readerContent.style.fontSize = result.readerFontSize;
    }
  });
  
  // 更新阅读器状态
  readerSettings.isActive = true;
  
  // 显示快捷键提示（短暂显示后隐藏）
  showKeyboardShortcutToast();
  
  console.log('阅读器创建完成');
}

// 显示快捷键提示Toast
function showKeyboardShortcutToast() {
  // 创建一个临时的toast提示
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '30px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  toast.style.color = '#fff';
  toast.style.padding = '10px 15px';
  toast.style.borderRadius = '5px';
  toast.style.zIndex = '10001';
  toast.style.fontSize = '13px';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.3s ease';
  
  toast.innerHTML = '快捷键: <b>按住空格</b>隐藏阅读器 | <b>单击Ctrl</b>关闭阅读器';
  
  document.body.appendChild(toast);
  
  // 淡入显示
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 100);
  
  // 3秒后淡出并移除
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// 应用样式，根据当前页面和设置
function applyStyles() {
  if (!reader) return;
  
  // 设置透明度
  reader.style.opacity = readerSettings.opacity;
  
  // 清除可能的样式类
  reader.classList.remove('code-style', 'excel-style', 'document-style');
  
  // 根据伪装模式应用不同的样式
  switch (readerSettings.disguiseMode) {
    case 'auto':
      // 自动模式：基于页面分析
      applyAutoStyles();
      break;
    case 'code':
      // 代码编辑器风格
      reader.classList.add('code-style');
      applyCodeStyles();
      break;
    case 'excel':
      // 电子表格风格
      reader.classList.add('excel-style');
      applyExcelStyles();
      break;
    case 'document':
      // 文档风格
      reader.classList.add('document-style');
      applyDocumentStyles();
      break;
  }
  
  // 重新渲染内容以匹配新的样式
  updateReaderContent();
}

// 自动模式样式
function applyAutoStyles() {
  // 使用分析的页面样式
  const headerBgColor = adjustColor(pageStyleAnalysis.backgroundColor, -15); // 稍微暗一点
  
  readerHeader.style.backgroundColor = headerBgColor;
  readerHeader.style.color = pageStyleAnalysis.color;
  readerHeader.style.borderBottom = `1px solid ${adjustColor(headerBgColor, -10)}`;
  
  reader.style.backgroundColor = pageStyleAnalysis.backgroundColor;
  reader.style.border = `1px solid ${adjustColor(pageStyleAnalysis.backgroundColor, -20)}`;
  
  readerContent.style.color = pageStyleAnalysis.color;
  readerContent.style.fontSize = pageStyleAnalysis.fontSize;
  readerContent.style.lineHeight = pageStyleAnalysis.lineHeight;
  
  // 设置字体
  const fontFamily = readerSettings.fontFamily === 'auto' ? 
    pageStyleAnalysis.fontFamily : readerSettings.fontFamily;
  readerContent.style.fontFamily = fontFamily;
}

// 代码编辑器风格
function applyCodeStyles() {
  readerHeader.style.backgroundColor = '#1e1e1e';
  readerHeader.style.color = '#d4d4d4';
  readerHeader.style.borderBottom = '1px solid #333';
  
  reader.style.backgroundColor = '#1e1e1e';
  reader.style.border = '1px solid #333';
  
  readerContent.style.color = '#d4d4d4';
  readerContent.style.fontSize = '14px';
  readerContent.style.lineHeight = '1.6';
  readerContent.style.fontFamily = 'Consolas, Monaco, "Courier New", monospace';
  
  // 添加代码编辑器特有样式
  readerContent.style.whiteSpace = 'pre-wrap';
  
  // 添加行号
  addLineNumbers();
}

// 为代码编辑器风格添加行号
function addLineNumbers() {
  const content = readerContent.innerHTML;
  const lines = content.split('\n');
  let numberedContent = '';
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    numberedContent += `<div class="code-line"><span class="line-number">${lineNumber}</span>${line}</div>`;
  });
  
  readerContent.innerHTML = numberedContent;
  
  // 添加行号样式
  const style = document.createElement('style');
  style.id = 'infiltra-code-style';
  style.textContent = `
    #infiltra-reader-content .code-line {
      display: flex;
      padding-left: 2.5em;
      position: relative;
    }
    #infiltra-reader-content .line-number {
      position: absolute;
      left: 0;
      color: #606060;
      text-align: right;
      width: 2em;
      font-size: 0.85em;
      padding-right: 0.5em;
      user-select: none;
    }
  `;
  
  // 如果已经有样式，先移除
  const existingStyle = document.getElementById('infiltra-code-style');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  document.head.appendChild(style);
}

// 电子表格风格
function applyExcelStyles() {
  readerHeader.style.backgroundColor = '#217346';
  readerHeader.style.color = 'white';
  readerHeader.style.borderBottom = '1px solid #185a34';
  
  reader.style.backgroundColor = 'white';
  reader.style.border = '1px solid #d4d4d4';
  
  readerContent.style.color = '#333';
  readerContent.style.fontSize = '12px';
  readerContent.style.lineHeight = '1.5';
  readerContent.style.fontFamily = 'Calibri, Arial, sans-serif';
  
  // 不在这里调用renderAsTable
  // 这将在applyStyles中通过updateReaderContent间接调用
}

// 文档风格
function applyDocumentStyles() {
  readerHeader.style.backgroundColor = '#F5F5F5';
  readerHeader.style.color = '#333';
  readerHeader.style.borderBottom = '1px solid #e0e0e0';
  
  reader.style.backgroundColor = 'white';
  reader.style.border = '1px solid #e0e0e0';
  
  readerContent.style.color = '#333';
  readerContent.style.fontSize = '14px';
  readerContent.style.lineHeight = '1.8';
  readerContent.style.fontFamily = '"Times New Roman", Georgia, serif';
  readerContent.style.textAlign = 'justify';
  
  // 清除可能存在的其他样式
  const existingStyle = document.getElementById('infiltra-code-style');
  if (existingStyle) {
    existingStyle.remove();
  }
}

// 辅助函数：调整颜色明暗
function adjustColor(color, amount) {
  // 颜色格式可能是 rgb(r,g,b) 或 #rrggbb
  let r, g, b;
  
  if (color.startsWith('rgb')) {
    // 处理 rgb 格式
    const matches = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (matches) {
      r = parseInt(matches[1]);
      g = parseInt(matches[2]);
      b = parseInt(matches[3]);
    }
  } else if (color.startsWith('#')) {
    // 处理 hex 格式
    const hex = color.substring(1);
    r = parseInt(hex.substr(0, 2), 16);
    g = parseInt(hex.substr(2, 2), 16);
    b = parseInt(hex.substr(4, 2), 16);
  } else {
    // 默认颜色
    return amount > 0 ? '#ffffff' : '#dddddd';
  }
  
  // 调整颜色
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  // 转回 hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 更新阅读器内容
function updateReaderContent() {
  if (!readerContent) {
    console.error('阅读器内容区不存在');
    return;
  }
  
  if (!novel.content) {
    console.error('小说内容为空');
    readerContent.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">没有内容可显示，请先导入小说</p>';
    return;
  }
  
  console.log('更新阅读器内容，章节:', novel.currentChapter, '模式:', readerSettings.disguiseMode);
  
  // 获取当前章节
  const chapter = novel.chapters[novel.currentChapter] || {
    title: '全文',
    start: 0,
    end: novel.content.length
  };
  
  // 获取章节内容
  const chapterContent = novel.content.substring(chapter.start, chapter.end);
  
  // 更新标题
  const titleElement = readerHeader.querySelector('div:first-child');
  if (titleElement) {
    titleElement.textContent = chapter.title || '阅读中';
  }
  
  // 记住滚动位置
  const scrollPosition = readerContent.scrollTop;
  
  // 清除任何旧的内容和样式
  // 删除可能存在的行号样式
  const existingStyle = document.getElementById('infiltra-code-style');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // 更新内容
  if (readerSettings.disguiseMode === 'code') {
    // 代码风格处理
    renderAsCode(chapterContent);
  } else if (readerSettings.disguiseMode === 'excel') {
    // 表格风格处理
    renderAsTable(chapterContent);
  } else {
    // 标准文本处理
    renderAsText(chapterContent);
  }
  
  // 恢复滚动位置
  if (novel.position && novel.currentChapter === 0) {
    // 第一次加载时使用保存的位置
    readerContent.scrollTop = novel.position;
    novel.position = 0; // 清除，之后使用scrollPosition
  } else {
    readerContent.scrollTop = scrollPosition;
  }
  
  // 保存阅读位置
  saveReadingPosition();
  
  console.log('内容更新完成');
}

// 将内容渲染为标准文本
function renderAsText(content) {
  // 规范化段落
  const paragraphs = preprocessContent(content);
  
  // 构建HTML
  let html = '';
  paragraphs.forEach(paragraph => {
    if (paragraph.trim()) {
      // 处理章节标题样式
      if (isChapterTitle(paragraph)) {
        html += `<h3 style="text-align:center;margin:1em 0;font-weight:bold;color:#333;">${paragraph}</h3>`;
      } else {
        // 普通段落
        html += `<p style="text-indent:2em;margin:0.8em 0;line-height:1.6;">${paragraph}</p>`;
      }
    }
  });
  
  // 空内容处理
  if (!html) {
    html = '<p style="color:#999;text-align:center;padding:20px;">本章节内容为空</p>';
  }
  
  readerContent.innerHTML = html;
}

// 将内容渲染为代码
function renderAsCode(content) {
  // 规范化段落，但保留更多空行以符合代码风格
  const lines = content
    .split('\n')
    .map(line => line.trim());
  
  // 代码风格的HTML
  let formattedContent = lines.join('\n');
  
  // 设置内容
  readerContent.textContent = formattedContent;
  
  // 添加行号
  addLineNumbers();
}

// 将内容渲染为表格
function renderAsTable(content) {
  // 规范化段落
  const paragraphs = preprocessContent(content);
  
  // 创建表格
  let tableContent = '<table style="width:100%; border-collapse: collapse;">';
  
  // 添加表头
  tableContent += '<tr style="background-color: #f2f2f2;">';
  tableContent += '<th style="border: 1px solid #d4d4d4; padding: 4px; text-align: center; width: 40px;">行号</th>';
  tableContent += '<th style="border: 1px solid #d4d4d4; padding: 4px; text-align: left;">内容</th>';
  tableContent += '</tr>';
  
  // 添加内容行
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.trim()) {
      tableContent += '<tr>';
      tableContent += `<td style="border: 1px solid #d4d4d4; padding: 4px; text-align: center;">${index + 1}</td>`;
      tableContent += `<td style="border: 1px solid #d4d4d4; padding: 4px; text-align: left;">${paragraph}</td>`;
      tableContent += '</tr>';
    }
  });
  
  tableContent += '</table>';
  readerContent.innerHTML = tableContent;
}

// 判断是否为章节标题
function isChapterTitle(text) {
  // 检查是否匹配常见的章节标题格式
  const titlePatterns = [
    /^第\s*[0-9一二三四五六七八九十百千万]+\s*[章节卷集部篇]/,
    /^Chapter\s*[0-9]+/i,
    /^[0-9一二三四五六七八九十百千万]+[\.、]\s*.+/
  ];
  
  return titlePatterns.some(pattern => pattern.test(text));
}

// 预处理文本内容
function preprocessContent(content) {
  if (!content) return [];
  
  // 将Unix和Windows换行符统一
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // 分割成段落
  let paragraphs = content.split('\n');
  
  // 合并可能被错误分割的段落
  let mergedParagraphs = [];
  let currentParagraph = '';
  
  paragraphs.forEach(paragraph => {
    const trimmed = paragraph.trim();
    
    // 如果是空行，表示段落分隔
    if (!trimmed) {
      if (currentParagraph) {
        mergedParagraphs.push(currentParagraph);
        currentParagraph = '';
      }
      return;
    }
    
    // 如果是章节标题，单独成段
    if (isChapterTitle(trimmed)) {
      if (currentParagraph) {
        mergedParagraphs.push(currentParagraph);
        currentParagraph = '';
      }
      mergedParagraphs.push(trimmed);
      return;
    }
    
    // 如果当前行很短，可能是错误分段，与前面的合并
    if (trimmed.length < 5 && currentParagraph && !trimmed.endsWith('。') && !trimmed.endsWith('！') && !trimmed.endsWith('？') && !trimmed.endsWith('"')) {
      currentParagraph += trimmed;
      return;
    }
    
    // 如果当前行不以句号结尾且很短，可能与下一行合并
    if (currentParagraph) {
      mergedParagraphs.push(currentParagraph);
    }
    currentParagraph = trimmed;
  });
  
  // 不要遗漏最后一段
  if (currentParagraph) {
    mergedParagraphs.push(currentParagraph);
  }
  
  return mergedParagraphs;
}

// 保存阅读位置
function saveReadingPosition() {
  chrome.storage.local.set({
    currentChapter: novel.currentChapter,
    lastReadPosition: readerContent ? readerContent.scrollTop : 0
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('保存阅读位置失败:', chrome.runtime.lastError);
    }
  });
}

// 上一章
function prevChapter() {
  if (novel.currentChapter > 0) {
    novel.currentChapter--;
    updateReaderContent();
  }
}

// 下一章
function nextChapter() {
  if (novel.currentChapter < novel.chapters.length - 1) {
    novel.currentChapter++;
    updateReaderContent();
  }
}

// 添加拖拽功能
function addDragSupport() {
  let offsetX, offsetY, startX, startY;
  
  readerHeader.addEventListener('mousedown', startDrag);
  
  function startDrag(e) {
    // 阻止文本选择
    e.preventDefault();
    
    // 忽略位置按钮的点击
    if (e.target.id === 'position-btn' || e.target.closest('#infiltra-position-menu')) {
      return;
    }
    
    // 获取初始位置
    startX = e.clientX;
    startY = e.clientY;
    
    // 计算鼠标与元素边界的偏移量
    const rect = reader.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;
    
    // 添加移动和释放事件监听
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    // 设置拖拽状态
    isDragging = true;
    
    // 添加正在拖拽的样式
    reader.classList.add('dragging');
    reader.style.opacity = '0.8';
    reader.style.transition = 'none';
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    // 计算新位置
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    // 设置阅读器位置，确保不超出屏幕
    const maxX = window.innerWidth - reader.offsetWidth;
    const maxY = window.innerHeight - reader.offsetHeight;
    
    reader.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    reader.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    
    // 清除右侧和底部位置，因为我们现在使用左侧和顶部
    reader.style.right = 'auto';
    reader.style.bottom = 'auto';
    
    // 清除transform属性
    reader.style.transform = '';
  }
  
  function stopDrag() {
    if (!isDragging) return;
    
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    
    // 恢复样式
    reader.classList.remove('dragging');
    reader.style.opacity = readerSettings.opacity;
    reader.style.transition = 'opacity 0.2s ease';
    
    // 检查是否应该吸附到边缘
    const rect = reader.getBoundingClientRect();
    const threshold = 20; // 吸附阈值，像素
    
    if (rect.left < threshold) {
      // 吸附到左边
      reader.style.left = '0';
    } else if (window.innerWidth - rect.right < threshold) {
      // 吸附到右边
      reader.style.left = 'auto';
      reader.style.right = '0';
    }
    
    if (rect.top < threshold) {
      // 吸附到顶部
      reader.style.top = '0';
    } else if (window.innerHeight - rect.bottom < threshold) {
      // 吸附到底部
      reader.style.top = 'auto';
      reader.style.bottom = '0';
    }
    
    // 保存当前位置
    saveReaderPosition();
  }
}

// 添加缩放功能
function addResizeSupport() {
  // 创建缩放手柄
  const resizeHandle = document.createElement('div');
  resizeHandle.style.position = 'absolute';
  resizeHandle.style.width = '20px';
  resizeHandle.style.height = '20px';
  resizeHandle.style.bottom = '0';
  resizeHandle.style.right = '0';
  resizeHandle.style.cursor = 'nwse-resize';
  resizeHandle.style.backgroundImage = 'linear-gradient(135deg, transparent 70%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.1) 80%, transparent 80%)';
  resizeHandle.style.borderRadius = '0 0 5px 0';
  resizeHandle.style.zIndex = '2';
  
  reader.appendChild(resizeHandle);
  
  let isResizing = false;
  let originalWidth, originalHeight, originalX, originalY;
  
  resizeHandle.addEventListener('mousedown', startResize);
  
  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    
    isResizing = true;
    
    // 保存初始尺寸和位置
    originalWidth = reader.offsetWidth;
    originalHeight = reader.offsetHeight;
    originalX = e.clientX;
    originalY = e.clientY;
    
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
    
    // 添加resize时的样式
    reader.style.transition = 'none';
  }
  
  function resize(e) {
    if (!isResizing) return;
    
    // 计算新尺寸
    const width = originalWidth + (e.clientX - originalX);
    const height = originalHeight + (e.clientY - originalY);
    
    // 设置最小尺寸
    const minWidth = 250;
    const minHeight = 200;
    
    // 应用尺寸
    if (width >= minWidth) {
      reader.style.width = width + 'px';
    }
    
    if (height >= minHeight) {
      reader.style.height = height + 'px';
    }
  }
  
  function stopResize() {
    if (!isResizing) return;
    
    isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
    
    // 恢复样式
    reader.style.transition = 'opacity 0.2s ease';
    
    // 保存当前尺寸
    saveReaderPosition();
  }
}

// 移除阅读器
function removeReader() {
  if (reader && reader.parentNode) {
    reader.parentNode.removeChild(reader);
    reader = null;
    readerContent = null;
    readerHeader = null;
    readerControls = null;
    
    // 更新状态
    readerSettings.isActive = false;
    chrome.storage.local.set({ isReaderActive: false }, function() {
      if (chrome.runtime.lastError) {
        console.error('更新阅读器状态失败:', chrome.runtime.lastError);
      } else {
        console.log('阅读器已关闭');
      }
    });
  }
}

// 切换位置菜单显示/隐藏
function togglePositionMenu() {
  const menu = document.getElementById('infiltra-position-menu');
  if (menu) {
    if (menu.style.display === 'none') {
      menu.style.display = 'block';
    } else {
      menu.style.display = 'none';
    }
  }
}

// 保存阅读器位置
function saveReaderPosition() {
  if (!reader) return;
  
  const position = {};
  
  // 保存当前位置信息
  if (reader.style.left !== 'auto') {
    position.left = reader.style.left;
  }
  if (reader.style.right !== 'auto') {
    position.right = reader.style.right;
  }
  if (reader.style.top !== 'auto') {
    position.top = reader.style.top;
  }
  if (reader.style.bottom !== 'auto') {
    position.bottom = reader.style.bottom;
  }
  
  // 保存当前尺寸信息
  const size = {
    width: reader.style.width,
    height: reader.style.height
  };
  
  // 存储到chrome.storage
  chrome.storage.local.set({
    readerPosition: position,
    readerSize: size
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('保存阅读器位置失败:', chrome.runtime.lastError);
    } else {
      console.log('阅读器位置已保存');
    }
  });
}

// 初始化阅读器
init(); 