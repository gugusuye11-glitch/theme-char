import { extension_settings, getContext } from "../../../extensions.js";

const settingsPath = "char_theme_binder";

// 初始化设置数据
if (!extension_settings[settingsPath]) {
    extension_settings[settingsPath] = {};
}

// 终极防弹版：直接将 HTML 界面写进 JS 里，彻底告别文件路径找不到的报错！
const pluginHtml = `
<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>🎨 角色主题绑定 (Theme Binder)</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content" style="display: none; padding: 10px;">
        <div id="ctb_char_name" style="font-weight: bold; margin-bottom: 10px; color: var(--SmartThemeBodyColor);">当前未打开任何角色</div>
        
        <label for="ctb_bg_select">选择绑定的背景:</label>
        <select id="ctb_bg_select" class="text_pole" style="width: 100%; margin-bottom: 10px;"></select>

        <label for="ctb_theme_select">选择绑定的主题:</label>
        <select id="ctb_theme_select" class="text_pole" style="width: 100%; margin-bottom: 15px;"></select>

        <div id="ctb_current_status" style="color: gray; margin-bottom: 10px; font-size: 0.9em;">
            当前状态：未绑定
        </div>

        <button id="ctb_save_btn" class="menu_button">💾 保存/覆盖绑定</button>
        <button id="ctb_unbind_btn" class="menu_button" style="margin-top: 5px;">❌ 解除绑定</button>
    </div>
</div>
`;

function getCurrentCharacterAvatar() {
    const context = getContext();
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    return null;
}

function getCurrentCharacterName() {
    const context = getContext();
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        return context.characters[context.characterId].name;
    }
    return null;
}

function populateDropdowns() {
    $('#ctb_bg_select').empty();
    $('#ctb_theme_select').empty();
    $('#bg_select option').clone().appendTo('#ctb_bg_select');
    $('#theme_select option').clone().appendTo('#ctb_theme_select');
}

function updateExtensionUI() {
    populateDropdowns();
    
    const avatar = getCurrentCharacterAvatar();
    const charName = getCurrentCharacterName();
    const charNameDiv = document.getElementById('ctb_char_name');
    const statusDiv = document.getElementById('ctb_current_status');
    
    if (!avatar) {
        if(charNameDiv) charNameDiv.textContent = "当前未打开任何角色";
        if(statusDiv) {
            statusDiv.textContent = "当前状态：请先点击一个角色";
            statusDiv.style.color = "yellow";
        }
        return;
    }

    if(charNameDiv) charNameDiv.textContent = `当前选中角色: ${charName}`;

    const binding = extension_settings[settingsPath][avatar];
    if (binding) {
        $('#ctb_bg_select').val(binding.bg);
        $('#ctb_theme_select').val(binding.theme);
        if(statusDiv) {
            statusDiv.textContent = "当前状态：✅ 已绑定专属主题";
            statusDiv.style.color = "#4caf50";
        }
    } else {
        $('#ctb_bg_select').val($('#bg_select').val());
        $('#ctb_theme_select').val($('#theme_select').val());
        if(statusDiv) {
            statusDiv.textContent = "当前状态：❌ 未绑定";
            statusDiv.style.color = "gray";
        }
    }
}

function applyBoundSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return;

    const binding = extension_settings[settingsPath][avatar];
    if (binding) {
        const bgSelect = document.getElementById('bg_select');
        const themeSelect = document.getElementById('theme_select');

        if (binding.bg && bgSelect.value !== binding.bg) {
            bgSelect.value = binding.bg;
            bgSelect.dispatchEvent(new Event('change', { bubbles: true })); 
        }
        if (binding.theme && themeSelect.value !== binding.theme) {
            themeSelect.value = binding.theme;
            themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

// 兼容全局的保存方法
function triggerSave() {
    if (typeof saveSettingsDebounced === 'function') {
        saveSettingsDebounced();
    }
}

jQuery(async () => {
    console.log("[Theme Binder] 插件开始加载...");
    
    // 直接注入 HTML 字符串，完全绕过文件读取
    if ($("#extensions_settings").length) {
        $("#extensions_settings").append(pluginHtml);
    } else {
        console.error("[Theme Binder] 找不到扩展面板容器！");
        return;
    }

    $('#ctb_save_btn').on('click', () => {
        const avatar = getCurrentCharacterAvatar();
        if (!avatar) {
            toastr.warning("请先在主界面点开一个角色的聊天框！");
            return;
        }
        
        extension_settings[settingsPath][avatar] = {
            bg: $('#ctb_bg_select').val(),
            theme: $('#ctb_theme_select').val()
        };
        triggerSave();
        applyBoundSettings();
        updateExtensionUI();
        toastr.success(`已成功为角色绑定专属主题！`);
    });

    $('#ctb_unbind_btn').on('click', () => {
        const avatar = getCurrentCharacterAvatar();
        if (!avatar) return;

        if (extension_settings[settingsPath][avatar]) {
            delete extension_settings[settingsPath][avatar];
            triggerSave();
            updateExtensionUI();
            toastr.info("角色主题绑定已解除！");
        }
    });

    $(document).on('click', '.inline-drawer-toggle', function() {
        if ($(this).find('b').text().includes('角色主题绑定')) {
            updateExtensionUI();
        }
    });

    // 监听聊天切换事件（兼容所有版本）
    if (typeof eventSource !== 'undefined') {
        eventSource.on('chat_changed', () => {
            applyBoundSettings();
            updateExtensionUI();
        });
    }
});
