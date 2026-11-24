export const lanWebFileActionsScripts = `    newFolderBtn.addEventListener('click', function() {
      actionModalTitle.innerText = '新建文件夹';
      actionModalBody.innerHTML = '<input type="text" id="new-folder-name" class="v-input" placeholder="请输入文件夹名称" style="width:100%;">';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="submitNewFolder()">创建</button>';
      actionModal.style.display = 'flex';
      setTimeout(function() { document.getElementById('new-folder-name').focus(); }, 50);
    });

    window.submitNewFolder = async function() {
      var name = document.getElementById('new-folder-name').value.trim();
      if (!name) return;
      try {
        var res = await apiFetch('/api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentPath: state.currentPath, name: name })
        });
        if (res.success) {
          showToast('文件夹创建成功');
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '创建失败');
        }
      } catch (err) {
        showToast('创建异常');
      }
    };

    window.openItemActions = function(encodedPath) {
      var itemPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === itemPath; });
      if (!item) return;

      var isVideo = getFileCategory(item) === 'video';

      actionModalTitle.innerText = '管理: ' + item.name;
      var html = '<div style="display:flex; flex-direction:column; gap:8px;">';

      if (isVideo) {
        html += '<button class="v-btn v-btn-primary" onclick="closeActionModal(); openVideoEditModal(\\'' + encodedPath + '\\')">' +
          '<span>视频剪辑</span></button>';

        html += '<button class="v-btn v-btn-secondary" onclick="closeActionModal(); openVideoCompressModal(\\'' + encodedPath + '\\')">' +
          '<span>压缩视频</span></button>';
      }

      html += '<button class="v-btn v-btn-secondary" onclick="openMoveModal(\\'' + encodedPath + '\\')">移动</button>' +
        '<button class="v-btn v-btn-secondary" onclick="openRenameModal(\\'' + encodedPath + '\\')">重命名</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="openDeleteModal(\\'' + encodedPath + '\\')">删除</button>' +
        '</div>';

      actionModalBody.innerHTML = html;
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">关闭</button>';
      actionModal.style.display = 'flex';
    };

    window.openBatchMoveModal = async function() {
      var selectedList = Array.from(state.selectedPaths);
      if (selectedList.length === 0) return;

      state.isBatchMove = true;
      state.moveSourcePaths = selectedList;
      state.moveSourcePath = '';
      state.moveSourceName = '';
      state.moveSelectedTarget = '';
      state.moveDirList = [];

      actionModalTitle.innerText = '移动 (已选 ' + selectedList.length + ' 项)';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<div class="tree-toolbar">' +
        '<span class="selected-target-hint">目标目录: <strong id="move-target-label">未选择</strong></span>' +
        '<button class="v-btn v-btn-secondary" id="move-new-subfolder-btn" disabled onclick="openMoveNewSubfolderModal()" style="font-size:12px; height:28px; padding:2px 8px;">+ 新建子目录</button>' +
        '</div>' +
        '<div class="directory-tree-container" id="move-tree-container">' +
        '<div class="empty-state" style="padding:30px 10px;"><span>正在扫描目录树</span></div>' +
        '</div>' +
        '</div>';

      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" id="move-confirm-btn" disabled onclick="submitMove()">确认移动</button>';

      actionModal.style.display = 'flex';
      await loadMoveDirTree();
    };

    window.openMoveModal = async function(encodedPath, name) {
      var sourcePath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === sourcePath; });
      var finalName = name || (item ? item.name : (sourcePath.split(/[\\\\/]/).pop() || ''));

      state.isBatchMove = false;
      state.moveSourcePath = sourcePath;
      state.moveSourceName = finalName;
      state.moveSourcePaths = [];
      state.moveSelectedTarget = '';
      state.moveDirList = [];

      actionModalTitle.innerText = '移动 "' + finalName + '"';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<div class="tree-toolbar">' +
        '<span class="selected-target-hint">目标目录: <strong id="move-target-label">未选择</strong></span>' +
        '<button class="v-btn v-btn-secondary" id="move-new-subfolder-btn" disabled onclick="openMoveNewSubfolderModal()" style="font-size:12px; height:28px; padding:2px 8px;">+ 新建子目录</button>' +
        '</div>' +
        '<div class="directory-tree-container" id="move-tree-container">' +
        '<div class="empty-state" style="padding:30px 10px;"><span>正在扫描目录树</span></div>' +
        '</div>' +
        '</div>';

      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" id="move-confirm-btn" disabled onclick="submitMove()">确认移动</button>';

      actionModal.style.display = 'flex';
      await loadMoveDirTree();
    };

    async function loadMoveDirTree() {
      try {
        var res = await apiFetch('/api/dir-tree?id=' + encodeURIComponent(state.currentResourceId));
        if (res.success && res.dirList) {
          state.moveDirList = res.dirList;
          renderMoveTree();
        } else {
          document.getElementById('move-tree-container').innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>扫描失败: ' + escapeHtml(res.error || '无法获取目录') + '</span></div>';
        }
      } catch (err) {
        document.getElementById('move-tree-container').innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>扫描异常</span></div>';
      }
    }

    function renderMoveTree() {
      var container = document.getElementById('move-tree-container');
      if (!container) return;

      if (!state.moveDirList || state.moveDirList.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>未发现可用目录</span></div>';
        return;
      }

      var currentDir = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var html = '';
      for (var i = 0; i < state.moveDirList.length; i++) {
        var item = state.moveDirList[i];
        var isSelected = state.moveSelectedTarget === item.path;
        var padLeft = item.depth * 16 + 10;
        html += '<div class="tree-node ' + (isSelected ? 'active' : '') + '" style="padding-left:' + padLeft + 'px;" onclick="selectMoveTarget(' + i + ')">' +
          '<svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
          '<span class="node-name" title="' + escapeHtml(item.path) + '">' + escapeHtml(item.name) + '</span>' +
          '</div>';
      }
      container.innerHTML = html;
    }

    window.selectMoveTarget = function(index) {
      var item = state.moveDirList[index];
      if (!item) return;

      state.moveSelectedTarget = item.path;
      var targetLabel = document.getElementById('move-target-label');
      if (targetLabel) targetLabel.innerText = item.name;

      var newSubBtn = document.getElementById('move-new-subfolder-btn');
      if (newSubBtn) newSubBtn.disabled = false;

      var currentDir = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var selectedNorm = item.path.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var isSameAsCurrent = currentDir === selectedNorm;

      var confirmBtn = document.getElementById('move-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = isSameAsCurrent;
      }

      renderMoveTree();
    };

    window.openMoveNewSubfolderModal = async function() {
      if (!state.moveSelectedTarget) return;
      var subfolderName = await window.showPrompt({
        title: '新建子目录',
        message: '在当前所选目录下创建新子目录：',
        placeholder: '请输入文件夹名称'
      });
      if (!subfolderName || !subfolderName.trim()) return;

      apiFetch('/api/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: state.moveSelectedTarget, name: subfolderName.trim() })
      }).then(function(res) {
        if (res.success) {
          showToast('子目录创建成功');
          loadMoveDirTree();
        } else {
          showToast(res.error || '创建失败');
        }
      }).catch(function() {
        showToast('创建异常');
      });
    };

    window.submitMove = async function() {
      if (!state.moveSelectedTarget) return;

      var payload = {};
      if (state.isBatchMove) {
        if (!state.moveSourcePaths || state.moveSourcePaths.length === 0) return;
        payload = {
          sourcePaths: state.moveSourcePaths,
          targetDirPath: state.moveSelectedTarget
        };
      } else {
        if (!state.moveSourcePath) return;
        payload = {
          sourcePath: state.moveSourcePath,
          targetDirPath: state.moveSelectedTarget
        };
      }

      var confirmBtn = document.getElementById('move-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = '正在移动...';
      }

      try {
        var res = await apiFetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.success) {
          if (state.isBatchMove) {
            showToast('已成功移动 ' + (res.movedCount || state.moveSourcePaths.length) + ' 项');
            clearSelection();
          } else {
            showToast('移动成功');
          }
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '移动失败');
        }
      } catch (err) {
        showToast('移动异常');
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerText = '确认移动';
        }
      }
    };

    window.openRenameModal = function(encodedPath, oldName) {
      var targetPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === targetPath; });
      var finalName = oldName || (item ? item.name : (targetPath.split(/[\\\\/]/).pop() || ''));

      actionModalTitle.innerText = '重命名';
      actionModalBody.innerHTML = '<input type="text" id="rename-input" class="v-input" value="' + escapeHtml(finalName) + '" style="width:100%;">';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="submitRename(\\'' + encodedPath + '\\')">保存</button>';
      actionModal.style.display = 'flex';
      setTimeout(function() { document.getElementById('rename-input').focus(); }, 50);
    };

    window.submitRename = async function(encodedPath) {
      var targetPath = decodeURIComponent(encodedPath);
      var inputEl = document.getElementById('rename-input');
      var newName = inputEl ? inputEl.value.trim() : '';
      if (!newName) return;

      var saveBtn = actionModalFooter.querySelector('.v-btn-primary');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = '正在保存...';
      }

      try {
        var res = await apiFetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: targetPath, newName: newName })
        });
        if (res.success) {
          showToast('重命名成功');
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '重命名失败');
        }
      } catch (err) {
        showToast('重命名异常');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = '保存';
        }
      }
    };

    window.openDeleteModal = function(encodedPath, isDir, name) {
      var targetPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === targetPath; });
      var finalName = name || (item ? item.name : (targetPath.split(/[\\\\/]/).pop() || ''));
      var isDirectory = typeof isDir === 'boolean' ? isDir : (item ? item.isDirectory : false);

      actionModalTitle.innerText = '确认删除';
      actionModalBody.innerHTML = '<p style="color:var(--color-error); font-size:14px;">确定要永久删除 ' + (isDirectory ? '文件夹' : '文件') + ' "<strong>' + escapeHtml(finalName) + '</strong>" 吗？此操作不可恢复。</p>';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="submitDelete(\\'' + encodedPath + '\\')">确认</button>';
      actionModal.style.display = 'flex';
    };

    window.submitDelete = async function(encodedPath) {
      var targetPath = decodeURIComponent(encodedPath);
      var delBtn = actionModalFooter.querySelector('.v-btn-danger-soft');
      if (delBtn) {
        delBtn.disabled = true;
        delBtn.innerText = '正在删除...';
      }

      try {
        var res = await apiFetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: targetPath })
        });
        if (res.success) {
          showToast('已成功删除');
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '删除失败');
        }
      } catch (err) {
        showToast('删除异常');
      } finally {
        if (delBtn) {
          delBtn.disabled = false;
          delBtn.innerText = '确认';
        }
      }
    };
`;
