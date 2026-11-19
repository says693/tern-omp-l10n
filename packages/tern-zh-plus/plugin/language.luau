-- Display-only language gate, shared with the omp extension.
local home = assert(tern.getenv("USERPROFILE"), "USERPROFILE is missing")
local path = home .. "/.omp/agent/ui-language.txt"
local function readLanguage()
    local value = tern.fs.read(path, 64):match("^%s*(.-)%s*$")
    assert(value == "zh-CN" or value == "en", "Invalid ui-language.txt: expected zh-CN or en")
    return value
end

local current = readLanguage()
local sheets = {}
local running = true
local language = {}

function language.isChinese()
    return current == "zh-CN"
end

function language.css(name, source)
    sheets[name] = source
    tern.css(name, language.isChinese() and source or "")
end

local function apply(value)
    if current == value then return end
    current = value
    for name, source in pairs(sheets) do
        tern.css(name, language.isChinese() and source or "")
    end
    tern.chrome.refresh()
end

local function setLanguage(value, cx)
    tern.fs.write(path, value .. "\n")
    apply(value)
    cx:toast("success", value == "en" and "English UI enabled" or "已切换为简体中文",
        value == "en" and "Reopen an existing omp settings panel to refresh it." or "已打开的 omp 设置页请关闭后重开。")
end

tern.command({
    id = "language-zh",
    title = "语言：简体中文 / Language: Chinese",
    group = "Language / 语言",
    run = function(cx) setLanguage("zh-CN", cx) end,
})
tern.command({
    id = "language-en",
    title = "Language: English / 语言：英语",
    group = "Language / 语言",
    run = function(cx) setLanguage("en", cx) end,
})
tern.command({
    id = "language-toggle",
    title = "切换中英文 / Toggle Chinese-English",
    group = "Language / 语言",
    run = function(cx) setLanguage(language.isChinese() and "en" or "zh-CN", cx) end,
})

local function poll()
    if not running then return end
    apply(readLanguage())
    tern.timer(750, poll)
end
tern.timer(750, poll)
tern.on("unload", function() running = false end)

language.css("base", tern.fs.read(tern.plugin.dir .. "/base.css", 65536))
language.css("navigation", tern.fs.read(tern.plugin.dir .. "/settings-navigation.css", 65536))
return language
