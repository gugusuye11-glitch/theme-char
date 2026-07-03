import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";

// 这里写死你的仓库名称，保证任何版本的酒馆都能找到文件
const extensionName = "theme-char"; 
const settingsPath = "char_theme_binder";

// 初始化设置数据
if (!extension_settings[settingsPath]) {
    extension_settings[settingsPath] = {};
}

// 获取当前角色的头像文件名（作为唯一ID）
function getCurrentCharacterAvatar() {
    const context = getContext();
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    return null;
}

// 获取当前角色名字
function getCurrentCharacterName() {
    const context = getContext();
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        return context.characters[context.characterId].name;
    }
    return null;
}

// 刷新下拉菜单选项（从酒馆原生菜单里克隆过来）
function populateDropdowns() {
    $('#ctb_bg_select').empty();
    $('#ctb_theme_select').empty();
    $('#bg_select option').clone().appendTo('#ctb_bg_select');
    $('#theme_select option').clone().appendTo('#ctb_theme_select');
}

// 更新扩展面板中的 UI 显示
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
        // 如果有绑定记录，下拉框显示绑定的值
        $('#ctb_bg_select').val(binding.bg);
        $('#ctb_theme_select').val(binding.theme);
        if(statusDiv) {
            statusDiv.textContent = "当前状态：✅ 已绑定专属主题";
            statusDiv.style.color = "#4caf50";
        }
    } else {
        // 如果没有绑定，下拉框显示酒馆当前正在使用的值
        $('#ctb_bg_select').val($('#bg_select').val());
        $('#ctb_theme_select').val($('#theme_select').val());
        if(statusDiv) {
            statusDiv.textContent = "当前状态：❌ 未绑定";
            statusDiv.style.color = "gray";
        }
    }
}

// 应用绑定好的主题和背景（切换聊天时触发）
function applyBoundSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return;

    const binding = extension_settings[settingsPath][avatar];
    if (binding) {
        const bgSelect = document.getElementById('bg_select');
        const themeSelect = document.getElementById('theme_select');

        // 如果背景不同，则切换背景
        if (binding.bg && bgSelect.value !== binding.bg) {
            bgSelect.value = binding.bg;
            bgSelect.dispatchEvent(new Event('change', { bubbles: true })); 
        }

        // 如果主题不同，则切换主题
        if (binding.theme && themeSelect.value !== binding.theme) {
            themeSelect.value = binding.theme;
            themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

// 初始化加载
jQuery(async () => {
    // 兼容所有酒馆版本的绝对路径写法
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
    
    try {
        const html = await $.get(`${extensionFolderPath}/index.html`);
        // 将界面添加到酒馆扩展面板的左侧列表中
        $("#extensions_settings").append(html);
    } catch (error) {
        console.error("[Theme Binder] 界面加载失败，请检查路径:", error);
        return;
    }

    // 绑定【保存】按钮事件
    $('#ctb_save_btn').on('click', () => {
        const avatar = getCurrentCharacterAvatar();
        if (!avatar) {
            toastr.warning("请先在主界面点开一个角色的聊天框！");
            return;
        }
        
        // 记录在插件下拉框中选中的值
        extension_settings[settingsPath][avatar] = {
            bg: $('#ctb_bg_select').val(),
            theme: $('#ctb_theme_select').val()
        };
        saveSettingsDebounced();
        
        // 立即应用并刷新 UI
        applyBoundSettings();
        updateExtensionUI();
        toastr.success(`已成功为角色绑定专属主题！`);
    });

    // 绑定【解除绑定】按钮事件
    $('#ctb_unbind_btn').on('click', () => {
        const avatar = getCurrentCharacterAvatar();
        if (!avatar) return;

        if (extension_settings[settingsPath][avatar]) {
            delete extension_settings[settingsPath][avatar];
            saveSettingsDebounced();
            updateExtensionUI();
            toastr.info("角色主题绑定已解除！");
        }
    });

    // 监听：当用户在面板点击折叠菜单时，刷新一次下拉框
    $(document).on('click', '.inline-drawer-toggle', function() {
        if ($(this).find('b').text() === '角色主题绑定') {
            updateExtensionUI();
        }
    });

    // 监听：当点开一个角色的聊天框时
    eventSource.on(event_types.CHAT_CHANGED, () => {
        applyBoundSettings();
        updateExtensionUI();
    });
});
