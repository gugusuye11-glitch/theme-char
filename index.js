import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";

// 插件的内部名称
const extensionName = "character-theme-binder";
// 存储绑定数据的路径
const settingsPath = "char_theme_binder";

// 初始化设置数据结构
if (!extension_settings[settingsPath]) {
    extension_settings[settingsPath] = {};
}

// 获取当前角色的唯一标识符 (使用 avatar 文件名最安全，因为名字可能会改)
function getCurrentCharacterAvatar() {
    const context = getContext();
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    return null; // 群聊或者没选角色时返回null
}

// 更新UI状态显示
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
    if (binding) {
        statusDiv.textContent = `✅ 已绑定 - 背景: ${binding.bg} | 主题: ${binding.theme}`;
        statusDiv.style.color = "#4caf50";
    } else {
        statusDiv.textContent = "❌ 当前角色未绑定";
        statusDiv.style.color = "gray";
    }
}

// 绑定操作
function bindCurrentSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) {
        toastr.warning("请先打开一个角色的聊天框！");
        return;
    }

    // 获取酒馆当前选中的背景和主题
    const currentBg = document.getElementById('bg_select').value;
    const currentTheme = document.getElementById('theme_select').value;

    // 保存到扩展设置中
    extension_settings[settingsPath][avatar] = {
        bg: currentBg,
        theme: currentTheme
    };
    saveSettingsDebounced();
    
    updateStatusUI();
    toastr.success("角色主题与背景绑定成功！");
}

// 解除绑定操作
function unbindCurrentSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return;

    if (extension_settings[settingsPath][avatar]) {
        delete extension_settings[settingsPath][avatar];
        saveSettingsDebounced();
        updateStatusUI();
        toastr.info("角色主题绑定已解除！");
    }
}

// 应用绑定好的主题和背景
function applyBoundSettings() {
    const avatar = getCurrentCharacterAvatar();
    if (!avatar) return;

    const binding = extension_settings[settingsPath][avatar];
    if (binding) {
        const bgSelect = document.getElementById('bg_select');
        const themeSelect = document.getElementById('theme_select');

        let changed = false;

        // 如果绑定的背景存在，并且和当前的背景不一样
        if (binding.bg && bgSelect.value !== binding.bg) {
            bgSelect.value = binding.bg;
            // 触发酒馆原生的 change 事件，让酒馆自己去加载背景图片
            bgSelect.dispatchEvent(new Event('change', { bubbles: true })); 
            changed = true;
        }

        // 如果绑定的主题存在，并且和当前的不一样
        if (binding.theme && themeSelect.value !== binding.theme) {
            themeSelect.value = binding.theme;
            // 触发酒馆原生的 change 事件，让酒馆自己去加载CSS主题
            themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            changed = true;
        }

        if (changed) {
            console.log(`[Theme Binder] 已自动切换为 ${avatar} 的专属背景和主题`);
        }
    }
    updateStatusUI();
}

// 插件入口函数
jQuery(async () => {
    // 1. 加载 HTML UI
    const html = await $.get(`${getContext().extensionFolderPath}/index.html`);
    $("#extensions_settings").append(html);

    // 2. 绑定按钮点击事件
    document.getElementById('ctb_bind_btn').addEventListener('click', bindCurrentSettings);
    document.getElementById('ctb_unbind_btn').addEventListener('click', unbindCurrentSettings);

    // 3. 监听聊天切换事件 (当点开一个角色时触发)
    eventSource.on(event_types.CHAT_CHANGED, () => {
        applyBoundSettings();
    });

    // 4. 初始化UI状态
    updateStatusUI();
});
