const state = {
  directoryHandles: [],
  files: [],
  classes: [],
  latestByClass: new Map(),
  ignoredFiles: new Set(),
  ignoredClasses: new Set(),
  knownClasses: new Set(),
  view: 'grid',
  appendFolderInput: false,
  pendingClassId: null,
  pendingFileClassId: null,
  scanErrors: 0
};

const storageKey = 'lecture-shelf-classes';
const folderDatabase = openFolderDatabase();
const chooseButton = document.querySelector('#choose-button');
const addClassButton = document.querySelector('#add-class-button');
const emptyChooseButton = document.querySelector('#empty-choose-button');
const folderInput = document.querySelector('#folder-input');
const fileInput = document.querySelector('#file-input');
const searchInput = document.querySelector('#search-input');
const classGrid = document.querySelector('#class-grid');
const emptyState = document.querySelector('#empty-state');
const library = document.querySelector('#library');
const syncStatus = document.querySelector('#sync-status');
const scanTime = document.querySelector('#scan-time');
const fileCount = document.querySelector('#file-count');
const resultCount = document.querySelector('#result-count');
const libraryHeading = document.querySelector('#library-heading');
const classDialog = document.querySelector('#class-dialog');
const classForm = document.querySelector('#class-form');
const classNameInput = document.querySelector('#class-name-input');
const cancelClassButton = document.querySelector('#cancel-class-button');

chooseButton.addEventListener('click', chooseFolder);
addClassButton.addEventListener('click', addClass);
classForm.addEventListener('submit', event => {
  event.preventDefault();
  const className = classNameInput.value.trim();
  if (!className) return;
  if (state.classes.some(item => item.name.toLowerCase() === className.toLowerCase())) {
    setStatus('That class already exists');
    return;
  }
  state.ignoredClasses.delete(className);
  state.knownClasses.add(className);
  state.classes.push({ id: crypto.randomUUID(), name: className, files: [], manualFiles: [] });
  classNameInput.value = '';
  classDialog.close();
  saveState();
  render();
});
cancelClassButton.addEventListener('click', () => classDialog.close());
emptyChooseButton.addEventListener('click', chooseFolder);
setInterval(() => {
  if (state.directoryHandles.length || state.classes.some(item => item.directoryHandle)) scanDirectories();
}, 30000);
classGrid.addEventListener('click', event => {
  const removeFileButton = event.target.closest('[data-remove-file]');
  if (removeFileButton) {
    removeFile(removeFileButton.dataset.removeFile);
    return;
  }
  const removeButton = event.target.closest('[data-remove-class]');
  if (removeButton) {
    removeClass(removeButton.dataset.removeClass);
    return;
  }
  const button = event.target.closest('[data-add-folder]');
  if (button) addFolderToClass(button.dataset.addFolder);
  const fileButton = event.target.closest('[data-add-files]');
  if (fileButton) addFilesToClass(fileButton.dataset.addFiles);
});
classGrid.addEventListener('change', event => {
  const selector = event.target.closest('[data-latest-class]');
  if (!selector) return;
  state.latestByClass.set(selector.dataset.latestClass, selector.value);
  saveState();
  render();
});
folderInput.addEventListener('change', () => {
  const files = [...folderInput.files].map(file => ({
    name: file.name,
    path: file.webkitRelativePath || file.name,
    lastModified: file.lastModified,
    file,
    type: extensionOf(file.name)
  }));
  if (state.pendingClassId) {
    const classItem = state.classes.find(item => item.id === state.pendingClassId);
    if (classItem) {
      classItem.manualFiles = [...(classItem.manualFiles || []), ...files.map(file => ({ ...file, path: `${classItem.name}/${file.path}` }))];
      classItem.files = [...classItem.files, ...classItem.manualFiles.slice(-files.length)];
      state.files = state.classes.flatMap(item => item.files);
    }
    state.pendingClassId = null;
    state.appendFolderInput = false;
    saveState();
    render();
    return;
  } else if (!state.appendFolderInput) {
    state.directoryHandles = [];
    state.files = [];
  }
  state.files = [...state.files, ...files.filter(isSupported)];
  state.appendFolderInput = false;
  render();
});
fileInput.addEventListener('change', () => {
  const classItem = state.classes.find(item => item.id === state.pendingFileClassId);
  if (classItem) {
    const files = [...fileInput.files].map(file => ({
      name: file.name,
      path: `${classItem.name}/${file.name}`,
      lastModified: file.lastModified,
      file,
      type: extensionOf(file.name)
    }));
    classItem.manualFiles = [...(classItem.manualFiles || []), ...files];
    classItem.files = [...classItem.files, ...files];
    const classFilePaths = new Set(state.classes.flatMap(item => item.files.map(file => file.path)));
    state.files = [...state.files.filter(file => !classFilePaths.has(file.path)), ...state.classes.flatMap(item => item.files)];
    saveState();
    render();
  }
  state.pendingFileClassId = null;
  fileInput.value = '';
});
searchInput.addEventListener('input', render);
document.querySelectorAll('.view-button').forEach(button => {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('.view-button').forEach(item => item.classList.toggle('is-active', item === button));
    render();
  });
});

async function chooseFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
      state.directoryHandles = [directoryHandle];
      state.ignoredClasses.clear();
      await saveState();
      await scanDirectories();
    } catch (error) {
      if (error.name !== 'AbortError') setStatus('Could not read folder');
    }
  } else {
    state.appendFolderInput = false;
    folderInput.click();
  }
}

function addClass() {
  classDialog.showModal();
  classNameInput.focus();
}

async function addFolderToClass(classId) {
  let classItem = state.classes.find(item => item.id === classId || item.name === classId);
  if (!classItem) {
    const existingFiles = state.files.filter(file => file.path.startsWith(`${classId}/`));
    classItem = { id: crypto.randomUUID(), name: classId, files: existingFiles, manualFiles: [] };
    state.classes.push(classItem);
  }
  if (!('showDirectoryPicker' in window)) {
    state.pendingClassId = classId;
    state.appendFolderInput = true;
    folderInput.click();
    return;
  }
  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
    classItem.directoryHandle = directoryHandle;
    await saveState();
    const folderFiles = [];
    await collectFiles(directoryHandle, '', folderFiles);
    classItem.manualFiles = classItem.manualFiles || [];
    classItem.files = folderFiles.filter(isSupported).map(file => ({ ...file, path: `${classItem.name}/${file.path}` }));
    classItem.files.push(...classItem.manualFiles);
    state.files = state.classes.flatMap(item => item.files).concat(state.files.filter(file => !state.classes.some(item => file.path.startsWith(`${item.name}/`))));
    render();
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('Could not attach folder');
  }
}

function addFilesToClass(classId) {
  let classItem = state.classes.find(item => item.id === classId || item.name === classId);
  if (!classItem) {
    const existingFiles = state.files.filter(file => file.path.startsWith(`${classId}/`));
    classItem = { id: crypto.randomUUID(), name: classId, files: existingFiles, manualFiles: [] };
    state.classes.push(classItem);
  }
  state.pendingFileClassId = classItem.id;
  fileInput.click();
}

function removeClass(className) {
  const classItem = state.classes.find(item => item.id === className || item.name === className);
  const classKey = classItem ? classItem.name : className;
  state.ignoredClasses.add(classKey);
  state.knownClasses.delete(classKey);
  state.classes = state.classes.filter(item => item.id !== className && item.name !== className);
  state.files = state.files.filter(file => !file.path.startsWith(`${classKey}/`));
  state.latestByClass.delete(classKey);
  saveState();
  render();
}

function removeFile(filePath) {
  state.ignoredFiles.add(filePath);
  state.files = state.files.filter(file => file.path !== filePath);
  state.classes.forEach(item => {
    item.files = item.files.filter(file => file.path !== filePath);
    item.manualFiles = (item.manualFiles || []).filter(file => file.path !== filePath);
  });
  for (const [className, selectedPath] of state.latestByClass.entries()) {
    if (selectedPath === filePath) state.latestByClass.delete(className);
  }
  saveState();
  render();
}

async function scanDirectories() {
  const files = [];
  state.scanErrors = 0;
  for (const directoryHandle of state.directoryHandles) {
    try {
      const folderFiles = [];
      await collectFiles(directoryHandle, '', folderFiles);
      folderFiles.forEach(file => {
        file.path = `${directoryHandle.name}/${file.path}`;
        files.push(file);
      });
    } catch (error) {
      state.scanErrors += 1;
    }
  }
  for (const classItem of state.classes) {
    classItem.manualFiles = classItem.manualFiles || [];
    if (classItem.directoryHandle) {
      const folderFiles = [];
      await collectFiles(classItem.directoryHandle, '', folderFiles);
      classItem.files = folderFiles.filter(isSupported).map(file => ({ ...file, path: `${classItem.name}/${file.path}` })).filter(file => !state.ignoredFiles.has(file.path));
    }
    const manualFiles = classItem.manualFiles.filter(file => !state.ignoredFiles.has(file.path));
    classItem.files = [...classItem.files.filter(file => !manualFiles.some(manualFile => manualFile.path === file.path)), ...manualFiles];
    files.push(...(classItem.directoryHandle ? classItem.files : manualFiles));
  }
  state.files = files.filter(isSupported)
    .filter(file => !state.ignoredFiles.has(file.path))
    .filter(file => !state.ignoredClasses.has(file.path.split('/')[0]));
  files.forEach(file => {
    const className = file.path.includes('/') ? file.path.split('/')[0] : null;
    if (className && !state.ignoredClasses.has(className)) state.knownClasses.add(className);
  });
  saveState();
  render();
}

async function scanDirectory(directoryHandle) {
  const files = [];
  await collectFiles(directoryHandle, '', files);
  state.files = files.filter(isSupported);
  render();
}

async function collectFiles(directoryHandle, relativePath, files) {
  for await (const entry of directoryHandle.values()) {
    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    try {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        files.push({ name: file.name, path: entryPath, lastModified: file.lastModified, file, type: extensionOf(file.name) });
      } else if (entry.kind === 'directory') {
        await collectFiles(entry, entryPath, files);
      }
    } catch (error) {
      state.scanErrors += 1;
    }
  }
}

function render() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const knownClassCards = [...state.knownClasses]
    .filter(name => !state.ignoredClasses.has(name) && !state.classes.some(item => item.name === name) && !state.files.some(file => file.path.startsWith(`${name}/`)))
    .map(name => ({ name, files: [] }));
  const classes = [...groupByClass(state.files), ...state.classes.filter(item => !state.files.some(file => file.path.startsWith(`${item.name}/`))), ...knownClassCards].filter(item => {
    if (!searchTerm) return true;
    return item.name.toLowerCase().includes(searchTerm) || item.files.some(file => file.name.toLowerCase().includes(searchTerm));
  });

  const hasLibrary = state.files.length > 0 || state.classes.length > 0 || state.knownClasses.size > 0;
  emptyState.hidden = hasLibrary;
  library.hidden = !hasLibrary;
  if (!hasLibrary) {
    setStatus('No folder selected');
    scanTime.textContent = 'Waiting for a folder';
    fileCount.textContent = 'No files indexed';
    return;
  }

  setStatus(state.directoryHandles.length ? `${state.directoryHandles.length} class folder${state.directoryHandles.length === 1 ? '' : 's'} connected` : 'Folder loaded');
  scanTime.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const scanWarning = state.scanErrors ? `, ${state.scanErrors} could not be read` : '';
  fileCount.textContent = `${state.files.length} file${state.files.length === 1 ? '' : 's'} indexed${scanWarning}`;
  libraryHeading.textContent = searchTerm ? 'Matching classes' : 'Classes';
  resultCount.textContent = `${classes.length} class${classes.length === 1 ? '' : 'es'}`;
  classGrid.classList.toggle('list-view', state.view === 'list');
  classGrid.innerHTML = classes.length ? classes.map(renderClassCard).join('') : '<p class="no-results">No classes or files match that search.</p>';
}

function groupByClass(files) {
  const groups = new Map();
  files.forEach(file => {
    const className = file.path.includes('/') ? file.path.split('/')[0] : 'Unsorted files';
    if (!groups.has(className)) groups.set(className, []);
    groups.get(className).push(file);
  });
  return [...groups.entries()].map(([name, classFiles]) => ({ name, files: classFiles.sort((a, b) => b.lastModified - a.lastModified) })).sort((a, b) => b.files[0].lastModified - a.files[0].lastModified);
}

function renderClassCard(group, index) {
  if (!group.files.length) {
    return `<article class="class-card empty-class-card">
      <div class="card-top"><span class="class-index">${String(index + 1).padStart(2, '0')}</span><span class="card-actions"><span class="file-type">No folder</span><button class="remove-class-button" data-remove-class="${escapeHtml(group.id || group.name)}" type="button">Remove</button></span></div>
      <h4 title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</h4>
      <span class="class-meta">Ready for lecture files</span>
      <button class="latest-file attach-folder-button" data-add-folder="${escapeHtml(group.id || group.name)}" type="button"><span class="file-name">Add lecture folder</span><span class="file-date">Attach this class's folder</span></button>
      <button class="file-chip add-files-button" data-add-files="${escapeHtml(group.id || group.name)}" type="button">Add individual files</button>
    </article>`;
  }
  const selectedPath = state.latestByClass.get(group.name);
  const latest = group.files.find(file => file.path === selectedPath) || group.files[0];
  const otherFiles = group.files.filter(file => file !== latest);
  const latestOptions = group.files.map(file => `<option value="${escapeHtml(file.path)}" ${file === latest ? 'selected' : ''}>${escapeHtml(file.name)}</option>`).join('');
  return `<article class="class-card">
    <div class="card-top"><span class="class-index">${String(index + 1).padStart(2, '0')}</span><span class="card-actions"><span class="file-type">${group.files.length} file${group.files.length === 1 ? '' : 's'}</span><button class="remove-class-button" data-remove-class="${escapeHtml(group.id || group.name)}" type="button">Remove</button></span></div>
    <h4 title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</h4>
    <span class="class-meta">Updated ${formatDate(latest.lastModified)}</span>
    <label class="latest-picker">Latest lecture<select data-latest-class="${escapeHtml(group.name)}">${latestOptions}</select></label>
    <div class="file-row">
      <a class="latest-file" href="${URL.createObjectURL(latest.file)}" target="_blank" rel="noopener">
        <span class="file-name" title="${escapeHtml(latest.name)}">${escapeHtml(latest.name)}</span>
        <span class="file-date">Open newest lecture</span>
      </a>
      <button class="remove-file-button" data-remove-file="${escapeHtml(latest.path)}" type="button">Remove file</button>
    </div>
    <button class="file-chip add-files-button" data-add-files="${escapeHtml(group.id || group.name)}" type="button">Add individual files</button>
    ${otherFiles.length ? `<div class="more-files">${otherFiles.map(file => `<span class="file-row compact-file-row"><a class="file-chip" href="${URL.createObjectURL(file.file)}" target="_blank" rel="noopener" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</a><button class="remove-file-button" data-remove-file="${escapeHtml(file.path)}" type="button">Remove</button></span>`).join('')}</div>` : ''}
  </article>`;
}

function isSupported(file) { return Boolean(file && file.name); }
function extensionOf(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }
function formatDate(timestamp) { return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
function setStatus(text) { syncStatus.textContent = text; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

function openFolderDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lecture-shelf', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('folders')) database.createObjectStore('folders', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('manual-files')) database.createObjectStore('manual-files', { keyPath: 'path' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveState() {
  localStorage.setItem(storageKey, JSON.stringify({
    classes: state.classes.map(item => ({
      id: item.id,
      name: item.name,
      manualFiles: (item.manualFiles || []).map(file => ({ name: file.name, path: file.path, lastModified: file.lastModified, type: file.type }))
    })),
    latestByClass: [...state.latestByClass.entries()],
    ignoredFiles: [...state.ignoredFiles],
    ignoredClasses: [...state.ignoredClasses],
    knownClasses: [...state.knownClasses]
  }));
  const database = await folderDatabase;
  const transaction = database.transaction(['folders', 'manual-files'], 'readwrite');
  const store = transaction.objectStore('folders');
  const manualFileStore = transaction.objectStore('manual-files');
  store.clear();
  manualFileStore.clear();
  state.directoryHandles.forEach((handle, index) => store.put({ id: `root-${index}`, handle }));
  state.classes.forEach(item => {
    if (item.directoryHandle) store.put({ id: `class-${item.id}`, handle: item.directoryHandle });
    (item.manualFiles || []).forEach(file => {
      if (file.file) manualFileStore.put({ path: file.path, name: file.name, lastModified: file.lastModified, type: file.type, file: file.file });
    });
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function restoreState() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  state.classes = (saved.classes || []).map(item => ({ ...item, files: [], manualFiles: item.manualFiles || [] }));
  state.latestByClass = new Map(saved.latestByClass || []);
  state.ignoredFiles = new Set(saved.ignoredFiles || []);
  state.ignoredClasses = new Set(saved.ignoredClasses || []);
  state.knownClasses = new Set(saved.knownClasses || []);
  const database = await folderDatabase;
  const [savedFolders, savedManualFiles] = await Promise.all([readStore(database, 'folders'), readStore(database, 'manual-files')]);
  const manualFilesByPath = new Map(savedManualFiles.map(file => [file.path, file]));
  state.classes.forEach(item => {
    item.manualFiles = (item.manualFiles || []).map(file => {
      const savedFile = manualFilesByPath.get(file.path);
      return savedFile ? { ...file, file: savedFile.file } : file;
    }).filter(file => file.file);
  });
  savedFolders.forEach(savedFolder => {
    if (savedFolder.id.startsWith('root-')) state.directoryHandles.push(savedFolder.handle);
    if (savedFolder.id.startsWith('class-')) {
      const classItem = state.classes.find(item => `class-${item.id}` === savedFolder.id);
      if (classItem) classItem.directoryHandle = savedFolder.handle;
    }
  });
  render();
  if (state.directoryHandles.length || state.classes.some(item => item.directoryHandle)) {
    try {
      await scanDirectories();
    } catch (error) {
      render();
    }
  }
}

function readStore(database, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

restoreState().catch(() => render());
