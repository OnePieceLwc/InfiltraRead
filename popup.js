// 初始化时设置各种事件监听器
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const textInput = document.getElementById('textInput');
  const importButton = document.getElementById('importButton');
  const disguiseOptions = document.querySelectorAll('.disguise-option');
  const fontSelect = document.getElementById('fontSelect');
  const opacityRange = document.getElementById('opacityRange');
  const opacityValue = document.getElementById('opacityValue');
  const toggleReaderButton = document.getElementById('toggleReaderButton');
  const statusMessage = document.getElementById('statusMessage');
  
  // 读取当前设置
  chrome.storage.local.get(['isReaderActive', 'disguiseMode', 'fontFamily', 'opacity'], function(result) {
    // 如果阅读器当前是激活状态，更改按钮文本
    if (result.isReaderActive) {
      toggleReaderButton.textContent = '关闭阅读器';
    }
    
    // 设置伪装模式
    if (result.disguiseMode) {
      disguiseOptions.forEach(option => {
        if (option.dataset.mode === result.disguiseMode) {
          option.classList.add('active');
        } else {
          option.classList.remove('active');
        }
      });
    }
    
    // 设置字体
    if (result.fontFamily) {
      fontSelect.value = result.fontFamily;
    }
    
    // 设置透明度
    if (result.opacity) {
      opacityRange.value = result.opacity * 100;
      opacityValue.textContent = opacityRange.value + '%';
    }
  });

  // 点击上传区域触发文件输入点击
  uploadArea.addEventListener('click', function() {
    fileInput.click();
  });
  
  // 文件拖拽功能
  uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.style.borderColor = '#4285f4';
  });
  
  uploadArea.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.style.borderColor = '#ccc';
  });
  
  uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.style.borderColor = '#ccc';
    
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });
  
  // 文件选择变化时处理文件
  fileInput.addEventListener('change', function() {
    if (this.files.length) {
      handleFileUpload(this.files[0]);
    }
  });
  
  // 导入文本按钮点击事件
  importButton.addEventListener('click', function() {
    const text = textInput.value.trim();
    if (text) {
      handleTextImport(text);
    } else {
      showStatus('请先输入或粘贴文本', 'error');
    }
  });
  
  // 伪装选项切换
  disguiseOptions.forEach(option => {
    option.addEventListener('click', function() {
      disguiseOptions.forEach(opt => opt.classList.remove('active'));
      this.classList.add('active');
      const mode = this.dataset.mode;
      chrome.storage.local.set({ disguiseMode: mode });
      showStatus('伪装模式已更新');
    });
  });
  
  // 字体选择变化
  fontSelect.addEventListener('change', function() {
    chrome.storage.local.set({ fontFamily: this.value });
    showStatus('字体已更新');
  });
  
  // 透明度调整
  opacityRange.addEventListener('input', function() {
    opacityValue.textContent = this.value + '%';
    chrome.storage.local.set({ opacity: this.value / 100 });
  });
  
  // 开关阅读器
  toggleReaderButton.addEventListener('click', function() {
    chrome.storage.local.get('isReaderActive', function(result) {
      if (chrome.runtime.lastError) {
        console.error('获取阅读器状态失败:', chrome.runtime.lastError);
        showStatus('操作失败', 'error');
        return;
      }
      
      const newState = !result.isReaderActive;
      
      // 更新存储中的状态
      chrome.storage.local.set({ isReaderActive: newState }, function() {
        if (chrome.runtime.lastError) {
          console.error('更新阅读器状态失败:', chrome.runtime.lastError);
          showStatus('操作失败', 'error');
          return;
        }
        
        // 通过后台脚本中转消息到内容脚本
        chrome.runtime.sendMessage({
          action: 'relayToActiveTab',
          message: { 
            action: newState ? 'showReader' : 'hideReader' 
          }
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('发送指令失败:', chrome.runtime.lastError);
            showStatus('操作失败: ' + chrome.runtime.lastError.message, 'error');
            return;
          }
          
          if (response && !response.success) {
            console.error('操作失败:', response.error);
            showStatus('操作失败: ' + response.error, 'error');
            return;
          }
          
          // 更新按钮文本
          toggleReaderButton.textContent = newState ? '关闭阅读器' : '开始阅读';
          showStatus(newState ? '阅读器已激活' : '阅读器已关闭');
          console.log('阅读器状态已更改为:', newState ? '激活' : '关闭');
        });
      });
    });
  });
  
  // 文件处理函数
  function handleFileUpload(file) {
    if (!file) return;
    
    // 检查文件类型
    const fileType = file.name.split('.').pop().toLowerCase();
    if (fileType !== 'txt' && fileType !== 'epub') {
      showStatus('只支持.txt和.epub格式', 'error');
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
      let content = '';
      
      if (fileType === 'txt') {
        content = e.target.result;
        // 确保内容不为空
        if (content) {
          processContent(content, file.name);
          console.log('文件内容已加载:', file.name, content.length);
        } else {
          showStatus('文件内容为空', 'error');
          console.error('文件内容为空:', file.name);
        }
      } else if (fileType === 'epub') {
        // EPUB处理会比较复杂，这里只是一个简单的示例
        // 实际上需要使用专门的EPUB解析库
        showStatus('EPUB解析中...', 'info');
        
        // 简单示例，实际实现需要使用专门的库
        try {
          // 这只是一个占位，实际实现需要使用专门的EPUB解析库
          content = "EPUB文件需要使用专门的解析库处理，此处为简化示例。";
          processContent(content, file.name);
          console.log('EPUB文件已处理:', file.name);
        } catch (error) {
          showStatus('EPUB解析失败', 'error');
          console.error('EPUB解析失败:', error);
        }
      }
    };
    
    reader.onerror = function(e) {
      showStatus('文件读取失败', 'error');
      console.error('文件读取失败:', e);
    };
    
    if (fileType === 'txt') {
      reader.readAsText(file, 'UTF-8');
    } else if (fileType === 'epub') {
      reader.readAsArrayBuffer(file);
    }
  }
  
  // 处理粘贴的文本
  function handleTextImport(text) {
    if (text) {
      processContent(text, '剪贴板导入');
      console.log('文本已导入，长度:', text.length);
    } else {
      showStatus('文本内容为空', 'error');
      console.error('文本内容为空');
    }
  }
  
  // 处理内容逻辑
  function processContent(content, title) {
    if (!content) {
      showStatus('内容为空，无法处理', 'error');
      console.error('处理内容失败: 内容为空');
      return;
    }

    console.log('开始处理内容，标题:', title);
    
    // 简单的章节分割逻辑，实际应用可能需要更复杂的算法
    const chapters = splitIntoChapters(content);
    console.log('章节分割完成，章节数:', chapters.length);
    
    // 通过后台脚本存储数据并通知内容脚本
    chrome.runtime.sendMessage({
      action: 'importNovel',
      content: content,
      title: title,
      chapters: chapters
    }, function(response) {
      if (chrome.runtime.lastError) {
        showStatus('保存失败: ' + chrome.runtime.lastError.message, 'error');
        console.error('消息发送失败:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        showStatus('小说导入成功');
        console.log('小说导入成功');
        
        // 清空文本框
        textInput.value = '';
        
        // 如果阅读器还未激活，自动激活
        chrome.storage.local.get('isReaderActive', function(result) {
          if (chrome.runtime.lastError) {
            console.error('获取阅读器状态失败:', chrome.runtime.lastError);
            return;
          }
          
          if (!result.isReaderActive) {
            console.log('阅读器未激活，自动激活');
            // 设置状态为激活
            chrome.storage.local.set({ isReaderActive: true }, function() {
              if (chrome.runtime.lastError) {
                console.error('激活阅读器失败:', chrome.runtime.lastError);
                return;
              }
              
              // 通知内容脚本显示阅读器
              chrome.runtime.sendMessage({
                action: 'relayToActiveTab',
                message: { action: 'showReader' }
              }, function(relayResponse) {
                if (chrome.runtime.lastError) {
                  console.error('发送显示指令失败:', chrome.runtime.lastError);
                } else if (relayResponse && !relayResponse.success) {
                  console.error('发送显示指令失败:', relayResponse.error);
                } else {
                  console.log('显示指令已发送');
                  toggleReaderButton.textContent = '关闭阅读器';
                }
              });
            });
          } else {
            console.log('阅读器已激活，更新内容');
          }
        });
      } else {
        showStatus('导入失败' + (response && response.error ? ': ' + response.error : ''), 'error');
        console.error('导入失败:', response);
      }
    });
  }
  
  // 章节分割
  function splitIntoChapters(content) {
    if (!content) {
      console.error('章节分割失败: 内容为空');
      return [{ title: '全文', start: 0, end: 0 }];
    }
    
    // 简单的章节分割逻辑，查找常见的章节标题格式
    const chapterRegexs = [
      /第[\s]*[0-9一二三四五六七八九十百千万]+[\s]*章/g,  // 匹配"第X章"
      /第[\s]*[0-9一二三四五六七八九十百千万]+[\s]*节/g,  // 匹配"第X节"
      /Chapter[\s]*[0-9]+/gi,  // 匹配"Chapter X"
    ];
    
    let chapters = [];
    
    // 通过多个正则表达式查找可能的章节标记
    let matches = [];
    chapterRegexs.forEach(regex => {
      let match;
      const regexCopy = new RegExp(regex.source, regex.flags);
      while ((match = regexCopy.exec(content)) !== null) {
        matches.push({
          index: match.index,
          title: match[0].trim()
        });
      }
    });
    
    console.log('找到的章节标记数:', matches.length);
    
    // 按索引排序
    matches.sort((a, b) => a.index - b.index);
    
    // 如果没有找到章节，将整个内容作为一章
    if (matches.length === 0) {
      chapters.push({
        title: '全文',
        start: 0,
        end: content.length
      });
      return chapters;
    }
    
    // 处理第一章之前的内容（如果有）
    if (matches[0].index > 0) {
      chapters.push({
        title: '前言',
        start: 0,
        end: matches[0].index
      });
    }
    
    // 构建章节数组
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = i < matches.length - 1 ? matches[i + 1] : null;
      
      chapters.push({
        title: current.title,
        start: current.index,
        end: next ? next.index : content.length
      });
    }
    
    return chapters;
  }
  
  // 显示状态消息
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.style.color = type === 'error' ? '#f44336' : 
                               type === 'info' ? '#2196F3' : '#4caf50';
    
    console.log(`状态消息 [${type}]:`, message);
    
    // 2秒后清除消息
    setTimeout(() => {
      statusMessage.textContent = '';
    }, 2000);
  }
}); 