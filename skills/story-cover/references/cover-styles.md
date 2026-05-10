# 小说封面视觉风格库

各题材网文封面的视觉风格定义，用于构建 GPT-Image-2 英文提示词。

---

## 目录

- [平台封面风格](#平台封面风格)
- [题材推断规则](#题材推断规则)
- [提示词构建公式](#提示词构建公式)
- [实测提示词技巧](#实测提示词技巧)
- [风格库](#风格库)
  - [玄幻 / 仙侠](#玄幻--仙侠)
  - [都市](#都市)
  - [古言 / 宫斗](#古言--宫斗)
  - [现言 / 甜宠](#现言--甜宠)
  - [悬疑 / 推理](#悬疑--推理)
  - [科幻 / 末世](#科幻--末世)
  - [西幻](#西幻)
  - [历史 / 军事](#历史--军事)
  - [灵异 / 恐怖](#灵异--恐怖)
  - [轻小说 / 二次元](#轻小说--二次元)

---

## 平台封面风格

不同平台的封面有明显的视觉风格差异。生成时必须匹配目标平台的调性。

### 番茄小说

**定位**：免费阅读，下沉市场，用户停留时间短，封面必须一眼吸睛。

**视觉特征**：
- 色彩饱和度高，对比强烈，鲜艳夺目
- 人物占据画面 60%+，面部清晰可见
- 书名字体大、粗、有光效（金/红/白），远处也能看清
- 构图偏"大头贴"式，人物特写 + 华丽背景
- 整体质感偏"商业爆品"，不需要太多留白

**提示词关键词**：`vibrant saturated colors, eye-catching bold design, character portrait dominating frame, popular mass-market novel cover style, high contrast`

**示例**：
```
Tomato Novel style cover, vibrant saturated colors, eye-catching bold design.
Title '剑道独尊' at top in bold golden brush calligraphy with metallic glow.
Author '青椒炒肉' at bottom in small refined white serif text with faint golden glow, flanked by delicate cloud-scroll ornaments, resting on a thin horizontal gold line.
Close-up of a handsome swordsman with intense eyes, white robes flowing,
golden sword emitting light, epic mountain background.
High contrast, vivid colors, mass-market bestseller cover style.
```

---

### 起点中文网

**定位**：付费阅读，老牌网文平台，读者审美偏成熟精致。

**视觉特征**：
- 画面细腻精致，偏写实插画风格
- 构图讲究，层次丰富，不杂乱
- 书名字体偏传统（毛笔/楷体），有文化底蕴感
- 色彩相对沉稳，不追求极端饱和
- 人物与场景比例均衡，有电影感

**提示词关键词**：`polished refined illustration, detailed cinematic composition, epic atmospheric, mature sophisticated style, premium quality`

**示例**：
```
Qidian premium novel cover, polished refined illustration style.
Title '诡秘之主' at top in elegant dark silver calligraphy with mysterious glow.
Author '爱潜水的乌贼' at bottom in small pale grey text with slight blur effect, a thin cracked line underneath.
A mysterious figure in Victorian coat standing in foggy London street,
gas lamps casting warm light through mist, eldritch symbols faintly glowing.
Cinematic composition, detailed atmospheric illustration.
```

---

### 晋江文学城

**定位**：女频为主的平台，封面以唯美、梦幻、浪漫为主。

**视觉特征**：
- 柔和的色调（粉、紫、浅蓝、暖白）
- 人物偏唯美画风，大眼、精致五官、柔和光影
- 大量使用花瓣、光斑、丝绸、珠宝等装饰元素
- 构图偏居中对称，画面干净
- 书名字体偏优雅（行书/细圆），有浪漫感

**提示词关键词**：`dreamy ethereal aesthetic, soft pastel tones, elegant romantic, delicate beauty, flower petals and bokeh`

**示例**：
```
Jinjiang romance novel cover, dreamy ethereal aesthetic, soft pastel tones.
Title '长安第一美人' at top in elegant rose-gold flowing script with sparkle effect.
Author '发达的泪腺' at bottom in small soft pink-white handwritten text with a tiny heart motif on the left side, light sparkle effect.
A beautiful noble woman in exquisite hanfu with elaborate hairpin,
cherry blossom petals falling around her, soft warm light, dreamy bokeh background.
Delicate romantic illustration, feminine beauty.
```

---

### 知乎盐言故事

**定位**：短篇为主，偏文学质感，封面走简约文艺路线。

**视觉特征**：
- 大量留白，构图极简
- 色彩偏冷淡（灰、蓝、白、暗色）
- 氛围感 > 人物细节，常用场景/物品/抽象意象
- 书名字体偏现代简约（无衬线/细黑体），干净利落
- 整体有"独立电影海报"的质感

**提示词关键词**：`minimalist literary style, clean composition with negative space, subtle moody atmosphere, independent film poster aesthetic`

**示例**：
```
Zhihu Yanayan minimalist cover, independent film poster aesthetic.
Title '白夜' at top in clean modern thin white sans-serif font.
Author '某某' at bottom in small clean white modern text with subtle drop shadow, positioned above a thin grey horizontal divider line.
A solitary figure standing at a rainy bus stop at night,
streetlight casting a warm pool of light, rest in shadow and rain.
Muted desaturated colors, clean composition with ample negative space.
```

---

### 七猫小说

**定位**：免费阅读，与番茄类似但更偏强烈视觉冲击。

**视觉特征**：
- 极度饱和的色彩，视觉冲击力拉满
- 人物华丽，服饰/装备细节丰富
- 常用火焰、雷电、灵力等特效元素
- 书名常用大号发光字体，占画面比例大
- 整体偏"海报感"，信息密度高

**提示词关键词**：`striking high-impact design, vivid dramatic colors, spectacular visual effects, attention-grabbing poster style`

---

### 刺猬猫

**定位**：二次元/轻小说向平台。

**视觉特征**：
- 日系插画风格，二次元角色
- 色彩明亮，线稿清晰
- 人物表情丰富，常有 Q 版元素
- 书名字体偏卡通/手绘风格
- 整体轻松活泼

**提示词关键词**：`anime illustration style, vibrant colorful, detailed character art, Japanese light novel aesthetic`

---

## 题材推断规则

根据书名中的关键字匹配题材：

| 关键词 | 题材 | 风格标签 |
|:-------|:-----|:---------|
| 仙、道、剑、灵、修、宗、天、帝、尊、神 | 玄幻/仙侠 | xianxia fantasy |
| 都市、总裁、校园、重生、系统、学霸、医生、兵王 | 都市 | urban modern |
| 妃、皇、侯、宫、嫡、庶、后、朝、凤、鸾 | 古言 | ancient romance |
| 总裁、契约、替嫁、甜宠、娇妻、萌宝、闪婚 | 现言 | modern romance |
| 诡、案、侦探、悬疑、推理、密室、连环 | 悬疑 | mystery thriller |
| 星际、末世、机甲、赛博、废土、进化 | 科幻 | sci-fi |
| 龙、骑、魔法、异世界、精灵、领主 | 西幻 | western fantasy |
| 三国、大明、大唐、战场、将军、谋士 | 历史 | historical epic |
| 鬼、僵尸、阴阳、风水、盗墓、咒 | 灵异 | supernatural horror |
| 萌、喵、团宠、娇、转生 | 轻小说 | light novel |

---

## 提示词构建公式

每个提示词由以下模块拼接：

```
[平台风格] + [文字层：书名+作者名+字体设计] + [题材风格标签] + [人物描述]
+ [背景元素] + [色彩指令] + [光效指令] + [通用修饰]
```

通用修饰（每次追加）：
```
professional book cover design, high detail digital painting,
portrait orientation 2:3 ratio, no watermark
```

**文字层是封面核心**，必须指定：
- 书名内容、位置（top center）、字体风格、颜色
- 作者名内容、位置（bottom center）、字体风格、颜色

---

## 实测提示词技巧

基于 gpt-image-2 实际生成结果总结（已验证可正确渲染中文书名和作者名）：

### 文字渲染（最重要）

GPT-Image-2 可直接渲染中文文字。在提示词中包含书名和作者名，并描述字体风格：

```
Title text '剑道独尊' at top center in bold golden brush calligraphy with metallic glow
Author name '青椒炒肉' at bottom center in small refined white serif text with faint golden glow
```

字体风格要匹配题材（详见 SKILL.md 字体风格表）。

### 人物描述要具体

不要写 "a man"，要写：
```
a young man in flowing white silk robes with gold embroidery,
long black hair tied in a topknot with a jade crown,
piercing dark eyes, confident expression,
holding a glowing blue spirit sword
```

### 背景分层构建

三层结构营造深度感：
- 前景：人物/道具
- 中景：场景 — 山峰/建筑/森林
- 远景：氛围 — 云海/星空/火焰

### 光效是灵魂

指定光源方向 + 颜色：
- `dramatic golden light from above` — 神圣感
- `cold moonlight from the left casting long shadows` — 神秘感
- `warm sunset glow backlighting the figure` — 温暖感
- `neon blue and purple lights from below` — 科幻感

### 避免真人照片感

加 `digital painting style` 而非 `photorealistic`。网文封面需要插画感，不是真人照片。

### 构图变体

| 类型 | 提示词关键词 | 效果 |
|:-----|:------------|:-----|
| 人物特写 | `close-up portrait, face filling upper half` | 强调角色魅力 |
| 全身像 | `full body shot, dynamic pose` | 展示服装和动作 |
| 纯场景 | `no human figure, landscape composition` | 氛围感，适合悬疑/科幻 |
| 双人 | `two figures facing each other` | 适合言情类 |

---

## 风格库

### 玄幻 / 仙侠

**实测提示词**（验证通过，含中文文字渲染）：
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

**风格标签**：`xianxia Chinese fantasy art style, ethereal atmosphere`

**色彩**：青蓝 + 金色 + 玄黑，冷色调为主，金色/暖色光源点缀

**人物**：
- 男性：长发束冠/散发，持剑/法器，衣袂飘飞
- 女性：仙裙飘逸，灵兽伴随，莲花装饰

**背景**：云海、仙山、古建筑楼阁、灵力光效

**光效**：`divine golden light rays, mystical mist, spiritual energy glow`

---

### 都市

**风格标签**：`modern urban contemporary style, clean cinematic composition`

**色彩**：深蓝 + 灰色 + 金色，霓虹色点缀（夜景）/ 暖橙（黄昏）

**人物**：
- 男性：西装/休闲装，干练气质，轮廓分明
- 女性：时尚穿搭，自信表情

**背景**：城市天际线、高端办公室、校园、霓虹街道

**光效**：`sharp city lights, sunset glow reflecting on glass buildings, neon rim light`

**示例提示词**：
```
modern urban contemporary style, a confident young man in a tailored dark suit
standing on a rooftop, city skyline at sunset behind him,
warm golden hour lighting, sharp cinematic composition,
cold blue city lights contrasting warm skin tones
```

---

### 古言 / 宫斗

**风格标签**：`ancient Chinese romance palace drama, elegant classical beauty`

**色彩**：正红 + 金色 + 墨黑，华贵厚重

**人物**：
- 女性：华服盛装，凤冠/步摇，精致妆容
- 男性：帝王/将军装束，威严或温润

**背景**：宫殿、庭院、红墙、珠帘、屏风、灯笼

**光效**：`warm lantern light, golden candle glow, silk fabric shimmering`

**示例提示词**：
```
ancient Chinese palace romance style,
a noble woman in ornate red and gold hanfu with phoenix crown,
standing in a grand palace hallway with red pillars and silk lanterns,
warm golden lantern light creating rich shadows,
elegant classical beauty, regal atmosphere
```

---

### 现言 / 甜宠

**风格标签**：`modern romance cover art, soft dreamy warm atmosphere`

**色彩**：粉色 + 暖白 + 浅金，温暖柔和

**人物**：双人构图为主，甜蜜互动（拥抱/对视/牵手）

**背景**：咖啡厅、花园、温馨室内、夕阳海滩

**光效**：`soft warm backlighting, dreamy bokeh, gentle sunset glow`

**示例提示词**：
```
modern romance cover art, soft dreamy atmosphere,
a handsome man in casual shirt gently holding hands with a sweet woman,
warm sunset in a flower garden, dreamy bokeh background,
pink and golden light, heartwarming intimate mood
```

---

### 悬疑 / 推理

**风格标签**：`dark mystery thriller, noir atmosphere, high contrast shadows`

**色彩**：黑色 + 深灰 + 暗蓝，血红/冷白点缀

**人物**：剪影/半遮面/背影，冷静或紧张表情

**背景**：雨夜街道、老旧建筑、密室、暗巷

**光效**：`dramatic chiaroscuro, single spotlight, rain-slicked reflections`

**示例提示词**：
```
dark mystery thriller noir style,
a figure in a dark trench coat standing under a street lamp in heavy rain,
face half-hidden in shadow, ominous fog behind,
single cold white spotlight cutting through darkness,
rain-slicked street reflecting red and blue lights
```

---

### 科幻 / 末世

**风格标签**：`sci-fi cyberpunk, futuristic technology, post-apocalyptic`

**色彩**：深蓝 + 黑 + 银色，霓虹蓝/电子紫/能量绿点缀

**人物**：机甲装/战术服/实验室服，科幻武器/全息界面

**背景**：太空、废墟城市、实验室、空间站

**光效**：`holographic blue glow, neon rim lighting, energy arcs`

**示例提示词**：
```
sci-fi cyberpunk style,
a warrior in advanced mech armor standing in a ruined futuristic city,
holographic interfaces floating around, neon blue and purple lights,
overgrown skyscrapers in the background,
dramatic blue energy glow from the armor
```

---

### 西幻

**风格标签**：`western high fantasy, epic medieval atmosphere`

**色彩**：深蓝 + 暗金 + 银白，火焰红/魔法紫点缀

**人物**：骑士铠甲/法师长袍/游侠皮甲，伴随龙/狮鹫

**背景**：城堡、龙巢、魔法阵、广阔原野

**光效**：`magic spell glow, dramatic stormy sky, firelight from torches`

**示例提示词**：
```
western high fantasy art style,
a knight in ornate silver armor with a flowing blue cape,
holding a glowing magical sword, standing before a massive castle,
dragon silhouette in the stormy sky behind,
magic energy radiating from the sword
```

---

### 历史 / 军事

**风格标签**：`historical Chinese war epic, grand battlefield panorama`

**色彩**：铁灰 + 暗红 + 土黄，金甲光泽/烽火橙点缀

**人物**：将军铠甲/谋士长袍，持兵器

**背景**：战场、城墙、军营、烽火

**光效**：`dramatic battlefield firelight, smoke-filled sky, sunset over war`

**示例提示词**：
```
historical Chinese war epic style,
a general in detailed ancient armor on horseback,
battlefield with war flags and smoke in the background,
dramatic sunset sky filled with arrows and fire,
grand scale cinematic composition
```

---

### 灵异 / 恐怖

**风格标签**：`Chinese supernatural horror, eerie ghostly atmosphere`

**色彩**：墨黑 + 幽绿 + 暗红，纸白/烛光黄点缀

**人物**：道士装扮/普通人陷入诡异，鬼影/纸人/僵尸

**背景**：墓地、古庙、暗巷、棺材

**光效**：`eerie green glow, flickering candlelight, cold ghostly luminescence`

**示例提示词**：
```
Chinese supernatural horror atmosphere,
a figure in dark robes holding a paper talisman,
ancient tomb entrance with eerie green mist pouring out,
flickering red candles on stone altars,
yin-yang symbols carved in the doorway
```

---

### 轻小说 / 二次元

**风格标签**：`anime light novel cover, vibrant colorful moe style`

**色彩**：明亮多色搭配，星光/花瓣点缀

**人物**：Q版/萌系角色，猫耳/翅膀等萌属性，丰富表情

**背景**：奇幻世界、校园、异世界、星空

**光效**：`sparkly star effects, magical particle effects, soft luminous glow`

**示例提示词**：
```
anime light novel cover style, vibrant and colorful,
a cute girl with cat ears and a magical staff,
cheerful expression with big sparkling eyes,
fantasy world background with floating islands and cherry blossoms,
magical sparkles and particle effects,
bright and cheerful atmosphere
```
