# 小说封面视觉风格库
各题材网文封面视觉风格定义，用于构建 GPT-Image-2 英文提示词。

---

## 平台风格

### 番茄小说

视觉：高饱和高对比 / 人物占60%+面部清晰 / 书名大粗有光效(金/红/白) / 大头贴构图+华丽背景
关键词：`vibrant saturated colors, eye-catching bold design, character portrait dominating frame, mass-market novel cover style, high contrast`

### 起点

视觉：细腻精致偏写实插画 / 构图讲究层次丰富 / 书名偏传统毛笔楷体 / 色彩沉稳 / 人物场景均衡有电影感
关键词：`polished refined illustration, detailed cinematic composition, epic atmospheric, mature sophisticated style, premium quality`

### 晋江

视觉：柔和色调(粉/紫/浅蓝/暖白) / 唯美画风大眼精致五官 / 花瓣光斑丝绸珠宝装饰 / 居中对称画面干净 / 书名优雅行书细圆
关键词：`dreamy ethereal aesthetic, soft pastel tones, elegant romantic, delicate beauty, flower petals and bokeh`

### 知乎盐言

视觉：大量留白极简 / 冷淡色(灰/蓝/白/暗色) / 氛围感>人物细节，常用场景/物品/抽象意象 / 书名现代简约无衬线 / 独立电影海报质感
关键词：`minimalist literary style, clean composition with negative space, subtle moody atmosphere, independent film poster aesthetic`

### 七猫

视觉：极度饱和强烈冲击 / 人物华丽服饰装备丰富 / 火焰雷电灵力特效 / 书名大号发光占比大 / 海报感信息密度高
关键词：`striking high-impact design, vivid dramatic colors, spectacular visual effects, attention-grabbing poster style`

### 刺猬猫

视觉：日系插画二次元 / 色彩明亮线稿清晰 / Q版元素 / 书名卡通手绘风 / 轻松活泼
关键词：`anime illustration style, vibrant colorful, detailed character art, Japanese light novel aesthetic`

---

## 题材推断规则

| 关键词 | 题材 | 风格标签 |
|:-------|:-----|:---------|
| 仙/道/剑/灵/修/宗/天/帝/尊/神 | 玄幻/仙侠 | xianxia fantasy |
| 都市/总裁/校园/重生/系统/学霸/医生/兵王 | 都市 | urban modern |
| 妃/皇/侯/宫/嫡/庶/后/朝/凤/鸾 | 古言 | ancient romance |
| 总裁/契约/替嫁/甜宠/娇妻/萌宝/闪婚 | 现言 | modern romance |
| 诡/案/侦探/悬疑/推理/密室/连环 | 悬疑 | mystery thriller |
| 星际/末世/机甲/赛博/废土/进化 | 科幻 | sci-fi |
| 龙/骑/魔法/异世界/精灵/领主 | 西幻 | western fantasy |
| 三国/大明/大唐/战场/将军/谋士 | 历史 | historical epic |
| 鬼/僵尸/阴阳/风水/盗墓/咒 | 灵异 | supernatural horror |
| 萌/喵/团宠/娇/转生 | 轻小说 | light novel |

---

## 提示词构建公式

```
[平台风格] + [文字层：书名+作者名+字体设计] + [题材风格标签] + [人物描述]
+ [背景元素] + [色彩指令] + [光效指令] + [通用修饰]
```

通用修饰：`professional book cover design, high detail digital painting, portrait orientation 2:3 ratio, no watermark`

文字层必须指定：书名内容+位置(top center)+字体风格+颜色；作者名内容+位置(bottom center)+字体风格+颜色

---

## 提示词技巧

### 文字渲染

GPT-Image-2可直接渲染中文。格式：
```
Title text '书名' at top center in {字体风格}
Author name '作者名' at bottom center in {字体风格}
```

### 人物描述要具体

不要"a man"，要：
```
a young man in flowing white silk robes with gold embroidery,
long black hair tied in a topknot with a jade crown,
piercing dark eyes, confident expression,
holding a glowing blue spirit sword
```

### 背景三层

前景(人物/道具) → 中景(场景：山峰/建筑/森林) → 远景(氛围：云海/星空/火焰)

### 光效

| 光效 | 关键词 | 感觉 |
|------|--------|------|
| 神圣 | `dramatic golden light from above` | 神圣感 |
| 神秘 | `cold moonlight from the left casting long shadows` | 神秘感 |
| 温暖 | `warm sunset glow backlighting the figure` | 温暖感 |
| 科幻 | `neon blue and purple lights from below` | 科幻感 |

### 避免真人照片感

加 `digital painting style`，网文封面需要插画感。

### 构图变体

| 类型 | 关键词 | 适用 |
|:-----|:-------|:-----|
| 人物特写 | `close-up portrait, face filling upper half` | 强调角色 |
| 全身像 | `full body shot, dynamic pose` | 展示服装动作 |
| 纯场景 | `no human figure, landscape composition` | 悬疑/科幻 |
| 双人 | `two figures facing each other` | 言情类 |

---

## 风格库

### 玄幻 / 仙侠

**标签**：`xianxia Chinese fantasy art style, ethereal atmosphere`
**色彩**：青蓝+金色+玄黑，冷色为主，金色/暖色光源点缀
**人物**：男-长发束冠/散发，持剑/法器，衣袂飘飞 | 女-仙裙飘逸，灵兽伴随，莲花装饰
**背景**：云海、仙山、古建筑楼阁、灵力光效
**光效**：`divine golden light rays, mystical mist, spiritual energy glow`
**示例**：
```
Chinese web novel cover, xianxia fantasy style.
Title text '剑道独尊' at top center in bold golden brush calligraphy with metallic glow and sharp strokes.
Author name '青椒炒肉' at bottom center in small refined white serif text with faint golden glow, flanked by delicate cloud-scroll ornaments, resting on a thin horizontal gold line.
A young swordsman in flowing white robes standing on a mountain peak,
holding a glowing blue spirit sword, long black hair flowing in the wind.
Ethereal clouds swirling below, dramatic golden divine light from above,
spiritual energy particles. Dark misty mountain peaks in background.
Color palette: deep blue, gold, white, black.
Professional book cover, high detail digital painting, portrait 2:3 ratio, no watermark
```

### 都市

**标签**：`modern urban contemporary style, clean cinematic composition`
**色彩**：深蓝+灰色+金色，霓虹点缀(夜景)/暖橙(黄昏)
**人物**：男-西装/休闲装干练轮廓分明 | 女-时尚穿搭自信表情
**背景**：城市天际线、高端办公室、校园、霓虹街道
**光效**：`sharp city lights, sunset glow reflecting on glass buildings, neon rim light`

### 古言 / 宫斗

**标签**：`ancient Chinese romance palace drama, elegant classical beauty`
**色彩**：正红+金色+墨黑，华贵厚重
**人物**：女-华服盛装凤冠步摇精致妆容 | 男-帝王/将军威严或温润
**背景**：宫殿、庭院、红墙、珠帘、屏风、灯笼
**光效**：`warm lantern light, golden candle glow, silk fabric shimmering`

### 现言 / 甜宠

**标签**：`modern romance cover art, soft dreamy warm atmosphere`
**色彩**：粉色+暖白+浅金，温暖柔和
**人物**：双人构图为主，甜蜜互动（拥抱/对视/牵手）
**背景**：咖啡厅、花园、温馨室内、夕阳海滩
**光效**：`soft warm backlighting, dreamy bokeh, gentle sunset glow`

### 悬疑 / 推理

**标签**：`dark mystery thriller, noir atmosphere, high contrast shadows`
**色彩**：黑色+深灰+暗蓝，血红/冷白点缀
**人物**：剪影/半遮面/背影，冷静或紧张
**背景**：雨夜街道、老旧建筑、密室、暗巷
**光效**：`dramatic chiaroscuro, single spotlight, rain-slicked reflections`

### 科幻 / 末世

**标签**：`sci-fi cyberpunk, futuristic technology, post-apocalyptic`
**色彩**：深蓝+黑+银色，霓虹蓝/电子紫/能量绿点缀
**人物**：机甲装/战术服/实验室服，科幻武器/全息界面
**背景**：太空、废墟城市、实验室、空间站
**光效**：`holographic blue glow, neon rim lighting, energy arcs`

### 西幻

**标签**：`western high fantasy, epic medieval atmosphere`
**色彩**：深蓝+暗金+银白，火焰红/魔法紫点缀
**人物**：骑士铠甲/法师长袍/游侠皮甲，伴随龙/狮鹫
**背景**：城堡、龙巢、魔法阵、广阔原野
**光效**：`magic spell glow, dramatic stormy sky, firelight from torches`

### 历史 / 军事

**标签**：`historical Chinese war epic, grand battlefield panorama`
**色彩**：铁灰+暗红+土黄，金甲光泽/烽火橙点缀
**人物**：将军铠甲/谋士长袍，持兵器
**背景**：战场、城墙、军营、烽火
**光效**：`dramatic battlefield firelight, smoke-filled sky, sunset over war`

### 灵异 / 恐怖

**标签**：`Chinese supernatural horror, eerie ghostly atmosphere`
**色彩**：墨黑+幽绿+暗红，纸白/烛光黄点缀
**人物**：道士装扮/普通人陷入诡异，鬼影/纸人/僵尸
**背景**：墓地、古庙、暗巷、棺材
**光效**：`eerie green glow, flickering candlelight, cold ghostly luminescence`

### 轻小说 / 二次元

**标签**：`anime light novel cover, vibrant colorful moe style`
**色彩**：明亮多色，星光/花瓣点缀
**人物**：Q版/萌系角色，猫耳/翅膀等萌属性
**背景**：奇幻世界、校园、异世界、星空
**光效**：`sparkly star effects, magical particle effects, soft luminous glow`
