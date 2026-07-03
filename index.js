// 注意：为兼容不同部署路径，这里不再使用 ES Module import。
// 统一从全局（window）获取 SillyTavern 已加载的对象，以避免 URL 安装后路径解析问题。
const ST_GLOBALS = {
    get extension_settings() { return window.extension_settings; },
    get getContext() { return window.getContext; },
    get saveSettingsDebounced() { return window.saveSettingsDebounced; },
    get eventSource() { return window.eventSource; },
    get event_types() { return window.event_types; },
};

async function waitForSTGlobals(timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            const ok = ST_GLOBALS.extension_settings && ST_GLOBALS.getContext && ST_GLOBALS.saveSettingsDebounced && ST_GLOBALS.eventSource && ST_GLOBALS.event_types && document.getElementById('extensions_settings');
            if (ok) {
                clearInterval(timer);
                resolve(true);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(timer);
                console.error('[Theme Binder] 等待全局对象超时，扩展可能无法正常工作');
                resolve(false);
            }
        }, 100);
    });
}

// 插件的内部名称（保留备用）
const extensionName = "character-theme-binder";
// 存储绑定数据的路径
const settingsPath = "char_theme_binder";

// 初始化设置数据结构
// 延迟到初始化时再安全访问 extension_settings

// ========= 基础工具 =========
// 获取当前角色的唯一标识符 (使用 avatar 文件名最安全，因为名字可能会改)
function getCurrentCharacterAvatar() {
    const context = ST_GLOBALS.getContext && ST_GLOBALS.getContext();
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    return null; // 群聊或者没选角色时返回null
}

function getCurrentBinding() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return null;
    return (ST_GLOBALS.extension_settings && ST_GLOBALS.extension_settings[settingsPath] && ST_GLOBALS.extension_settings[settingsPath][avatar]) || null;
}

// ========= 设置页状态 =========
function updateStatusUI() {
    const statusDiv = document.getElementById('ctb_current_status');
    if (!statusDiv) return;

    const avatar = getCurrentCharacterAvatar();
    if (!avatar) {
        statusDiv.textContent = "请先打开一个角色的聊天框";
        statusDiv.style.color = "yellow";
        return;
    }

    const binding = extension_settings[settingsPath][avatar];
    // 兼容保护
    if (!binding && ST_GLOBALS.extension_settings && !ST_GLOBALS.extension_settings[settingsPath]) {
        ST_GLOBALS.extension_settings[settingsPath] = {};
    }
    if (binding) {
        statusDiv.textContent = `✅ 已绑定 - 背景: ${binding.bg} | 主题: ${binding.theme}`;
        statusDiv.style.color = "#4caf50";
    } else {
        statusDiv.textContent = "❌ 当前角色未绑定";
        statusDiv.style.color = "gray";
    }
}

// ========= 绑定/解绑核心 =========
function bindCurrentSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) {
        toastr.warning("请先打开一个角色的聊天框！");
        return;
    }

    // 获取酒馆当前选中的背景和主题
    const bgSelect = document.getElementById('bg_select');
    const themeSelect = document.getElementById('theme_select');
    const currentBg = bgSelect ? bgSelect.value : '';
    const currentTheme = themeSelect ? themeSelect.value : '';

    // 读已有绑定（避免覆盖 image/photo）
    const existing = (ST_GLOBALS.extension_settings[settingsPath] && ST_GLOBALS.extension_settings[settingsPath][avatar]) || {};
    ST_GLOBALS.extension_settings[settingsPath][avatar] = {
        ...existing,
        bg: currentBg,
        theme: currentTheme,
    };
    ST_GLOBALS.saveSettingsDebounced && ST_GLOBALS.saveSettingsDebounced();
    updateStatusUI();
    toastr.success("角色主题与背景绑定成功！");
}

function unbindCurrentSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return;

    if (ST_GLOBALS.extension_settings[settingsPath] && ST_GLOBALS.extension_settings[settingsPath][avatar]) {
        delete ST_GLOBALS.extension_settings[settingsPath][avatar];
        ST_GLOBALS.saveSettingsDebounced && ST_GLOBALS.saveSettingsDebounced();
        updateStatusUI();
        toastr.info("角色主题绑定已解除！");
    }
}

function applyBoundSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return;

    const binding = ST_GLOBALS.extension_settings[settingsPath] && ST_GLOBALS.extension_settings[settingsPath][avatar];
    if (binding) {
        const bgSelect = document.getElementById('bg_select');
        const themeSelect = document.getElementById('theme_select');

        let changed = false;

        if (binding.bg && bgSelect && bgSelect.value !== binding.bg) {
            bgSelect.value = binding.bg;
            bgSelect.dispatchEvent(new Event('change', { bubbles: true })); 
            changed = true;
        }

        if (binding.theme && themeSelect && themeSelect.value !== binding.theme) {
            themeSelect.value = binding.theme;
            themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            changed = true;
        }

        if (changed) {
            console.log(`[Theme Binder] 已自动切换为 ${avatar} 的专属背景和主题`);
        }
    }
    updateStatusUI();
}

// ========= 弹窗（Modal） =========
let imageDataUrlPreview = null;  // 主图的临时预览（本地上传）
let photoDataUrlPreview = null;  // 照片的临时预览（本地上传）

function setModalVisibility(show) {
    const modal = document.getElementById('ctb_modal');
    if (!modal) return;
    if (show) {
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    } else {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }
}

function updateModalStatus() {
    const el = document.getElementById('ctb_modal_status');
    if (!el) return;
    const avatar = getCurrentCharacterAvatar();
    const bind = getCurrentBinding();
    if (!avatar) {
        el.textContent = '请先打开一个角色的聊天框';
        return;
    }
    if (bind && (bind.bg || bind.theme)) {
        el.textContent = `✅ 已绑定 - 背景: ${bind.bg || '-'} | 主题: ${bind.theme || '-'}`;
    } else {
        el.textContent = '❌ 当前角色未绑定';
    }
}

function setImagePreview(src) {
    const img = document.getElementById('ctb_image_preview');
    const clearBtn = document.getElementById('ctb_image_clear');
    if (!img) return;
    if (src) {
        img.src = src;
        img.style.display = 'block';
        if (clearBtn) clearBtn.style.display = '';
    } else {
        img.src = '';
        img.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
    }
}

function setPhotoPreview(src) {
    const img = document.getElementById('ctb_photo_preview');
    const clearBtn = document.getElementById('ctb_photo_clear');
    if (!img) return;
    if (src) {
        img.src = src;
        img.style.display = 'block';
        if (clearBtn) clearBtn.style.display = '';
    } else {
        img.src = '';
        img.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function refreshModalUIFromBinding() {
    updateModalStatus();
    const bind = getCurrentBinding();

    // 主图
    const imgSrcBg = document.getElementById('ctb_image_source_bg');
    const imgSrcUp = document.getElementById('ctb_image_source_upload');
    const imgFile = document.getElementById('ctb_image_file');
    if (imgSrcBg && imgSrcUp && imgFile) {
        imgSrcBg.checked = false;
        imgSrcUp.checked = false;
        imageDataUrlPreview = null;
        imgFile.value = '';
        imgFile.style.display = 'none';
    }

    if (bind && bind.image) {
        if (bind.image.source === 'bg') {
            if (imgSrcBg) imgSrcBg.checked = true;
            setImagePreview(bind.image.url || '');
        } else if (bind.image.source === 'upload') {
            if (imgSrcUp) imgSrcUp.checked = true;
            imageDataUrlPreview = bind.image.dataUrlBase64 || null;
            setImagePreview(imageDataUrlPreview);
            if (imgFile) imgFile.style.display = '';
        } else {
            setImagePreview(null);
        }
    } else {
        setImagePreview(null);
    }

    // 照片
    const photoFile = document.getElementById('ctb_photo_file');
    if (photoFile) photoFile.value = '';
    photoDataUrlPreview = bind && bind.photo && bind.photo.dataUrlBase64 ? bind.photo.dataUrlBase64 : null;
    setPhotoPreview(photoDataUrlPreview);
}

function openModal() {
    setModalVisibility(true);
    refreshModalUIFromBinding();
}

function closeModal() {
    setModalVisibility(false);
}

function saveModalData() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) {
        toastr.warning('请先打开一个角色的聊天框！');
        return;
    }

    let binding = (ST_GLOBALS.extension_settings[settingsPath] && ST_GLOBALS.extension_settings[settingsPath][avatar]) || {};

    // 主图来源
    const imgSrcBg = document.getElementById('ctb_image_source_bg');
    const imgSrcUp = document.getElementById('ctb_image_source_upload');
    const bgSelect = document.getElementById('bg_select');

    const image = { source: null };
    if (imgSrcBg && imgSrcBg.checked) {
        image.source = 'bg';
        image.url = bgSelect ? bgSelect.value : (binding.bg || '');
        image.dataUrlBase64 = undefined;
    } else if (imgSrcUp && imgSrcUp.checked) {
        if (imageDataUrlPreview) {
            image.source = 'upload';
            image.dataUrlBase64 = imageDataUrlPreview;
            image.url = undefined;
        } else {
            image.source = null;
        }
    } else {
        image.source = null;
    }

    // 照片（仅上传）
    const photo = { source: null };
    if (photoDataUrlPreview) {
        photo.source = 'upload';
        photo.dataUrlBase64 = photoDataUrlPreview;
    }

    binding.image = image;
    binding.photo = photo;
    ST_GLOBALS.extension_settings[settingsPath][avatar] = binding;
    ST_GLOBALS.saveSettingsDebounced && ST_GLOBALS.saveSettingsDebounced();
    toastr.success('已保存图片/照片设置');
    updateModalStatus();
    updateStatusUI();
}

// ========= 启动 =========
jQuery(async () => {
    console.info('[Theme Binder] 初始化开始');
    await waitForSTGlobals();
    if (!ST_GLOBALS.extension_settings) {
        console.error('[Theme Binder] 未检测到 extension_settings，全局初始化失败');
        return;
    }
    if (!ST_GLOBALS.extension_settings[settingsPath]) {
        ST_GLOBALS.extension_settings[settingsPath] = {};
    }

    // 加载并注入设置页 HTML
    const folder = (ST_GLOBALS.getContext && ST_GLOBALS.getContext().extensionFolderPath) || '';
    try {
        const html = await $.get(`${folder}/index.html`);
        $("#extensions_settings").append(html);
    } catch (e) {
        console.error('[Theme Binder] 载入 index.html 失败', e);
        return;
    }

    // --- 在左侧扩展菜单中注入一个“角色主题绑定”按钮（若能找到容器） ---
    try {
        const sidebarSelectors = [
            '#extensions-settings-button',
            '#extensions-settings-buttons',
            '#extensions_settings_button',
            '#extensions_settings_buttons',
            '.extensions-settings-button',
            '.extensions-settings-buttons',
            '#extensions_left',
            '.extensions__left',
        ];
        let sidebar = null;
        for (const sel of sidebarSelectors) {
            const el = document.querySelector(sel);
            if (el) { sidebar = el; break; }
        }
        const ensureSidebarItem = () => {
            if (document.getElementById('ctb_sidebar_btn')) return; // 已存在
            if (sidebar) {
                const btn = document.createElement('button');
                btn.id = 'ctb_sidebar_btn';
                btn.className = 'menu_button';
                btn.textContent = '角色主题绑定';
                btn.style.width = '100%';
                btn.style.margin = '4px 0';
                btn.addEventListener('click', () => {
                    const section = document.getElementById('ctb_section');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    updateStatusUI();
                    updateModalStatus();
                });
                sidebar.appendChild(btn);
            } else {
                // 找不到左侧容器：在扩展设置上方放置一个粘性按钮作为降级方案
                if (!document.getElementById('ctb_sidebar_fallback')) {
                    const host = document.getElementById('extensions_settings');
                    const fallback = document.createElement('div');
                    fallback.id = 'ctb_sidebar_fallback';
                    fallback.style.position = 'sticky';
                    fallback.style.top = '6px';
                    fallback.style.zIndex = '2';
                    fallback.style.marginBottom = '6px';
                    const btn2 = document.createElement('button');
                    btn2.className = 'menu_button';
                    btn2.textContent = '角色主题绑定';
                    btn2.addEventListener('click', () => {
                        const section = document.getElementById('ctb_section');
                        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        updateStatusUI();
                        updateModalStatus();
                    });
                    fallback.appendChild(btn2);
                    if (host) host.prepend(fallback);
                }
            }
        };
        ensureSidebarItem();
        // 某些主题会延迟渲染侧栏，延迟重试一次
        setTimeout(ensureSidebarItem, 800);
    } catch (e) {
        console.warn('[Theme Binder] 侧栏按钮注入失败（非致命）', e);
    }

    // --- 使用 MutationObserver 更稳健地往左栏插入按钮（克隆样式） ---
    (function setupLeftMenuObserver() {
        const scope = document.body; // 作用域扩大到 body，以适配不同主题将左栏渲染在外部容器
        if (!scope) return;

        let lastTry = 0;
        const candidateTexts = [
            '酒馆助手','提示词模板','快速回复','QR助手','聊天翻译','图片描述','总结','正则','向量存储',
            '角色表情','图像生成','扩展程序'
        ];

        function findElementByTextFuzzy(container, text) {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
            while (walker.nextNode()) {
                const el = walker.currentNode;
                if (!el) continue;
                const t = (el.textContent || '').trim();
                if (t && t.includes(text)) return el;
            }
            return null;
        }

        function chooseInsertParent(fromEl) {
            if (!fromEl) return null;
            const parent = fromEl.closest('ul,ol,nav,section,div');
            return parent || fromEl.parentElement;
        }

        function createSidebarItemLike(sampleEl) {
            // 针对 inline-drawer 风格：
            const inlineDrawer = sampleEl && sampleEl.classList && sampleEl.classList.contains('inline-drawer-toggle');
            if (inlineDrawer) {
                const el = document.createElement('div');
                el.id = 'ctb_sidebar_btn';
                el.className = 'inline-drawer-toggle inline-drawer-header';
                el.innerHTML = `
                    <div style="display:flex; align-items:center;">
                        <b>角色主题绑定</b>
                    </div>
                    <div class="inline-drawer-icon fa-solid interactable down up fa-circle-chevron-up" tabindex="0" role="button"></div>
                `;
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => {
                    const section = document.getElementById('ctb_section');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    updateStatusUI();
                    updateModalStatus();
                });
                return el;
            }
            // 默认按钮风格：
            const tag = 'BUTTON';
            const el = document.createElement(tag);
            el.id = 'ctb_sidebar_btn';
            el.className = 'menu_button';
            el.textContent = '角色主题绑定';
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                const section = document.getElementById('ctb_section');
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                updateStatusUI();
                updateModalStatus();
            });
            return el;
        }

        function tryInsert() {
            if (document.getElementById('ctb_sidebar_btn')) return true; // 已存在
            const now = Date.now();
            if (now - lastTry < 500) return false; // 节流
            lastTry = now;

            let sample = null;
            for (const txt of candidateTexts) {
                sample = findElementByTextFuzzy(scope, txt);
                if (sample) break;
            }
            if (!sample) {
                console.debug('[Theme Binder] 左栏样本项未找到，等待渲染…');
                return false;
            }

            // 优先使用 inline-drawer 容器
            const sampleContainer = sample.closest('.inline-drawer-toggle.inline-drawer-header') || sample;
            const parent = chooseInsertParent(sampleContainer);
            if (!parent) {
                console.debug('[Theme Binder] 左栏父容器未确定，稍后重试');
                return false;
            }
            const newEl = createSidebarItemLike(sampleContainer);
            try {
                parent.insertBefore(newEl, sampleContainer); // 插到一条已知项之前，更容易被看到
                console.info('[Theme Binder] 已在左栏插入按钮（Observer 模式）');
                return true;
            } catch (err) {
                console.warn('[Theme Binder] 左栏插入失败，将继续观察', err);
                return false;
            }
        }

        // 先尝试一次
        if (!tryInsert()) {
            const mo = new MutationObserver(() => {
                if (tryInsert()) mo.disconnect();
            });
            mo.observe(scope, { childList: true, subtree: true });
        }
    })();

    // 设置页按钮事件
    const bindBtn = document.getElementById('ctb_bind_btn');
    const unbindBtn = document.getElementById('ctb_unbind_btn');
    if (bindBtn) bindBtn.addEventListener('click', bindCurrentSettings);
    if (unbindBtn) unbindBtn.addEventListener('click', unbindCurrentSettings);

    // 入口与弹窗控制
    const openBtn = document.getElementById('ctb_open_modal_btn');
    const closeBtn = document.getElementById('ctb_modal_close');
    const closeBtnX = document.getElementById('ctb_modal_close_btn');
    const backdrop = document.getElementById('ctb_modal_backdrop');
    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeBtnX) closeBtnX.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);

    // 弹窗内绑定/解绑
    const modalBindBtn = document.getElementById('ctb_modal_bind_btn');
    const modalUnbindBtn = document.getElementById('ctb_modal_unbind_btn');
    if (modalBindBtn) modalBindBtn.addEventListener('click', () => { bindCurrentSettings(); updateModalStatus(); });
    if (modalUnbindBtn) modalUnbindBtn.addEventListener('click', () => { unbindCurrentSettings(); refreshModalUIFromBinding(); });

    // 主图来源与文件
    const imgSrcBg = document.getElementById('ctb_image_source_bg');
    const imgSrcUp = document.getElementById('ctb_image_source_upload');
    const imgFile = document.getElementById('ctb_image_file');
    const imgClear = document.getElementById('ctb_image_clear');

    if (imgSrcBg) imgSrcBg.addEventListener('change', () => {
        if (imgSrcBg.checked) {
            const bgSelect = document.getElementById('bg_select');
            const url = bgSelect ? bgSelect.value : '';
            setImagePreview(url);
            imageDataUrlPreview = null;
            if (imgFile) imgFile.style.display = 'none';
        }
    });
    if (imgSrcUp) imgSrcUp.addEventListener('change', () => {
        if (imgSrcUp.checked) {
            if (imgFile) imgFile.style.display = '';
            setImagePreview(imageDataUrlPreview);
        }
    });
    if (imgFile) imgFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        // 基本校验（大小与类型）
        if (!file.type.startsWith('image/')) {
            toastr.warning('请选择图片文件');
            return;
        }
        const MAX = 2 * 1024 * 1024; // 2MB 上限，避免设置体积过大
        if (file.size > MAX) {
            toastr.warning('图片过大（>2MB），请压缩后再上传');
            return;
        }
        try {
            const dataUrl = await readFileAsDataURL(file);
            imageDataUrlPreview = dataUrl;
            setImagePreview(dataUrl);
            if (imgSrcUp) imgSrcUp.checked = true;
        } catch (err) {
            console.error('[Theme Binder] 读取图片失败', err);
            toastr.error('读取图片失败');
        }
    });
    if (imgClear) imgClear.addEventListener('click', () => {
        imageDataUrlPreview = null;
        setImagePreview(null);
        if (imgFile) imgFile.value = '';
        if (imgSrcBg) imgSrcBg.checked = false;
        if (imgSrcUp) imgSrcUp.checked = false;
        if (imgFile) imgFile.style.display = 'none';
    });

    // 照片上传与清除
    const photoFile = document.getElementById('ctb_photo_file');
    const photoClear = document.getElementById('ctb_photo_clear');
    if (photoFile) photoFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toastr.warning('请选择图片文件');
            return;
        }
        const MAX = 2 * 1024 * 1024; // 2MB 上限
        if (file.size > MAX) {
            toastr.warning('照片过大（>2MB），请压缩后再上传');
            return;
        }
        try {
            const dataUrl = await readFileAsDataURL(file);
            photoDataUrlPreview = dataUrl;
            setPhotoPreview(dataUrl);
        } catch (err) {
            console.error('[Theme Binder] 读取照片失败', err);
            toastr.error('读取照片失败');
        }
    });
    if (photoClear) photoClear.addEventListener('click', () => {
        photoDataUrlPreview = null;
        setPhotoPreview(null);
        if (photoFile) photoFile.value = '';
    });

    // 保存
    const saveBtn = document.getElementById('ctb_modal_save');
    if (saveBtn) saveBtn.addEventListener('click', saveModalData);

    // 监听聊天切换（自动应用绑定 + 更新状态）
    eventSource.on(event_types.CHAT_CHANGED, () => {
        applyBoundSettings();
        updateModalStatus();
    });

    // 初始化状态
    updateStatusUI();
    updateModalStatus();
});
