#!/usr/bin/env python3
"""Analyze local longform genre-card samples across early/mid/late phases.

The script reads the genre card names from story-long-write, samples matching
books from the local Mongo novel database, and emits concise evidence summaries
for each card. It is intentionally source-neutral in the generated wording so
cards can use the results as general longform evidence without exposing whether
an individual sample came from a specific platform.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any, Iterable

from pymongo import MongoClient

REPO_ROOT = Path(__file__).resolve().parents[1]
CARD_DIR = REPO_ROOT / "skills/story-long-write/references/genre-prose-cards"
DEFAULT_MONGO_URI = "mongodb://192.168.31.139:27017/novel"

TAG_RE = re.compile(r"<[^>]+>")
QUOTE_RE = re.compile(r"[“「『][^”」』]{1,160}[”」』]")
ARABIC_CHAPTER_RE = re.compile(r"第\s*0*([0-9]{1,5})\s*[章节回]")
CHINESE_NUM = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CHINESE_CHAPTER_RE = re.compile(r"第\s*([零〇一二两三四五六七八九十百千]{1,8})\s*[章节回]")

HITS: list[tuple[str, str]] = [
    ("危险/异常", r"死|血|病|火|灾|尸|鬼|怪|杀|伤|危险|医院|手术|事故|末世|丧尸|审讯|搜查|失踪|案件|诡|恐怖|爆炸|毒|污染|倒计时"),
    ("家庭/关系", r"爸|妈|父|母|妻|夫|老公|老婆|孩子|儿子|女儿|姐姐|妹妹|哥哥|弟弟|家|亲戚|婚|离婚|夫人|王妃|姨娘|婆婆|丈母娘|公婆|娘家"),
    ("系统/面板", r"系统|面板|任务|奖励|宿主|绑定|提示|检测|积分|模拟|签到|抽奖|加点|属性|天幕|直播间"),
    ("钱/契约", r"钱|元|万|亿|合同|契约|股份|公司|资产|账|房|车|资源|票据|银子|嫁妆|彩礼|粮票|灵石|丹药|金币|订单|生意"),
    ("手机/社交", r"手机|电话|微信|短信|消息|热搜|微博|群|直播|弹幕|论坛|记者|镜头|评论|粉丝|账号|视频"),
    ("事业/职场", r"公司|项目|客户|老板|会议|办公室|工作|职场|升职|合同|商战|明星|剧组|综艺|经纪|报馆|商会|门店|小店|摊位"),
    ("校园/青春", r"学校|校园|同学|老师|考试|班级|高考|校花|学生|学院|宿舍|操场|电竞社|训练赛"),
    ("修炼/超凡", r"修炼|境界|灵气|灵力|宗门|功法|丹药|武者|武魂|仙|魔法|斗气|血脉|神通|灵根|秘境|妖兽|符箓|法器"),
    ("身份/转折", r"重生|穿越|穿书|身份|赘婿|上门|王妃|皇帝|太子|千金|总裁|战神|兵王|首富|真假|替身|侯爷|世子|少爷|小姐"),
    ("公开围观", r"众人|所有人|围观|台下|当众|公开|宴会|大厅|广场|热搜|榜单|直播间|镜头|弹幕|记者|观众|观礼"),
    ("制度/礼法", r"圣旨|朝堂|皇上|王府|宫|礼|规矩|官|军|户口|票|族老|公堂|宗族|爵位|门第|法庭|警局|军令|档案|纪律"),
]
HIT_REGEX = [(name, re.compile(pat)) for name, pat in HITS]

GENRE_LANDING_POINTS = {
    "东方仙侠": "开场落到门规、试炼、洞府异动或师徒命令；冲突落到境界瓶颈、宗门资格和道义选择；结尾落到命牌、剑痕、劫兆或强敌拜山。",
    "传统玄幻": "开场落到演武场、测试、资源被夺或秘境入口；冲突落到境界压制和资源缺口；结尾落到新试炼、秘境资格、仇人到场或长老改口。",
    "历史古代": "开场落到公文、朝会、军报、家族席位或案件现场；冲突落到制度卡点和责任归属；结尾落到圣旨、公文落印、军情反转或敌方动作。",
    "历史脑洞": "开场落到旧局势危机、朝堂误判或天幕/系统信息；冲突落到古人误读、权力争抢和执行成本；结尾落到下一条信息、技术试验或站队变化。",
    "双男主": "开场落到同处压力、公开误会、危险或手机消息；冲突落到两人目标不一致和外人误判；结尾落到替对方承担后果、暧昧证据被看见或身份暴露。",
    "古言脑洞": "开场落到请安、赐婚、家宴、系统提示或穿书醒来；冲突落到古代规矩承接新设定；结尾落到婚约变化、宫中传召、系统限制或物证出现。",
    "古风世情": "开场落到家宴席位、账册、婚书、库房钥匙或邻里流言；冲突落到名分、人情账和证据；结尾落到新物证、长辈召见或婚产判定变化。",
    "女频悬疑": "开场落到案件现场、陌生来电、亲友异常或旧案物证；冲突落到线索误读和女主关系网压力；结尾落到新线索、嫌疑人反转或亲近者涉案。",
    "女频种田": "开场落到断粮、分家、药钱、赶集或门店亏损；冲突落到钱粮缺口和邻里亲戚小算盘；结尾落到新订单、分家结果、孩子态度或极品反扑。",
    "宫斗宅斗": "开场落到请安、赏罚、家宴、宫门传召或下人传话；冲突落到名分、规矩、证词和站队；结尾落到一道旨意、一件物证或后宅位置变化。",
    "年代": "开场落到票证、粮食、工位、知青点、家属院或婚姻安排；冲突落到资源短缺和熟人社会评价；结尾落到分配结果、调令、票证缺口或亲友站队。",
    "快穿": "开场落到原身困局、系统任务、剧情节点或关系审判；冲突落到人设限制和任务代价；结尾落到任务进度、角色态度偏移或小世界新规则。",
    "悬疑灵异": "开场落到怪事现场、失踪、旧物、门禁或监控；冲突落到可验证线索和危险逼近；结尾落到新规则、死者信息、异常物证或主角被盯上。",
    "悬疑脑洞": "开场落到规则提示、异常现场、手机线索或亲近关系异常；冲突落到规则代价和角色误判；结尾落到规则新增、身份被点破或更亲近的人卷入。",
    "战神赘婿": "开场落到家族饭桌、宴会、合同、医院或旧部上门；冲突落到被看轻的处境和隐忍理由；结尾落到旧部称呼、资源到场、妻子态度变化或更大靠山。",
    "抗战谍战": "开场落到审查、接头、搜查、军令或密电；冲突落到身份伪装、情报真假和组织纪律；结尾落到暗号失效、名单暴露、追捕升级或上级新命令。",
    "星光璀璨": "开场落到试镜、热搜、合同、综艺现场或经纪人催促；冲突落到公众评价和职业资源争夺；结尾落到新通告、偷拍视频、榜单变化或角色邀约。",
    "民国言情": "开场落到舞会、报馆、军令、商会账目或家族婚约；冲突落到乱世权力、门第和情感安全；结尾落到军阀命令、报纸消息、车站离别或婚约变动。",
    "游戏体育": "开场落到比赛临场、副本开门、榜单刷新或队友质疑；冲突落到规则限制、操作选择和旁人误判；结尾落到结算奖励、下一场强敌、战队邀请或隐藏规则开启。",
    "玄幻脑洞": "开场落到废柴测试、宗门危机、血脉检测或系统觉醒；冲突落到旧修炼秩序被反常规规则撬动；结尾落到词条刷新、榜单排名、强敌登门或奖励异常。",
    "玄幻言情": "开场落到劫难、师门规矩、灵兽/法器异动或身份压迫；冲突落到修炼代价和情感选择互相牵制；结尾落到境界异象、契约变化或旧因果浮现。",
    "现言脑洞": "开场落到手机消息、热搜、系统任务、贵族学院/职场公开评价；冲突落到现代规则被脑洞设定改写；结尾落到新任务、公开反馈、身份漏洞或关系反转。",
    "科幻末世": "开场落到断电、感染、物资清点、避难点冲突或异常天气；冲突落到生存资源和队伍信任；结尾落到新灾变、物资缺口、队伍分裂或基地规则变化。",
    "职场婚恋": "开场落到会议、合同、客户电话、加班饭局或婚恋尴尬场；冲突落到职业利益和亲密限制互相挤压；结尾落到项目结果、旧情消息或关系公开风险。",
    "西方奇幻": "开场落到酒馆委托、领地税、魔法学院、神殿命令或怪物袭击；冲突落到契约、血统、魔法代价和阵营选择；结尾落到新委托、封印松动或领主/教会态度变化。",
    "豪门总裁": "开场落到合同、医院、宴会、热搜、家族饭桌或电梯偶遇；冲突落到阶层体面、契约限制和私下失控；结尾落到关系被公开、协议变更、旧情回归或家族施压。",
    "都市修真": "开场落到医院、古玩、家族羞辱、灵气异常或救人现场；冲突落到现代规则和修真能力限制；结尾落到病情反转、法器线索、仇家上门或修炼资源出现。",
    "都市日常": "开场落到账单、饭桌、群聊、店门铃、接送或邻里误会；冲突落到小目标被现实成本卡住；结尾落到一条新消息、一个上门的人或下一次生活约定。",
    "都市种田": "开场落到小店、菜地、订单、乡村人情或第一笔买卖；冲突落到经营成本、口碑和熟人社会；结尾落到新订单、资金缺口、邻里站队或下一次开张。",
    "都市脑洞": "开场落到系统提示、手机消息、家庭/职场尴尬或公开评价；冲突落到脑洞规则改变现实收益；结尾落到奖励异常、热搜发酵、关系误会或新任务。",
    "都市高武": "开场落到体测、武考、异兽警报、训练馆或排名刷新；冲突落到战力差距、资源名额和公开评测；结尾落到榜单变化、强者关注、异兽入侵或新训练资格。",
    "青春甜宠": "开场落到班级、宿舍、考试、社团、校门口或一条消息；冲突落到误会、竞争和青春期面子；结尾落到约定、公开围观、成绩/比赛变化或暧昧证据。",
}


GENRE_STAGE_PLAYBOOK = {
    "东方仙侠": "- 前期：先把主角放进门规、试炼或师徒命令里，让修炼资源和因果选择形成第一道压力。\n- 中期：用宗门任务、劫难、同门站队和灵石丹药缺口反复卡住选择，每次破局都要改变名声或因果账。\n- 后期：把个人突破推到宗门、道统或大劫层面，结尾用命牌、剑痕、天象或强敌拜山抬下一轮期待。",
    "传统玄幻": "- 前期：用测试、资源被夺、家族羞辱或秘境资格压出被看轻的开局，先让读者看清升级缺口。\n- 中期：围绕境界、丹药、榜单、擂台和秘境收益反复结算，打脸要和资源到账绑定。\n- 后期：把仇怨、宗门利益和更高战力拉进同一场清算，结尾留强敌、秘境深层或长老改口。",
    "历史古代": "- 前期：用公文、朝会、军报、家族席位或案件责任压主角入局，先交代制度阻力。\n- 中期：让执行成本、官场站队、家族牵连和民生结果反复碰撞，破局必须留下账。\n- 后期：把个人判断推到朝局、军情或法理结算，章尾用圣旨、军报、落印文书或敌方动作续压。",
    "历史脑洞": "- 前期：把天幕、系统、直播或技术信息抛进旧秩序，让古人误读和权力反应先炸开。\n- 中期：用执行成本验证脑洞，不只展示知识；每次新信息都要让一派得利、一派恐慌。\n- 后期：让制度、军政和钱粮承接前面的脑洞后果，结尾落到下一条信息或更高层站队。",
    "双男主": "- 前期：用同处压力、公开误会、手机消息或危险场面把两人的目标差异推到台前。\n- 中期：围绕替对方承担后果、限制试探、外人误判和关系证据做拉扯，不靠空泛暧昧。\n- 后期：把私下偏袒推到公开选择，结尾留身份暴露、证据被看见或另一方反过来护短。",
    "古言脑洞": "- 前期：从请安、赐婚、家宴、穿书醒来或系统限制切入，让古代规矩先压住新设定。\n- 中期：每次脑洞落地都要改变名分、婚约、站队或家宅账目，不能只刷任务提示。\n- 后期：把系统限制、宫中传召和婚产/家族后果合并结算，钩子落在规矩反噬或物证出现。",
    "古风世情": "- 前期：用家宴席位、账册、婚书、库房钥匙或邻里流言立住名分和人情账。\n- 中期：让证据、长辈态度、亲戚算盘和钱产分配反复拉扯，每个小场都要改变关系位置。\n- 后期：把婚产、名声、宗族和官面结果推到一处结算，结尾用新物证或长辈召见续局。",
    "女频悬疑": "- 前期：用案件现场、陌生来电、亲友异常或旧物证引女主入局，危险要贴近关系网。\n- 中期：让线索误读、情感压力和嫌疑人反转互相牵制，解一个小真相就暴露一个更近的人。\n- 后期：把旧案、亲近者和新证据合成公开风险，结尾落到嫌疑身份翻转或女主被盯上。",
    "女频种田": "- 前期：从断粮、药钱、分家、赶集、孩子或门店亏损切入，让生计缺口可见。\n- 中期：围绕订单、邻里口碑、亲戚小算盘和钱粮周转推进，每章必须有一笔具体收益或损失。\n- 后期：把家业、亲情站队和村镇规矩合并清算，钩子落在新订单、分家结果或极品反扑。",
    "宫斗宅斗": "- 前期：用请安、赏罚、家宴、宫门传召或下人传话立住规矩和位置。\n- 中期：围绕证词、赏罚、站队、名分和下人链条推进，暗斗要落到可验证物证。\n- 后期：把规矩、旨意和位置变化推到明面上见结果，章尾用一道旨意、一件物证或某人失宠续压。",
    "年代": "- 前期：用票证、粮食、工位、知青点、家属院或婚姻安排压出现实缺口。\n- 中期：让熟人社会评价、钱粮周转、工位名额和亲友站队反复卡主角，收益要朴素可见。\n- 后期：把分配、调令、家属关系和时代机会合并结算，结尾落到新指标、新票证或亲友选择。",
    "快穿": "- 前期：先落原身困局、系统任务和剧情节点，让读者知道人设限制和改命目标。\n- 中期：围绕任务进度、角色态度偏移和小世界规则反噬推进，每次破局都要改一个原后果。\n- 后期：快速结算情感债、任务奖励和世界后果，章尾留新世界规则或上个世界余波。",
    "悬疑灵异": "- 前期：用怪事现场、失踪、旧物、门禁或监控抛出可验证异常，不先解释规则。\n- 中期：让调查、试探、误判和危险逼近反复推进，线索必须靠角色动作拿到。\n- 后期：把死者信息、民俗规则和主角处境合成新危险，结尾落到异常物证或主角被盯上。",
    "悬疑脑洞": "- 前期：先给规则提示、异常现场、手机线索或亲近关系异常，让代价立刻可感。\n- 中期：围绕规则验证、角色误判和亲友卷入推进，解答必须带来更具体的新问题。\n- 后期：把规则限制、身份档案和亲近者异常合并，结尾用规则新增或身份被点破续压。",
    "战神赘婿": "- 前期：用家族饭桌、医院、宴会、合同或旧部上门制造被看轻的处境，同时给隐忍理由。\n- 中期：让危险、靠山、资源和妻子态度轮流变动，打脸必须分层，不要一次亮完身份。\n- 后期：把旧部称呼、资源到场和更大靠山推成公开清算，结尾回到妻子或家族关系变化。",
    "抗战谍战": "- 前期：用审查、接头、搜查、军令或密电把身份伪装压紧，目标必须明确。\n- 中期：围绕情报真假、暗号、组织纪律和追捕升级推进，每次过关都要留下新风险。\n- 后期：把名单、上级命令和敌方搜捕合并引爆，章尾用暗号失效或身份暴露边缘续压。",
    "星光璀璨": "- 前期：用试镜、热搜、合同、综艺现场或经纪人催促压出职业低谷和舆论误判。\n- 中期：让作品机会、公众评价、粉丝反馈和对手操作反复变化，爽点落在资源转向和能力被看见。\n- 后期：把榜单、奖项、偷拍视频或角色邀约放到明面上见结果，结尾留新通告或更大舆论风险。",
    "民国言情": "- 前期：用舞会、报馆、军令、商会账目或家族婚约立住乱世和门第压力。\n- 中期：让情感安全、权力站队、报纸消息和家族利益互相挤压，甜虐都要落在具体选择。\n- 后期：把军阀命令、婚约变动和离别/重逢推到结算，章尾用车站、报纸或密令续钩。",
    "游戏体育": "- 前期：用比赛临场、副本开门、榜单刷新或队友质疑立目标和胜负规则。\n- 中期：围绕操作选择、训练收益、队伍合约和直播/榜单反馈推进，规则说明只保留影响胜负的部分。\n- 后期：把排名、奖励、战队邀请和下一场强敌一起结算，结尾落到隐藏规则或更高赛点。",
    "玄幻脑洞": "- 前期：用废柴测试、宗门危机、血脉检测或系统觉醒让反常规规则第一次落地。\n- 中期：围绕旧修炼秩序、宗门资格、资源分配和公开误判反复升级，脑洞必须带来收益或代价。\n- 后期：把词条、榜单、强敌和规则限制推到公开清算，结尾留奖励异常或更高层发现偏差。",
    "玄幻言情": "- 前期：用劫难、师门规矩、灵兽/法器异动或身份压迫同时压修炼和感情选择。\n- 中期：让境界代价、契约变化、师门站队和情感误会互相牵制，不把感情线写成外挂。\n- 后期：把旧因果、境界异象和关系选择合并结算，结尾留契约反噬或前缘浮现。",
    "现言脑洞": "- 前期：用手机消息、热搜、系统任务、贵族学院或职场公开评价切入，让现代规则被新设定撬动。\n- 中期：围绕任务代价、关系误会、钱或身份收益和公开反馈推进，不只刷奖励。\n- 后期：把身份漏洞、热搜发酵和关系反转合并，结尾落到新任务或公开处境变化。",
    "科幻末世": "- 前期：用断电、感染、物资清点、避难点冲突或异常天气立生存缺口。\n- 中期：围绕物资消耗、队伍信任、基地规则和感染风险推进，每次收益都要消耗代价。\n- 后期：把队伍分裂、新灾变和基地秩序合并压迫，结尾落到物资缺口或规则变化。",
    "职场婚恋": "- 前期：用会议、合同、客户电话、加班饭局或婚恋尴尬场让职业利益和亲密限制撞上。\n- 中期：围绕项目结果、旧情消息、同事误判和合作限制推进，关系变化必须影响工作局面。\n- 后期：把项目结算、关系公开风险和个人选择合并，结尾留升职/换岗/旧情返场。",
    "西方奇幻": "- 前期：用酒馆委托、领地税、魔法学院、神殿命令或怪物袭击立契约和生存压力。\n- 中期：围绕佣兵契约、魔法代价、血统/神权和阵营选择推进，设定要落到任务成本。\n- 后期：把封印、领主/教会态度和队伍收益合并结算，结尾留新委托或怪物源头。",
    "豪门总裁": "- 前期：用合同、医院、宴会、热搜、家族饭桌或电梯偶遇压关系分寸和阶层差。\n- 中期：围绕契约条款、家族施压、旧情回归和私下失控推进，每章让关系明确前进或后退。\n- 后期：把公开身份、协议变更和家族站队推到结算，章尾继续压关系风险，不只制造新误会。",
    "都市修真": "- 前期：用医院、古玩、家族羞辱、灵气异常或救人现场让现代规则撞上修真能力。\n- 中期：围绕法器线索、病情反转、钱、账资源和仇家上门推进，能力越强越要有限制。\n- 后期：把现代势力、修炼资源和旧仇合并清算，结尾留更高修士或资源源头。",
    "都市日常": "- 前期：用账单、饭桌、群聊、店门铃、接送或邻里误会压出一个小目标。\n- 中期：围绕钱和账周转、亲友态度、工作/小店变化和熟人评价推进，每段日常都要产生结果。\n- 后期：把生活目标、关系修复和下一次选择合并，结尾用新消息、上门人或约定留温和钩子。",
    "都市种田": "- 前期：用小店、菜地、订单、乡村人情或第一笔买卖立经营目标和成本缺口。\n- 中期：围绕订单、口碑、资金周转和邻里站队推进，经营收益必须可见可复用。\n- 后期：把新订单、资金缺口和熟人社会评价合并结算，结尾留下一次开张或竞争者动作。",
    "都市脑洞": "- 前期：用系统提示、手机消息、家庭/职场尴尬或公开评价让脑洞规则第一次改变现实收益。\n- 中期：围绕任务代价、钱和收益、关系误会和公开反馈推进，规则越爽越要给限制。\n- 后期：把奖励异常、热搜发酵和身份漏洞合并，结尾落到新任务或更大公开评价。",
    "都市高武": "- 前期：用体测、武考、异兽警报、训练馆或排名刷新压出战力差距和资源名额。\n- 中期：围绕训练收益、补给资源、公开评测和危险、事故、案件推进，升级要有可见测量。\n- 后期：把榜单变化、强者关注和异兽入侵推到明面上见结果，结尾留新训练资格或战场召唤。",
    "青春甜宠": "- 前期：用班级、宿舍、考试、社团、校门口或一条消息制造误会和青春期面子。\n- 中期：围绕成绩/比赛、同学围观、约定落地和小吃醋推进，甜点要和具体事件绑定。\n- 后期：把公开围观、成绩变化和暧昧证据合并，结尾留下一次约定或关系被同学看见。",
}


BASE_QIMAO = {"story_mode": "longform", "is_short_story": False, "downloaded_chapter_count": {"$gt": 0}}

def rx(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern)

def q_c2(c1: str, *c2s: str) -> dict[str, Any]:
    q = dict(BASE_QIMAO)
    q["category1_name"] = c1
    if c2s:
        q["category2_name"] = {"$in": list(c2s)}
    return q

def q_and(*parts: dict[str, Any]) -> dict[str, Any]:
    return {"$and": [dict(BASE_QIMAO), *parts]}

def q_or(*conds: dict[str, Any]) -> dict[str, Any]:
    q = dict(BASE_QIMAO)
    q["$or"] = list(conds)
    return q

R_ZX = rx("赘婿|上门女婿|上门豪婿|上门穷婿|上门")
R_GUNAO = rx("穿书|系统|读心|重生|穿越|炮灰|女配|恶毒|空间|绑定|任务")
R_DXZX = rx("修真|修仙|仙尊|仙帝|古武|神医|下山")
R_BRAIN = rx("系统|签到|神豪|抽奖|奖励|返现|听劝|直播|脑洞|反派|面板|加点|绑定|任务")
R_HISTORY_BRAIN = rx("天幕|系统|直播|盘点|曝光|视频|工业|基建|模拟|剧透|榜单")
R_SUSPENSE_BRAIN = rx("规则|怪谈|系统|直播|游戏|无限|诡异|副本|面板|逃生")

QIMAO_TARGETS: dict[str, dict[str, Any]] = {
    "东方仙侠": q_c2("武侠仙侠", "古典仙侠", "上古洪荒", "武侠幻想"),
    "传统玄幻": q_c2("玄幻奇幻", "东方玄幻", "异世大陆", "王朝争霸"),
    "历史古代": q_c2("历史", "架空历史", "穿越历史"),
    "历史脑洞": q_and({"category1_name": "历史"}, {"$or": [{"title": R_HISTORY_BRAIN}, {"intro": R_HISTORY_BRAIN}, {"book_tag_list.title": R_HISTORY_BRAIN}]}),
    "双男主": q_and({"$or": [{"title": rx("双男主|纯爱|耽美|双男|竹马")}, {"intro": rx("双男主|纯爱|耽美|双男|竹马")}, {"book_tag_list.title": rx("双男主|纯爱|耽美|双男")}] }),
    "古言脑洞": q_and({"category1_name": "古代言情"}, {"category2_name": {"$in": ["古代情缘", "宫闱宅斗", "权谋天下", "古代悬疑"]}}, {"$or": [{"title": R_GUNAO}, {"intro": R_GUNAO}, {"book_tag_list.title": R_GUNAO}]}),
    "古风世情": q_c2("古代言情", "古代情缘", "宫闱宅斗", "权谋天下"),
    "女频悬疑": q_or({"category1_name": "现代言情", "category2_name": "现代悬疑"}, {"category1_name": "古代言情", "category2_name": "古代悬疑"}),
    "女频种田": q_c2("古代言情", "种田经商"),
    "宫斗宅斗": q_c2("古代言情", "宫闱宅斗"),
    "年代": q_c2("现代言情", "年代重生"),
    "快穿": q_c2("幻想言情", "无限快穿"),
    "悬疑灵异": q_c2("奇闻异事", "恐怖灵异", "侦探推理", "奇门秘术", "寻宝探险"),
    "悬疑脑洞": q_and({"$or": [{"category1_name": "奇闻异事"}, {"category1_name": "出版小说", "category2_name": "悬疑推理"}]}, {"$or": [{"title": R_SUSPENSE_BRAIN}, {"intro": R_SUSPENSE_BRAIN}, {"book_tag_list.title": R_SUSPENSE_BRAIN}]}),
    "战神赘婿": q_and({"category1_name": "都市"}, {"$or": [{"title": R_ZX}, {"intro": R_ZX}, {"book_tag_list.title": rx("赘婿|强者回归|兵王|女总裁|扮猪吃虎")}] }),
    "抗战谍战": q_or({"category1_name": "军事", "category2_name": {"$in": ["抗战烽火", "谍战特工"]}}, {"category1_name": "出版小说", "category2_name": "革命战争"}),
    "星光璀璨": q_or({"category1_name": "现代言情", "category2_name": "娱乐明星"}, {"category1_name": "都市", "category2_name": "明星娱乐"}),
    "民国言情": q_c2("现代言情", "民国旧影"),
    "游戏体育": q_or({"category1_name": {"$in": ["游戏", "游戏竞技"]}}, {"category1_name": "体育"}),
    "玄幻脑洞": q_and({"category1_name": "玄幻奇幻"}, {"$or": [{"title": R_BRAIN}, {"intro": R_BRAIN}, {"book_tag_list.title": R_BRAIN}]}),
    "玄幻言情": q_c2("幻想言情", "玄幻仙侠", "异世幻想"),
    "现言脑洞": q_and({"category1_name": "现代言情"}, {"$or": [{"title": R_GUNAO}, {"intro": R_GUNAO}, {"book_tag_list.title": R_GUNAO}]}),
    "科幻末世": q_or({"category1_name": "科幻", "category2_name": "末世危机"}, {"category1_name": "幻想言情", "category2_name": "末世求生"}),
    "职场婚恋": q_c2("现代言情", "职场情缘"),
    "西方奇幻": q_c2("玄幻奇幻", "西方奇幻"),
    "豪门总裁": q_c2("现代言情", "总裁豪门"),
    "都市修真": q_or({"category1_name": "武侠仙侠", "category2_name": "幻想修真"}, {"category1_name": "都市", "$or": [{"title": R_DXZX}, {"intro": R_DXZX}, {"book_tag_list.title": R_DXZX}]}),
    "都市日常": q_c2("都市", "都市生活"),
    "都市种田": q_c2("都市", "乡村生活"),
    "都市脑洞": q_and({"category1_name": "都市"}, {"$or": [{"title": R_BRAIN}, {"intro": R_BRAIN}, {"book_tag_list.title": R_BRAIN}]}),
    "都市高武": q_c2("都市", "都市高武", "灵气复苏"),
    "青春甜宠": q_c2("现代言情", "青春校园"),
}

@dataclass
class ChapterWindow:
    phase: str
    text: str
    chapter_title: str
    book_title: str


def clean(text: str | None) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = text.replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n")
    text = TAG_RE.sub("", text)
    text = re.sub(r"\r", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def paras(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n+", clean(text)) if p.strip()]


def chinese_num_to_int(s: str) -> int | None:
    if not s:
        return None
    if all(ch in CHINESE_NUM for ch in s):
        # Handles simple forms like 一二三 as fallback, but most titles use 十/百 grammar.
        pass
    total = 0
    num = 0
    unit_seen = False
    for ch in s:
        if ch in CHINESE_NUM:
            num = CHINESE_NUM[ch]
        elif ch == "十":
            unit_seen = True
            total += (num or 1) * 10
            num = 0
        elif ch == "百":
            unit_seen = True
            total += (num or 1) * 100
            num = 0
        elif ch == "千":
            unit_seen = True
            total += (num or 1) * 1000
            num = 0
        else:
            return None
    total += num
    if total == 0 and not unit_seen:
        return CHINESE_NUM.get(s)
    return total or None


def chapter_order(ch: dict[str, Any], title_key: str, fallback_key: str) -> int:
    title = str(ch.get(title_key) or "")
    m = ARABIC_CHAPTER_RE.search(title)
    if m:
        return int(m.group(1))
    m = CHINESE_CHAPTER_RE.search(title)
    if m:
        n = chinese_num_to_int(m.group(1))
        if n is not None:
            return n
    val = ch.get(fallback_key)
    try:
        return int(val)
    except Exception:
        return 10**12


def phase_positions(n: int) -> dict[str, int]:
    if n <= 0:
        return {}
    if n == 1:
        return {"前期": 0}
    if n == 2:
        return {"前期": 0, "后期": 1}
    return {
        "前期": min(n - 1, max(0, round((n - 1) * 0.08))),
        "中期": min(n - 1, max(0, round((n - 1) * 0.50))),
        "后期": min(n - 1, max(0, round((n - 1) * 0.88))),
    }


def count_hits(text: str) -> Counter[str]:
    c: Counter[str] = Counter()
    for name, pat in HIT_REGEX:
        n = len(pat.findall(text))
        if n:
            c[name] += n
    return c


def top_hit_names(counter: Counter[str], limit: int = 4) -> list[str]:
    return [name for name, _ in counter.most_common(limit)]


def dialogue_ratio(text: str) -> float:
    if not text:
        return 0.0
    return sum(len(m.group(0)) for m in QUOTE_RE.finditer(text)) / len(text)


def system_bracket(text: str) -> bool:
    return bool(re.search(r"【[^】]{2,100}】|\[[^\]]{2,100}\]", text[:1800]))


def get_fanqie_book_chapters(db: Any, book_id: str) -> list[dict[str, Any]]:
    chs = list(db.chapters.find({"book_id": str(book_id), "txt_content": {"$exists": True, "$ne": ""}}, {"chapter_id": 1, "chapter_name": 1, "txt_content": 1, "word_count": 1, "created_at": 1}))
    chs.sort(key=lambda ch: (chapter_order(ch, "chapter_name", "chapter_id"), str(ch.get("chapter_id") or "")))
    return chs


def get_qimao_phase_chapters(db: Any, book_id: Any, chapter_count: int) -> list[dict[str, Any]]:
    # qimao_chapters is large; fetch only target phase indexes instead of every chapter.
    positions = phase_positions(max(0, chapter_count))
    wanted = {phase: idx + 1 for phase, idx in positions.items()}  # chapter_index is 1-based.
    if not wanted:
        return []
    projection = {"chapter_index": 1, "chapter_title": 1, "content": 1, "content_length": 1}
    q = {"book_id": str(book_id), "chapter_index": {"$in": list(wanted.values())}, "content": {"$exists": True, "$ne": ""}}
    chs = list(db.qimao_chapters.find(q, projection))
    if not chs and str(book_id).isdigit():
        q["book_id"] = int(book_id)
        chs = list(db.qimao_chapters.find(q, projection))
    phase_by_idx = {idx: phase for phase, idx in wanted.items()}
    for ch in chs:
        ch["_phase"] = phase_by_idx.get(ch.get("chapter_index"))
    chs.sort(key=lambda ch: (chapter_order(ch, "chapter_title", "chapter_index"), int(ch.get("chapter_index") or 0)))
    return chs


def windows_from_chapters(book_title: str, chs: list[dict[str, Any]], text_key: str, title_key: str) -> list[ChapterWindow]:
    if not chs:
        return []
    pos = phase_positions(len(chs))
    out: list[ChapterWindow] = []
    used: set[int] = set()
    for phase, idx in pos.items():
        if idx in used:
            continue
        used.add(idx)
        ch = chs[idx]
        text = clean(ch.get(text_key))
        if len(text) < 200:
            continue
        out.append(ChapterWindow(phase, text, str(ch.get(title_key) or ""), book_title))
    return out


def fanqie_candidates(db: Any, genre: str, limit: int) -> tuple[int, list[dict[str, Any]]]:
    q = {"category": genre}
    count = db.books.count_documents(q)
    books = list(db.books.find(q, {"book_id": 1, "book_name": 1, "score": 1, "total_chapters": 1, "chapter_count": 1, "word_number": 1, "read_count": 1}).sort([("score", -1), ("total_chapters", -1), ("chapter_count", -1)]).limit(max(limit * 3, limit)))
    usable = []
    for b in books:
        ch_count = db.chapters.count_documents({"book_id": str(b.get("book_id")), "txt_content": {"$exists": True, "$ne": ""}})
        if ch_count >= 3:
            b["_usable_chapter_count"] = ch_count
            usable.append(b)
        if len(usable) >= limit:
            break
    return count, usable


def qimao_candidates(db: Any, genre: str, limit: int) -> tuple[int, list[dict[str, Any]]]:
    q = QIMAO_TARGETS.get(genre)
    if not q:
        return 0, []
    count = db.qimao_detail.count_documents(q)
    if limit <= 0:
        return count, []
    # Return extra candidates; the analysis loop skips any book whose requested phase chapters are missing.
    books = list(db.qimao_detail.find(q, {"_id": 1, "title": 1, "downloaded_chapter_count": 1, "chapter_count": 1, "category1_name": 1, "category2_name": 1}).sort([("downloaded_chapter_count", -1), ("chapter_count", -1)]).limit(max(limit * 4, limit)))
    return count, books


def analyze_genre(db: Any, genre: str, sample_books: int) -> dict[str, Any]:
    q_total, _ = qimao_candidates(db, genre, 0)
    fanqie_count, f_books = fanqie_candidates(db, genre, sample_books)
    # Prefer exact topic samples from the target longform set, but keep a few
    # supplemental same-genre books when available so the card does not overfit
    # a tiny platform slice.
    if q_total > 0 and fanqie_count > 0 and len(f_books) > 8:
        f_books = f_books[:8]
    q_count, q_books = qimao_candidates(db, genre, max(0, sample_books - len(f_books)))

    windows: list[ChapterWindow] = []
    sampled_titles: list[str] = []

    for b in f_books:
        title = str(b.get("book_name") or "")
        sampled_titles.append(title)
        chs = get_fanqie_book_chapters(db, str(b.get("book_id")))
        windows.extend(windows_from_chapters(title, chs, "txt_content", "chapter_name"))

    for b in q_books:
        if len(sampled_titles) >= sample_books:
            break
        title = str(b.get("title") or "")
        chapter_count = int(b.get("downloaded_chapter_count") or b.get("chapter_count") or 0)
        chs = get_qimao_phase_chapters(db, b.get("_id"), chapter_count)
        book_windows = []
        for ch in chs:
            text = clean(ch.get("content"))
            phase = ch.get("_phase") or ""
            if phase and len(text) >= 200:
                book_windows.append(ChapterWindow(phase, text, str(ch.get("chapter_title") or ""), title))
        if book_windows:
            sampled_titles.append(title)
            windows.extend(book_windows)

    phase_hits: dict[str, Counter[str]] = defaultdict(Counter)
    para_lens: list[float] = []
    dialog_total = 0.0
    bracket_count = 0
    chars_total = 0
    windows_by_phase = Counter(w.phase for w in windows)

    for w in windows:
        text = w.text
        ps = paras(text)
        if ps:
            para_lens.append(median([len(p) for p in ps]))
        chars_total += len(text)
        dialog_total += sum(len(m.group(0)) for m in QUOTE_RE.finditer(text))
        if system_bracket(text):
            bracket_count += 1
        # Full-window hits are less opening-biased now; phase label carries position.
        phase_hits[w.phase].update(count_hits(text))

    sampled_count = len(sampled_titles)
    available_count = fanqie_count + q_count
    confidence = "high" if available_count >= 30 and sampled_count >= 10 else "medium" if available_count >= 8 and sampled_count >= 5 else "low"
    result = {
        "genre": genre,
        "books_available": available_count,
        "books_sampled": sampled_count,
        "windows_total": len(windows),
        "windows_by_phase": dict(windows_by_phase),
        "confidence_from_sample": confidence,
        "median_para_chars": round(median(para_lens), 1) if para_lens else None,
        "dialogue_ratio": round(dialog_total / chars_total, 3) if chars_total else None,
        "system_bracket_pct": round(bracket_count / len(windows), 3) if windows else None,
        "phase_hits": {phase: top_hit_names(phase_hits.get(phase, Counter())) for phase in ["前期", "中期", "后期"]},
        "sample_books": sampled_titles[:12],
    }
    result["summary"] = build_summary(result)
    return result


def fmt_pct(x: float | None) -> str:
    if x is None:
        return "样本不足"
    return f"{round(x * 100)}%"


def build_summary(r: dict[str, Any]) -> str:
    phase_counts = r.get("windows_by_phase") or {}
    phase_count_text = "/".join(str(phase_counts.get(p, 0)) for p in ["前期", "中期", "后期"])
    stats = []
    if r.get("median_para_chars") is not None:
        stats.append(f"段落中位约 {r['median_para_chars']} 字")
    if r.get("dialogue_ratio") is not None:
        stats.append(f"对话约占 {fmt_pct(r['dialogue_ratio'])}")
    if r.get("system_bracket_pct") is not None and r["system_bracket_pct"] >= 0.08:
        stats.append(f"系统/面板提示约 {fmt_pct(r['system_bracket_pct'])}")
    stats_text = "，".join(stats) if stats else "基础统计不足"
    prefix = "本地同题材长篇样本"
    if r.get("confidence_from_sample") == "low":
        prefix = "本地同题材长篇样本（样本偏少）"
    elif r.get("confidence_from_sample") == "medium":
        prefix = "本地同题材长篇样本（样本量中等）"
    note_text = "使用提醒：只作题材参考，帮你抓常见场面和前中后写法；本书设定与同题材对标仍优先。"
    return (
        f"样本说明：{prefix}，可用 {r['books_available']} 本；抽样 {r['books_sampled']} 本，"
        f"前/中/后章节段 {phase_count_text}，共 {r['windows_total']} 个。\n"
        f"正文参考：{stats_text}。\n"
        f"{note_text}"
    )


def card_names(card_dir: Path) -> list[str]:
    return sorted(p.stem for p in card_dir.glob("*.md"))


def upsert_landing_section(text: str, genre: str) -> str:
    landing = GENRE_LANDING_POINTS.get(genre)
    if not landing:
        return text
    section = "## 正文落点\n" + landing.strip() + "\n"
    if re.search(r"## 正文落点\n.*?(?=\n## |\Z)", text, flags=re.S):
        return re.sub(r"## 正文落点\n.*?(?=\n## |\Z)", section, text, flags=re.S)
    return re.sub(r"(## 场景颗粒\n.*?)(?=\n## 节奏密度)", r"\1\n\n" + section, text, flags=re.S)


def upsert_stage_section(text: str, genre: str) -> str:
    playbook = GENRE_STAGE_PLAYBOOK.get(genre)
    if not playbook:
        return text
    section = "## 前中后期打法\n" + playbook.strip() + "\n"
    if re.search(r"## 前中后期打法\n.*?(?=\n## |\Z)", text, flags=re.S):
        return re.sub(r"## 前中后期打法\n.*?(?=\n## |\Z)", section, text, flags=re.S)
    if "## 正文落点" in text:
        return re.sub(r"(## 正文落点\n.*?)(?=\n## 节奏密度)", r"\1\n\n" + section, text, flags=re.S)
    return re.sub(r"(## 场景颗粒\n.*?)(?=\n## 节奏密度)", r"\1\n\n" + section, text, flags=re.S)


def update_cards(results: Iterable[dict[str, Any]], card_dir: Path) -> None:
    by_genre = {r["genre"]: r for r in results}
    for genre, r in by_genre.items():
        path = card_dir / f"{genre}.md"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        new = upsert_landing_section(text, genre)
        new = upsert_stage_section(new, genre)
        new = re.sub(r"## 证据摘要\n.*?(?=\n## |\Z)", "## 证据摘要\n" + r["summary"].strip() + "\n", new, flags=re.S)
        path.write_text(new, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--mongo-uri", default=DEFAULT_MONGO_URI)
    ap.add_argument("--card-dir", type=Path, default=CARD_DIR)
    ap.add_argument("--sample-books", type=int, default=24)
    ap.add_argument("--out", type=Path, default=Path("/tmp/genre-card-phase-samples.jsonl"))
    ap.add_argument("--update-cards", action="store_true", help="Replace the 证据摘要 section in each genre card.")
    args = ap.parse_args()

    client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=5000)

    try:
        db = client.get_default_database()
    except Exception:
        db = client.novel
    results = [analyze_genre(db, genre, args.sample_books) for genre in card_names(args.card_dir)]
    args.out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n", encoding="utf-8")
    if args.update_cards:
        update_cards(results, args.card_dir)
    for r in results:
        print(f"{r['genre']}: {r['summary']}")
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
