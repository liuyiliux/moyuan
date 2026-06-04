import { useStyleTheme } from "./style-theme";
import type { StyleTheme } from "./style-theme";

/** 三风格文案映射 */
export type CopyText<T extends Record<string, string>> = Record<StyleTheme, T>;

/** 根据当前风格获取对应文案 */
export function useCopy<T extends Record<string, string>>(texts: CopyText<T>): T {
  const { styleTheme } = useStyleTheme();
  return texts[styleTheme] || texts.daoist;
}

/* ═══════════════════════════════════════
   页面文案：道 / 常 / 萌 三风格
   每个页面一组，结构统一
   ═══════════════════════════════════════ */

// ── tags（符印 / 标签管理 / 标签标签~）──

export const tagsCopy: CopyText<{
  title: string;
  subtitle: string;
  btnCreate: string;
  creating: string;
  placeholder: string;
  empty: string;
  emptyHint: string;
  toastCreated: string;
  toastDeleted: string;
  confirmTitle: string;
  confirmMsg: (name: string) => string;
  confirmBtn: string;
}> = {
  daoist: {
    title: "符印",
    subtitle: "炼制符文，标记道藏",
    btnCreate: "炼制符印",
    creating: "炼制中...",
    placeholder: "书符印之名",
    empty: "暂无符印",
    emptyHint: "炼制一枚符印以标记道藏",
    toastCreated: "符印炼制成功",
    toastDeleted: "符印已抹去",
    confirmTitle: "抹去符印",
    confirmMsg: (name: string) => `确要抹去符印「${name}」？道藏条目不受影响。`,
    confirmBtn: "抹去",
  },
  normal: {
    title: "标签管理",
    subtitle: "创建和管理内容标签",
    btnCreate: "创建标签",
    creating: "创建中...",
    placeholder: "输入标签名称",
    empty: "暂无标签",
    emptyHint: "创建一个标签来分类内容",
    toastCreated: "标签创建成功",
    toastDeleted: "标签已删除",
    confirmTitle: "删除标签",
    confirmMsg: (name: string) => `确定要删除标签「${name}」？关联内容不会被删除。`,
    confirmBtn: "删除",
  },
  anime: {
    title: "标签标签~",
    subtitle: "给内容贴上可爱的标签吧☆",
    btnCreate: "创建标签喵~",
    creating: "创建中喵...",
    placeholder: "给标签起个名字吧~",
    empty: "还没有标签哦~",
    emptyHint: "快来贴一个可爱的标签吧！(=^･ω･^=)",
    toastCreated: "标签创建成功啦~☆",
    toastDeleted: "标签已经消失啦~",
    confirmTitle: "真的要删掉吗？",
    confirmMsg: (name: string) => `「${name}」标签要被删掉了哦...真的没关系吗？(´；ω；\`)`,
    confirmBtn: "忍痛删除",
  },
};

// ── categories（坤舆 / 分类管理 / 分类分类~）──

export const categoriesCopy: CopyText<{
  title: string;
  subtitle: string;
  btnCreate: string;
  btnCancel: string;
  btnUpdate: string;
  placeholder: string;
  empty: string;
  emptyHint: string;
  toastCreated: string;
  toastUpdated: string;
  toastDeleted: string;
  confirmTitle: string;
  confirmMsg: (name: string) => string;
  parentLabel: string;
  parentRoot: string;
}> = {
  daoist: {
    title: "坤舆",
    subtitle: "大地载物，分门别类",
    btnCreate: "开辟坤舆",
    btnCancel: "收回",
    btnUpdate: "更易",
    placeholder: "坤舆之名",
    empty: "坤舆未辟",
    emptyHint: "开辟一方坤舆以承载道藏",
    toastCreated: "坤舆开辟成功",
    toastUpdated: "坤舆已更易",
    toastDeleted: "坤舆已抹去",
    confirmTitle: "抹去坤舆",
    confirmMsg: (name: string) => `确要抹去坤舆「${name}」？道藏条目不受影响。`,
    parentLabel: "归入坤舆",
    parentRoot: "（四方之极）",
  },
  normal: {
    title: "分类管理",
    subtitle: "组织内容的层级分类结构",
    btnCreate: "新建分类",
    btnCancel: "取消",
    btnUpdate: "更新",
    placeholder: "分类名称",
    empty: "暂无分类",
    emptyHint: "创建分类来组织内容结构",
    toastCreated: "分类创建成功",
    toastUpdated: "分类已更新",
    toastDeleted: "分类已删除",
    confirmTitle: "删除分类",
    confirmMsg: (name: string) => `确定删除分类「${name}」？内容不会被删除，只会移出该分类。`,
    parentLabel: "父分类",
    parentRoot: "（根分类）",
  },
  anime: {
    title: "分类分类~",
    subtitle: "把内容整理得整整齐齐的呢☆",
    btnCreate: "新建分类喵~",
    btnCancel: "不要了",
    btnUpdate: "改好啦",
    placeholder: "给分类取个名字吧~",
    empty: "还没有分类呢",
    emptyHint: "来创建一个分类整理一下吧！(◕‿◕✿)",
    toastCreated: "分类创建好啦~☆",
    toastUpdated: "分类更新啦~",
    toastDeleted: "分类消失啦~",
    confirmTitle: "真的要删掉吗？",
    confirmMsg: (name: string) => `「${name}」分类要被删掉了...里面的内容不会被删哦~`,
    parentLabel: "放在哪个大类下面",
    parentRoot: "（最上面）",
  },
};

// ── favorites（珍藏 / 收藏夹 / 收藏收藏~）──

export const favoritesCopy: CopyText<{
  title: string;
  sectionTitle: string;
  btnCreate: string;
  btnCancel: string;
  creating: string;
  placeholder: string;
  descPlaceholder: string;
  empty: string;
  emptyHint: string;
  emptyContent: string;
  emptyContentHint: string;
  toastCreated: string;
  toastDeleted: string;
  toastRemoved: string;
  confirmDeleteTitle: string;
  confirmDeleteMsg: (name: string) => string;
  loading: string;
}> = {
  daoist: {
    title: "珍藏",
    sectionTitle: "吾之珍藏",
    btnCreate: "开启珍藏",
    btnCancel: "收回",
    creating: "开启中...",
    placeholder: "珍藏之名",
    descPlaceholder: "珍藏之述（可略）",
    empty: "尚无珍藏",
    emptyHint: "开启一方珍藏以纳至宝",
    emptyContent: "此珍藏中尚无道藏",
    emptyContentHint: "浏览道藏时点珍藏即可纳入",
    toastCreated: "珍藏开启成功",
    toastDeleted: "珍藏已抹去",
    toastRemoved: "已从珍藏中移出",
    confirmDeleteTitle: "抹去珍藏",
    confirmDeleteMsg: (name: string) => `确要抹去珍藏「${name}」？内容不受影响。`,
    loading: "感应中...",
  },
  normal: {
    title: "收藏夹",
    sectionTitle: "我的收藏",
    btnCreate: "新建收藏夹",
    btnCancel: "取消",
    creating: "创建中...",
    placeholder: "新收藏夹名称",
    descPlaceholder: "描述（可选）",
    empty: "暂无收藏夹",
    emptyHint: "新建一个收藏夹来保存内容",
    emptyContent: "此收藏夹暂无内容",
    emptyContentHint: "浏览内容时点击收藏即可添加",
    toastCreated: "收藏夹创建成功",
    toastDeleted: "收藏夹已删除",
    toastRemoved: "已从收藏夹移除",
    confirmDeleteTitle: "删除收藏夹",
    confirmDeleteMsg: (name: string) => `确定要删除收藏夹「${name}」？内容不会被删除。`,
    loading: "加载中...",
  },
  anime: {
    title: "珍藏珍藏~",
    sectionTitle: "我的小宝藏",
    btnCreate: "创建珍藏夹喵~",
    btnCancel: "算了",
    creating: "创建中喵...",
    placeholder: "给珍藏夹起个名字~",
    descPlaceholder: "写点描述吧（可以跳过哦~）",
    empty: "还没有珍藏夹呢",
    emptyHint: "快来创建第一个珍藏夹吧！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
    emptyContent: "这个珍藏夹还是空的哦~",
    emptyContentHint: "看到喜欢的内容就点珍藏吧！",
    toastCreated: "珍藏夹创建好啦~☆",
    toastDeleted: "珍藏夹消失啦~",
    toastRemoved: "已经从珍藏夹移出啦~",
    confirmDeleteTitle: "真的不要了吗？",
    confirmDeleteMsg: (name: string) => `「${name}」珍藏夹要消失了哦...确定没问题吗？(´•̥̥̥ω•̥̥̥\`)`,
    loading: "努力加载中...",
  },
};

// ── collections（藏经 / 合集管理 / 合集合集~）──

export const collectionsCopy: CopyText<{
  title: string;
  subtitle: string;
  btnCreate: string;
  btnCancel: string;
  creating: string;
  placeholder: string;
  descPlaceholder: string;
  searchPlaceholder: string;
  modalTitle: string;
  empty: string;
  emptyHint: string;
  emptySearch: string;
  emptySearchHint: string;
  detailBack: string;
  detailItems: (n: number) => string;
  detailEmpty: string;
  detailEmptyHint: string;
  detailAddBtn: string;
  itemCount: (n: number) => string;
  confirmDeleteTitle: string;
  confirmDeleteMsg: (name: string) => string;
  confirmRemoveTitle: string;
  confirmRemoveMsg: (title: string) => string;
  confirmRemoveBtn: string;
  formatDate: (d: string) => string;
  editTitle: string;
  editNameLabel: string;
  editDescLabel: string;
  editSave: string;
  editSaving: string;
  editBtnTooltip: string;
  quizBtnTooltip: string;
  quizDetailBtn: string;
}> = {
  daoist: {
    title: "藏经",
    subtitle: "万卷归藏，经纶汇聚",
    btnCreate: "编纂藏经",
    btnCancel: "收回",
    creating: "编纂中...",
    placeholder: "藏经之名",
    descPlaceholder: "藏经之述（可略）",
    searchPlaceholder: "搜寻藏经...",
    modalTitle: "编纂新藏经",
    empty: "尚无藏经",
    emptyHint: "编纂一部藏经以汇聚道藏",
    emptySearch: "未寻得匹配藏经",
    emptySearchHint: "换一言以试之",
    detailBack: "返回",
    detailItems: (n: number) => `道藏条目 (${n})`,
    detailEmpty: "藏经中尚无条目",
    detailEmptyHint: "点击上方按钮添加道藏",
    detailAddBtn: "添加道藏入藏经",
    itemCount: (n: number) => `${n} 卷`,
    confirmDeleteTitle: "焚毁藏经",
    confirmDeleteMsg: (name: string) => `确要焚毁藏经「${name}」？道藏不受影响。`,
    confirmRemoveTitle: "移出道藏",
    confirmRemoveMsg: (title: string) => `确要将「${title}」移出此藏经？`,
    confirmRemoveBtn: "移出",
    formatDate: (d: string) => d,
    editTitle: "修订藏经",
    editNameLabel: "藏经之名",
    editDescLabel: "藏经之述",
    editSave: "保存修订",
    editSaving: "修订中...",
    editBtnTooltip: "修订藏经",
    quizBtnTooltip: "考校此藏经",
    quizDetailBtn: "考校此藏经",
  },
  normal: {
    title: "合集管理",
    subtitle: "创建和管理内容合集",
    btnCreate: "新建合集",
    btnCancel: "取消",
    creating: "创建中...",
    placeholder: "合集名称",
    descPlaceholder: "输入合集描述（可选）",
    searchPlaceholder: "搜索合集...",
    modalTitle: "新建合集",
    empty: "还没有合集",
    emptyHint: "创建你的第一个合集来整理内容",
    emptySearch: "没有找到匹配的合集",
    emptySearchHint: "尝试使用不同的关键词搜索",
    detailBack: "返回",
    detailItems: (n: number) => `内容列表 (${n})`,
    detailEmpty: "合集中还没有内容",
    detailEmptyHint: "点击上方按钮添加内容",
    detailAddBtn: "添加内容到合集",
    itemCount: (n: number) => `${n} 个内容`,
    confirmDeleteTitle: "删除合集",
    confirmDeleteMsg: (name: string) => `确定删除合集「${name}」？合集内的内容不会被删除。`,
    confirmRemoveTitle: "移除内容",
    confirmRemoveMsg: (title: string) => `确定将「${title}」从合集中移除？`,
    confirmRemoveBtn: "移除",
    formatDate: (d: string) => d,
    editTitle: "编辑合集",
    editNameLabel: "合集名称",
    editDescLabel: "合集描述",
    editSave: "保存修改",
    editSaving: "保存中...",
    editBtnTooltip: "编辑合集",
    quizBtnTooltip: "对合集出题",
    quizDetailBtn: "对合集出题",
  },
  anime: {
    title: "合集合集~",
    subtitle: "把喜欢的内容收集在一起吧☆",
    btnCreate: "创建合集喵~",
    btnCancel: "不要了",
    creating: "创建中喵...",
    placeholder: "给合集起个名字~",
    descPlaceholder: "描述一下这个合集吧~",
    searchPlaceholder: "搜索合集喵...",
    modalTitle: "创建新合集",
    empty: "还没有合集呢~",
    emptyHint: "来创建第一个合集吧！(◍•ᴗ•◍)❤",
    emptySearch: "没找到匹配的合集呢~",
    emptySearchHint: "换个关键词试试吧！",
    detailBack: "回去",
    detailItems: (n: number) => `内容列表 (${n}个)`,
    detailEmpty: "合集里还没有内容呢~",
    detailEmptyHint: "点上面按钮来添加内容吧！",
    detailAddBtn: "把内容加入合集~",
    itemCount: (n: number) => `${n} 个宝贝`,
    confirmDeleteTitle: "真的要删掉吗？",
    confirmDeleteMsg: (name: string) => `「${name}」合集要消失了...里面的内容不会丢的哦~`,
    confirmRemoveTitle: "移出内容",
    confirmRemoveMsg: (title: string) => `要把「${title}」从合集里移出去吗？`,
    confirmRemoveBtn: "移出去~",
    formatDate: (d: string) => d,
    editTitle: "编辑合集喵~",
    editNameLabel: "合集名字",
    editDescLabel: "合集描述",
    editSave: "保存修改喵~",
    editSaving: "保存中喵...",
    editBtnTooltip: "编辑合集",
    quizBtnTooltip: "来出题吧！",
    quizDetailBtn: "来出题吧☆",
  },
};

// ── brains（丹室 / 工作区管理 / 工作区工作区~）──

export const brainsCopy: CopyText<{
  title: string;
  subtitle: string;
  btnCreate: string;
  tabActive: string;
  tabArchived: (n: number) => string;
  empty: string;
  emptyHint: string;
  emptyArchived: string;
  emptyArchivedHint: string;
  modalCreate: string;
  modalEdit: string;
  modalConfig: (name: string) => string;
  labelName: string;
  labelDesc: string;
  labelIcon: string;
  phName: string;
  phDesc: string;
  phIcon: string;
  btnSave: string;
  btnCancel: string;
  btnDelete: string;
  btnArchive: string;
  btnRestore: string;
  confirmDeleteTitle: string;
  confirmDeleteMsg: (name: string) => string;
  confirmDeleteBtn: string;
  itemCount: (n: number) => string;
  defaultBadge: string;
}> = {
  daoist: {
    title: "丹室",
    subtitle: "炉火纯青，修炼之地",
    btnCreate: "开立丹室",
    tabActive: "活跃丹室",
    tabArchived: (n: number) => `已封存 (${n})`,
    empty: "尚无丹室",
    emptyHint: "开立一方丹室以修炼道藏",
    emptyArchived: "暂无已封存丹室",
    emptyArchivedHint: "所有丹室都在活跃修炼中",
    modalCreate: "开立丹室",
    modalEdit: "更易丹室",
    modalConfig: (name: string) => `丹火配置 — ${name}`,
    labelName: "丹室之名 *",
    labelDesc: "丹室之述",
    labelIcon: "丹纹（emoji）",
    phName: "丹室之名",
    phDesc: "述丹室之用途",
    phIcon: "🧠",
    btnSave: "保存",
    btnCancel: "取消",
    btnDelete: "焚毁",
    btnArchive: "封存",
    btnRestore: "解封",
    confirmDeleteTitle: "焚毁丹室",
    confirmDeleteMsg: (name: string) => `确要焚毁丹室「${name}」？此操作不可逆，所有道藏将一并湮灭。`,
    confirmDeleteBtn: "确焚丹室",
    itemCount: (n: number) => `${n} 条道藏`,
    defaultBadge: "主丹室",
  },
  normal: {
    title: "工作区管理",
    subtitle: "管理你的知识库和工作空间",
    btnCreate: "新建工作区",
    tabActive: "活跃工作区",
    tabArchived: (n: number) => `已归档 (${n})`,
    empty: "还没有工作区",
    emptyHint: "创建你的第一个工作区开始使用",
    emptyArchived: "暂无已归档工作区",
    emptyArchivedHint: "所有工作区都处于活跃状态",
    modalCreate: "新建工作区",
    modalEdit: "编辑工作区",
    modalConfig: (name: string) => `AI 配置 — ${name}`,
    labelName: "工作区名称 *",
    labelDesc: "描述",
    labelIcon: "图标（emoji）",
    phName: "输入工作区名称",
    phDesc: "可选描述",
    phIcon: "🧠",
    btnSave: "保存",
    btnCancel: "取消",
    btnDelete: "删除",
    btnArchive: "归档",
    btnRestore: "恢复",
    confirmDeleteTitle: "删除工作区",
    confirmDeleteMsg: (name: string) => `确定要删除「${name}」吗？此操作不可恢复，该工作区下的所有内容将被永久删除。`,
    confirmDeleteBtn: "确认删除",
    itemCount: (n: number) => `${n} 条内容`,
    defaultBadge: "默认",
  },
  anime: {
    title: "工作区工作区~",
    subtitle: "在这里修炼各种知识喵☆",
    btnCreate: "创建新区喵~",
    tabActive: "活跃中的区",
    tabArchived: (n: number) => `已休眠 (${n})`,
    empty: "还没有工作区呢~",
    emptyHint: "创建第一个工作区开始冒险吧！(ﾉ◕ヮ◕)ﾉ",
    emptyArchived: "没有休眠中的工作区哦~",
    emptyArchivedHint: "大家都很精神呢！",
    modalCreate: "创建新工作区",
    modalEdit: "编辑工作区",
    modalConfig: (name: string) => `AI 设置 — ${name}`,
    labelName: "工作区名字 *",
    labelDesc: "简单描述一下",
    labelIcon: "图标（emoji）",
    phName: "给工作区起个名字",
    phDesc: "描述一下这个区是做什么的~",
    phIcon: "🧠",
    btnSave: "保存啦",
    btnCancel: "不要了",
    btnDelete: "删除掉",
    btnArchive: "让它休眠",
    btnRestore: "唤醒它",
    confirmDeleteTitle: "真的要删掉吗？",
    confirmDeleteMsg: (name: string) => `「${name}」工作区要被彻底删除...里面的所有内容都会消失哦！真的想好了吗？(´；д；\`)`,
    confirmDeleteBtn: "忍痛确认",
    itemCount: (n: number) => `${n} 条内容`,
    defaultBadge: "主力担当",
  },
};

// ── analytics（卦象 / 统计 / 数据数据~）──

export const analyticsCopy: CopyText<{
  title: string;
  subtitle: string;
  totalContents: string;
  totalSize: string;
  byType: string;
  byMonth: string;
  topTags: string;
  noData: string;
  error: string;
}> = {
  daoist: {
    title: "卦象",
    subtitle: "观卦象以知兴替，览天机以明得失",
    totalContents: "道藏总数",
    totalSize: "道藏体量",
    byType: "按类分布",
    byMonth: "每月纳新",
    topTags: "常用符印",
    noData: "尚无道藏，卦象为空",
    error: "卦象读取失败",
  },
  normal: {
    title: "统计",
    subtitle: "内容数据分析与可视化",
    totalContents: "内容总数",
    totalSize: "总大小",
    byType: "按类型分布",
    byMonth: "每月新增",
    topTags: "常用标签",
    noData: "暂无内容数据",
    error: "数据加载失败",
  },
  anime: {
    title: "数据喵~",
    subtitle: "看看你的知识库长什么样了呢☆",
    totalContents: "内容总数",
    totalSize: "总大小",
    byType: "按类型分",
    byMonth: "每月新增",
    topTags: "最受欢迎的标签",
    noData: "还没有数据呢~快来添加内容吧！",
    error: "数据获取失败了喵...",
  },
};

// ── backup（封魔 / 备份 / 备份备份~）──

export const backupCopy: CopyText<{
  title: string;
  subtitle: string;
  btnCreate: string;
  btnExport: string;
  creating: string;
  exporting: string;
  loading: string;
  empty: string;
  emptyHint: string;
  confirmTitle: string;
  confirmMsg: (name: string) => string;
  toastCreated: string;
  toastDeleted: string;
  toastExported: string;
}> = {
  daoist: {
    title: "封魔",
    subtitle: "封印术式，护道藏不灭",
    btnCreate: "施展封印",
    btnExport: "导出封印",
    creating: "封印中...",
    exporting: "导出中...",
    loading: "感应封印中...",
    empty: "尚无封印",
    emptyHint: "施展一道封印以护道藏周全",
    confirmTitle: "解除封印",
    confirmMsg: (name: string) => `确要解除「${name}」封印？`,
    toastCreated: "封印施展成功",
    toastDeleted: "封印已解除",
    toastExported: "封印导出成功",
  },
  normal: {
    title: "备份",
    subtitle: "数据备份与恢复管理",
    btnCreate: "创建备份",
    btnExport: "导出备份",
    creating: "备份中...",
    exporting: "导出中...",
    loading: "加载备份列表...",
    empty: "暂无备份",
    emptyHint: "创建备份以保护数据安全",
    confirmTitle: "删除备份",
    confirmMsg: (name: string) => `确定删除备份「${name}」？`,
    toastCreated: "备份创建成功",
    toastDeleted: "备份已删除",
    toastExported: "备份导出成功",
  },
  anime: {
    title: "备份备份~",
    subtitle: "保护数据不丢失的重要操作☆",
    btnCreate: "创建备份喵~",
    btnExport: "导出备份",
    creating: "备份中喵...",
    exporting: "导出中...",
    loading: "加载中喵...",
    empty: "还没有备份呢",
    emptyHint: "快做一个备份保护数据安全吧！(｀・ω・´)",
    confirmTitle: "删除备份",
    confirmMsg: (name: string) => `「${name}」备份要消失了呢~确定吗？`,
    toastCreated: "备份创建好啦~☆",
    toastDeleted: "备份已删除~",
    toastExported: "备份导出成功~",
  },
};

// ── settings（玄台 / 设置 / 设置设置~）──

export const settingsCopy: CopyText<{
  title: string;
  subtitle: string;
  tabGeneral: string;
  tabAI: string;
  tabStorage: string;
  tabEmbed: string;
  reindexTitle: string;
  reindexDesc: string;
  reindexBtn: string;
  reindexRefresh: string;
  storageTitle: string;
  storagePlaceholder: string;
  storageUpdate: string;
  storageUpdating: string;
}> = {
  daoist: {
    title: "玄台",
    subtitle: "调和阴阳，统摄万机",
    tabGeneral: "常规",
    tabAI: "AI",
    tabStorage: "存储",
    tabEmbed: "嵌入",
    reindexTitle: "索引导引",
    reindexDesc: "更换嵌入模型或需重建索引时，可清空现有嵌入并重新生成。",
    reindexBtn: "重建索引",
    reindexRefresh: "刷新卦象",
    storageTitle: "道藏根径",
    storagePlaceholder: "输入新的道藏存储路径...",
    storageUpdate: "更新路径",
    storageUpdating: "更易中...",
  },
  normal: {
    title: "设置",
    subtitle: "系统设置与配置管理",
    tabGeneral: "常规",
    tabAI: "AI",
    tabStorage: "存储",
    tabEmbed: "嵌入",
    reindexTitle: "索引管理",
    reindexDesc: "当更换嵌入模型或需要重建索引时，可以清空现有嵌入并重新生成。",
    reindexBtn: "重建索引",
    reindexRefresh: "刷新统计",
    storageTitle: "存储路径",
    storagePlaceholder: "输入新的存储路径...",
    storageUpdate: "更新路径",
    storageUpdating: "更新中...",
  },
  anime: {
    title: "设置设置~",
    subtitle: "调整一下让体验更好吧☆",
    tabGeneral: "基本",
    tabAI: "AI",
    tabStorage: "存储",
    tabEmbed: "向量",
    reindexTitle: "索引管理",
    reindexDesc: "换了模型或者想重建索引的时候点这里~",
    reindexBtn: "重建索引喵~",
    reindexRefresh: "刷新数据",
    storageTitle: "存储文件夹",
    storagePlaceholder: "输入新的存储路径喵...",
    storageUpdate: "更新路径",
    storageUpdating: "更新中喵...",
  },
};

// ── recycle（归墟 / 回收站 / 回收站回收站~）──

export const recycleCopy: CopyText<{
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  empty: string;
  emptyHint: string;
  loading: string;
  btnRestore: string;
  btnDelete: string;
  restoring: string;
  deleting: string;
  confirmRestoreTitle: string;
  confirmRestoreMsg: (name: string) => string;
  confirmDeleteTitle: string;
  confirmDeleteMsg: (name: string) => string;
  toastRestored: string;
  toastDeleted: string;
  daysLeft: (n: number) => string;
}> = {
  daoist: {
    title: "归墟",
    subtitle: "万物终归墟，尚余一线生机",
    searchPlaceholder: "搜寻归墟...",
    empty: "归墟清净",
    emptyHint: "尚无道藏坠入归墟",
    loading: "窥探归墟中...",
    btnRestore: "召回",
    btnDelete: "永灭",
    restoring: "召回中...",
    deleting: "永灭中...",
    confirmRestoreTitle: "召回道藏",
    confirmRestoreMsg: (name: string) => `确要召回「${name}」重返道藏？`,
    confirmDeleteTitle: "永久湮灭",
    confirmDeleteMsg: (name: string) => `确要将「${name}」永久湮灭？此操作不可逆。`,
    toastRestored: "道藏已召回",
    toastDeleted: "道藏已永灭",
    daysLeft: (n: number) => `余 ${n} 日`,
  },
  normal: {
    title: "回收站",
    subtitle: "已删除内容的临时存放处",
    searchPlaceholder: "搜索回收站...",
    empty: "回收站为空",
    emptyHint: "暂无已删除的内容",
    loading: "加载回收站...",
    btnRestore: "恢复",
    btnDelete: "永久删除",
    restoring: "恢复中...",
    deleting: "删除中...",
    confirmRestoreTitle: "恢复内容",
    confirmRestoreMsg: (name: string) => `确定恢复「${name}」？`,
    confirmDeleteTitle: "永久删除",
    confirmDeleteMsg: (name: string) => `确定永久删除「${name}」？此操作不可恢复。`,
    toastRestored: "内容已恢复",
    toastDeleted: "内容已永久删除",
    daysLeft: (n: number) => `剩余 ${n} 天`,
  },
  anime: {
    title: "回收站回收站~",
    subtitle: "被丢掉的内容都在这里哦~还有机会救回来！",
    searchPlaceholder: "搜索回收站...",
    empty: "回收站空空如也~",
    emptyHint: "好干净！没有需要回收的东西呢~",
    loading: "查看回收站中...",
    btnRestore: "救回来",
    btnDelete: "彻底拜拜",
    restoring: "急救中...",
    deleting: "删除中...",
    confirmRestoreTitle: "救回内容",
    confirmRestoreMsg: (name: string) => `要把「${name}」救回来吗？`,
    confirmDeleteTitle: "彻底拜拜",
    confirmDeleteMsg: (name: string) => `「${name}」要被彻底删掉了...再也回不来了哦！(´;ω;｀)`,
    toastRestored: "救回来啦~☆",
    toastDeleted: "已经彻底消失了...",
    daysLeft: (n: number) => `还剩 ${n} 天`,
  },
};

// ── notes（墨宝 / 笔记 / 笔记笔记~）──

export const notesCopy: CopyText<{
  title: string;
  subtitle: string;
  btnNew: string;
  btnSave: string;
  btnSaveVersion: string;
  btnVersions: string;
  saving: string;
}> = {
  daoist: {
    title: "墨宝",
    subtitle: "记录悟道心得，书写数字修行",
    btnNew: "新墨宝",
    btnSave: "铭刻",
    btnSaveVersion: "新刻",
    btnVersions: "版本录",
    saving: "铭刻中...",
  },
  normal: {
    title: "笔记",
    subtitle: "创建和管理你的笔记",
    btnNew: "新建笔记",
    btnSave: "保存",
    btnSaveVersion: "新增版本",
    btnVersions: "历史版本",
    saving: "保存中...",
  },
  anime: {
    title: "笔记笔记~",
    subtitle: "写下你的小灵感吧☆",
    btnNew: "写新笔记~",
    btnSave: "保存喵~",
    btnSaveVersion: "留个新版本~",
    btnVersions: "版本历史",
    saving: "保存中喵...",
  },
};

// ── contents（道藏 / 知识库 / 知识库知识库~）──

// ── sidebar / header 导航菜单 ──

export const sidebarCopy: CopyText<{
  sectionDaoCang: string;
  sectionDanShi: string;
  sectionXuanTai: string;
  search: string;
  searchTip: string;
  contents: string;
  contentsTip: string;
  notes: string;
  notesTip: string;
  tags: string;
  tagsTip: string;
  categories: string;
  categoriesTip: string;
  favorites: string;
  favoritesTip: string;
  collections: string;
  collectionsTip: string;
  quiz: string;
  quizTip: string;
  brains: string;
  brainsTip: string;
  analytics: string;
  analyticsTip: string;
  logs: string;
  logsTip: string;
  backup: string;
  backupTip: string;
  settings: string;
  settingsTip: string;
  recycle: string;
  recycleTip: string;
  logoTitle: string;
  logoSubtitle: string;
}> = {
  daoist: {
    sectionDaoCang: "道藏",
    sectionDanShi: "丹室",
    sectionXuanTai: "玄台",
    search: "问玄", searchTip: "搜索",
    contents: "道藏", contentsTip: "知识库",
    notes: "墨宝", notesTip: "笔记",
    tags: "符印", tagsTip: "标签",
    categories: "坤舆", categoriesTip: "分类",
    favorites: "珍藏", favoritesTip: "收藏",
    collections: "藏经", collectionsTip: "合集",
    quiz: "考校", quizTip: "出题测验",
    brains: "丹室", brainsTip: "工作区",
    analytics: "卦象", analyticsTip: "统计",
    logs: "玄鉴", logsTip: "日志",
    backup: "封魔", backupTip: "备份",
    settings: "玄台", settingsTip: "设置",
    recycle: "归墟", recycleTip: "回收站",
    logoTitle: "墨渊",
    logoSubtitle: "Moyuan",
  },
  normal: {
    sectionDaoCang: "内容",
    sectionDanShi: "工具",
    sectionXuanTai: "系统",
    search: "搜索", searchTip: "搜索内容",
    contents: "知识库", contentsTip: "浏览内容",
    notes: "笔记", notesTip: "写笔记",
    tags: "标签", tagsTip: "管理标签",
    categories: "分类", categoriesTip: "管理分类",
    favorites: "收藏", favoritesTip: "我的收藏",
    collections: "合集", collectionsTip: "合集管理",
    quiz: "测验", quizTip: "出题测验",
    brains: "工作区", brainsTip: "工作区",
    analytics: "统计", analyticsTip: "数据分析",
    logs: "日志", logsTip: "系统日志",
    backup: "备份", backupTip: "数据备份",
    settings: "设置", settingsTip: "系统设置",
    recycle: "回收站", recycleTip: "回收站",
    logoTitle: "墨渊",
    logoSubtitle: "Moyuan",
  },
  anime: {
    sectionDaoCang: "📚 知识宝库",
    sectionDanShi: "🔧 工具箱",
    sectionXuanTai: "⚙️ 系统喵",
    search: "搜索喵~", searchTip: "找东西",
    contents: "知识库", contentsTip: "所有内容",
    notes: "笔记笔记~", notesTip: "写笔记",
    tags: "标签标签~", tagsTip: "管理标签",
    categories: "分类分类~", categoriesTip: "分类",
    favorites: "我的珍藏", favoritesTip: "收藏夹",
    collections: "合集合集~", collectionsTip: "合集",
    quiz: "来考试喵~", quizTip: "出题测验",
    brains: "工作区", brainsTip: "工作空间",
    analytics: "数据喵~", analyticsTip: "统计",
    logs: "日志喵", logsTip: "日志",
    backup: "备份备份~", backupTip: "备份",
    settings: "设置设置~", settingsTip: "设置",
    recycle: "回收站喵", recycleTip: "回收站",
    logoTitle: "墨渊",
    logoSubtitle: "Moyuan",
  },
};

export const contentsCopy: CopyText<{
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  refresh: string;
  cancel: string;
  uploadTitle: string;
  uploadBtn: string;
  empty: string;
  emptyHint: string;
  error: string;
  retry: string;
  batchChunk: (n: number) => string;
  batchEmbed: (n: number) => string;
  batchDelete: (n: number) => string;
  resetStuck: string;
  viewList: string;
  viewGrid: string;
  loading: string;
  typeAll: string;
  typeNote: string;
  typeImage: string;
  typeDoc: string;
  typeAudio: string;
  typeVideo: string;
  typeWeb: string;
  typeOther: string;
  allLoaded: string;
  loadMore: string;
}> = {
  daoist: {
    title: "道藏",
    subtitle: "收纳天地万象，传承千古智慧",
    searchPlaceholder: "探寻道藏...",
    refresh: "刷新",
    cancel: "取消",
    uploadTitle: "收录典籍",
    uploadBtn: "收录典籍",
    empty: "道藏空虚",
    emptyHint: "尚无收录任何典籍",
    error: "气机紊乱：",
    retry: "重新感应",
    batchChunk: (n: number) => `点化分块 (${n})`,
    batchEmbed: (n: number) => `注入灵气 (${n})`,
    batchDelete: (n: number) => `归入归墟 (${n})`,
    resetStuck: "重置卡住嵌入",
    viewList: "卷轴视图",
    viewGrid: "宝匣视图",
    loading: "感应道藏中...",
    typeAll: "全部",
    typeNote: "笔记",
    typeImage: "图片",
    typeDoc: "文档",
    typeAudio: "音频",
    typeVideo: "视频",
    typeWeb: "网页",
    typeOther: "其他",
    allLoaded: "道藏已尽览",
    loadMore: "加载更多",
  },
  normal: {
    title: "知识库",
    subtitle: "浏览和管理所有内容",
    searchPlaceholder: "搜索内容...",
    refresh: "刷新",
    cancel: "取消",
    uploadTitle: "上传文件",
    uploadBtn: "上传文件",
    empty: "知识库为空",
    emptyHint: "还没有任何内容，上传一个文件开始吧",
    error: "加载失败：",
    retry: "重试",
    batchChunk: (n: number) => `批量分块 (${n})`,
    batchEmbed: (n: number) => `批量嵌入 (${n})`,
    batchDelete: (n: number) => `删除 (${n})`,
    resetStuck: "重置卡住嵌入",
    viewList: "列表视图",
    viewGrid: "网格视图",
    loading: "加载中...",
    typeAll: "全部",
    typeNote: "笔记",
    typeImage: "图片",
    typeDoc: "文档",
    typeAudio: "音频",
    typeVideo: "视频",
    typeWeb: "网页",
    typeOther: "其他",
    allLoaded: "已加载全部内容",
    loadMore: "加载更多",
  },
  anime: {
    title: "知识库知识库~",
    subtitle: "这里有你所有的宝贝内容哦☆",
    searchPlaceholder: "想找什么喵...？",
    refresh: "刷新一下",
    cancel: "不要了",
    uploadTitle: "上传新内容",
    uploadBtn: "上传文件喵~",
    empty: "知识库空空如也~",
    emptyHint: "还没有任何内容呢，快上传一个文件吧！(◕‿◕✿)",
    error: "加载失败了喵...",
    retry: "再试一次",
    batchChunk: (n: number) => `点化分块 (${n})`,
    batchEmbed: (n: number) => `注入灵气 (${n})`,
    batchDelete: (n: number) => `丢进回收站 (${n})`,
    resetStuck: "重置卡住的嵌入",
    viewList: "列表模式",
    viewGrid: "网格模式",
    loading: "加载中喵...",
    typeAll: "全部",
    typeNote: "笔记",
    typeImage: "图片",
    typeDoc: "文档",
    typeAudio: "音频",
    typeVideo: "视频",
    typeWeb: "网页",
    typeOther: "其他",
    allLoaded: "已经加载完啦~",
    loadMore: "加载更多",
  },
};

// ── search（问玄 / 搜索 / 搜索搜索~）──

export const searchCopy: CopyText<{
  title: string;
  subtitle: string;
  placeholder: string;
  btnSearch: string;
  searching: string;
  historyTitle: string;
  historyEmpty: string;
  filterCategory: string;
  filterAll: string;
  filterVector: string;
  filterKeyword: string;
  errorPrefix: string;
  resultCount: (n: number) => string;
  scoreLabel: (pct: number) => string;
  noResultTitle: string;
  noResultHint: string;
  emptyHint: string;
  emptyHint2: string;
}> = {
  daoist: {
    title: "问玄",
    subtitle: "叩问玄机，探寻道藏",
    placeholder: "叩问玄机...",
    btnSearch: "悟道",
    searching: "感应中...",
    historyTitle: "探知记录",
    historyEmpty: "尚无探知记录",
    filterCategory: "品类：",
    filterAll: "万象",
    filterVector: "气机感应",
    filterKeyword: "符纹匹配",
    errorPrefix: "气机紊乱：",
    resultCount: (n: number) => `探得 ${n} 道玄机`,
    scoreLabel: (pct: number) => `契合度 ${pct}%`,
    noResultTitle: "未寻得玄机",
    noResultHint: "试换符纹，或以气机感应",
    emptyHint: "输入符纹，开启探玄之旅",
    emptyHint2: "支持气机感应与符纹匹配，精准定位到段落与时间点",
  },
  normal: {
    title: "搜索",
    subtitle: "搜索知识库中的内容",
    placeholder: "搜索内容...",
    btnSearch: "搜索",
    searching: "搜索中...",
    historyTitle: "搜索历史",
    historyEmpty: "暂无搜索记录",
    filterCategory: "类型：",
    filterAll: "全部",
    filterVector: "语义搜索",
    filterKeyword: "关键词匹配",
    errorPrefix: "搜索失败：",
    resultCount: (n: number) => `找到 ${n} 条结果`,
    scoreLabel: (pct: number) => `相关性 ${pct}%`,
    noResultTitle: "未找到结果",
    noResultHint: "试试不同的关键词或开启语义搜索",
    emptyHint: "输入关键词开始搜索",
    emptyHint2: "支持语义搜索和关键词匹配，精准定位到段落",
  },
  anime: {
    title: "搜索搜索~",
    subtitle: "在知识库中寻找宝藏吧☆",
    placeholder: "想找什么喵...？",
    btnSearch: "搜索喵~",
    searching: "搜索中喵...",
    historyTitle: "搜索记录",
    historyEmpty: "还没有搜索过呢~",
    filterCategory: "类型：",
    filterAll: "全部",
    filterVector: "智能搜索",
    filterKeyword: "关键词匹配",
    errorPrefix: "搜索失败喵...",
    resultCount: (n: number) => `找到了 ${n} 个结果喵~`,
    scoreLabel: (pct: number) => `匹配度 ${pct}%`,
    noResultTitle: "没找到喵...",
    noResultHint: "换个关键词试试吧！(´･ω･`)",
    emptyHint: "输入关键词开始搜索吧~",
    emptyHint2: "能找到超精确的结果哦☆",
  },
};

// ── brainSwitcher（丹室选择器）──

export const brainSwitcherCopy: CopyText<{
  select: string;
  empty: string;
  manage: string;
  create: string;
}> = {
  daoist: { select: "选择丹室", empty: "丹室尚空", manage: "管理丹室", create: "新建丹室" },
  normal: { select: "选择工作区", empty: "暂无工作区", manage: "管理工作区", create: "新建工作区" },
  anime: { select: "选择工作区喵~", empty: "还没有工作区呢~", manage: "管理工作区", create: "新建工作区喵~" },
};

// ── logs（日志页）──

export const logsCopy: CopyText<{
  title: string;
  subtitle: string;
  copied: string;
  copy: string;
  placeholder: string;
  empty: string;
}> = {
  daoist: { title: "玄鉴", subtitle: "查看系统运行日志", copied: "已复制", copy: "复制日志", placeholder: "按内容ID过滤日志...", empty: "暂无日志" },
  normal: { title: "日志", subtitle: "查看系统运行日志", copied: "已复制", copy: "复制日志", placeholder: "按内容ID过滤日志...", empty: "暂无日志" },
  anime: { title: "日志喵~", subtitle: "看看系统在做什么呢", copied: "复制好啦~", copy: "复制日志喵", placeholder: "按内容ID搜索...", empty: "日志空空如也~" },
};
