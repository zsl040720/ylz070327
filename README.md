# 叶力展070327

一个离线运行的 **Wallpaper Engine 交互相册壁纸**。以三张宽屏场景为背景，保留四张独立相片，并加入倒数日、系统音频频谱和可调氛围动效。

**[下载完整安装包](https://github.com/zsl040720/ylz070327/releases/latest)** · 解压后双击 `一键应用.cmd`，需先安装 Wallpaper Engine。

## 场景预览

### 花间相册
![花间相册](previews/forest.jpg)

### 漫画
![漫画场景](previews/manga.jpg)

### 地铁
![地铁场景](previews/metro.jpg)

以上是静态效果预览，不代表当前设备已在 Wallpaper Engine 中播放，也不作为系统音频实播证明。

## 功能

- **四张独立相片**：原照片使用 `contain` 完整显示，不裁切、不拉伸。相片、纸边、阴影和位置一起过渡。
- **点击交换壁纸**：仅第一张和第三张卡片可点击；被点卡片与当前背景交换图片。相机照和长发照不可点击，但参与整体移动。
- **两种圆形切换**：漫画与地铁互切时，旧背景逆圆收拢到点击的相片；涉及花间相册的切换仍从点击位置圆形外扩。过渡时长可调。
- **同步主题变化**：倒数日与音频柱跟随背景圆形边界换色。漫画场景使用本地打包的中文漫画手写字体，地铁场景使用蓝灰/深青配色。
- **循环倒数日**：事件名称、目标本地日期时间可设置，支持每隔 N 天重复，例如每 7 天一次。
- **真实系统音频频谱**：使用 Wallpaper Engine 提供的系统音频回调；不请求麦克风，不上传音频，也不在正式壁纸中生成假律动。普通浏览器没有宿主音频回调时只显示安静基线。
- **可调氛围**：花瓣开关、数量、速度；向下、左斜向下、右斜向下、随机四种方向；另有浮尘、柔光、微光星尘和鼠标视差。花瓣速度为 0 时静止。
- **屏幕适配**：基准背景为 2560×1440，默认完整画面适配；可改为铺满显示，不同比例屏幕的铺满模式会裁切背景。

## 使用方法

### 环境

- Windows，已安装并可正常启动 **Wallpaper Engine**。本仓库不包含 Wallpaper Engine 本体。
- 保留完整目录结构，不要只下载 `index.html` 或单张背景。

### 解压后一键应用

1. 下载仓库 ZIP，或使用单独提供的发布压缩包，并**完整解压**。
2. 进入包含 `Install-Wallpaper.ps1`、`一键应用.cmd` 和 `project/` 的目录。
3. 双击 **`一键应用.cmd`**。
4. 在 Wallpaper Engine 的壁纸属性中设置倒数日、频谱、花瓣与过渡效果。

启动器默认查找 `D:\Steam\steamapps\common\wallpaper_engine`。安装位置不同时，可在此目录打开 PowerShell，指定实际路径：

```powershell
.\一键应用.cmd -EnginePath "E:\SteamLibrary\steamapps\common\wallpaper_engine"
```

脚本会复制工程到 Wallpaper Engine 的本地项目目录；已有不同内容的同名项目不会被直接覆盖。应用操作针对主屏幕，并尝试保存原壁纸记录到本机 `rollback/`。恢复时双击 **`恢复原壁纸.cmd`**；若安装位置不同，同样传入 `-EnginePath`。保留本机的 `rollback/`，不要把它上传或分享。

只复制工程、不启动或切换壁纸：

```powershell
.\一键应用.cmd -EnginePath "E:\SteamLibrary\steamapps\common\wallpaper_engine" -InstallOnly
```

也可在 Wallpaper Engine 中打开 `project/project.json` 所在的本地 Web 壁纸工程。直接用普通浏览器打开只能预览页面，不能代替桌面应用及系统音频宿主。

详细参数和恢复说明见 [使用说明.txt](使用说明.txt)。

## 文件结构

```text
project/                  Wallpaper Engine 工程与本地素材
  assets/backgrounds/     三个场景背景及保留的原背景
  assets/photos/          五张原始相片
  assets/fonts/           本地漫画字体、来源与 OFL 许可
  widgets/                相册、倒数日、频谱与主题模块
previews/                 三个场景的静态预览
Install-Wallpaper.ps1     本地安装、应用与恢复脚本
一键应用.cmd               应用入口
恢复原壁纸.cmd             恢复入口
使用说明.txt               详细使用说明
素材与生成说明.txt          素材来源与图像处理记录
```

安装产生的回滚记录、日志、个人配置、令牌与验证文件不属于发布内容；仓库不附带机器验收记录或本机 Wallpaper Engine 配置。ZIP 发布包也不纳入版本库。

## 素材、字体与授权边界

- 五张相册原片保留原文件内容；宽屏背景包含 AI 扩展、去除烘焙相册或高清重建处理。**AI 增强不等于恢复原始光学细节**，生成背景也不承诺与原片逐像素一致。
- 处理记录见 [素材与生成说明.txt](素材与生成说明.txt) 与 [素材来源记录](project/assets/provenance.json)。图片中已有的黑边、拍摄界面或水印属于原图内容，并非新增的 CSS 相框裁切。
- 漫画字体为 **站酷快乐体（ZCOOL KuaiLe）**，本地字体文件按 **SIL Open Font License 1.1** 使用和分发；保留了[许可全文](project/assets/fonts/OFL-ZCOOL-KuaiLe.txt)、版权信息及[来源记录](project/assets/fonts/SOURCE-ZCOOL-KuaiLe.json)。
- **本仓库未统一授予照片、人物肖像、美术素材的再分发、改作或商用授权。公开可访问不等于取得这些许可。** 复用相关素材前需分别取得权利人的许可；字体继续遵循其自身 OFL 条款。
- 仓库未附加覆盖全部内容的统一开源许可证，不能把字体的 OFL 解释为对照片或其他文件的授权。

