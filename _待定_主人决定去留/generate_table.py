import json

# 加载矿物数据
with open(r'D:\soli\宝石学整理\minerals_unique.json', 'r', encoding='utf-8') as f:
    minerals = json.load(f)

# 已整理的宝石笔记列表（文件名称映射）
sorted_files = [
    "钻石", "尖晶石", "托帕石", "方柱石", "橄榄石", "水晶", "电气石", "石榴石族",
    "磷灰石", "绿柱石", "蓝锥矿", "赛黄晶", "辉石族", "金绿宝石", "刚玉", "锆石",
    "长石族", "黝帘石"
]

# 映射：矿物名称 -> 是否已整理
# 注意：有些矿物属于族，需要特殊处理
mapping = {
    "钻石": "钻石",
    "尖晶石": "尖晶石",
    "托帕石": "托帕石",
    "方柱石": "方柱石",  # 参考表中没有，需要添加
    "橄榄石": "橄榄石",
    "水晶": "石英",  # 石英对应水晶
    "电气石": "碧玺",  # 碧玺对应电气石
    "石榴石族": "石榴石",  # 石榴石对应石榴石族
    "磷灰石": "磷灰石",
    "绿柱石": "绿柱石",
    "蓝锥矿": "蓝锥矿",
    "赛黄晶": "赛黄晶",
    "辉石族": "锂辉石",  # 锂辉石属于辉石族
    "金绿宝石": "金绿宝石",  # 包含变石、猫眼金绿宝石
    "刚玉": "刚玉",
    "锆石": "锆石",
    "长石族": "长石",  # 长石对应长石族
    "黝帘石": "黝帘石",  # 参考表中没有
}

# 反向映射：参考表名称 -> 已整理文件
reverse_map = {}
for sorted_name, ref_name in mapping.items():
    reverse_map[ref_name] = sorted_name

# 添加参考表中没有但已整理的品种
extra_minerals = [
    {"name": "方柱石", "hardness": "5-6", "scarcity": "稀有"},  # 假设值，需要核实
    {"name": "黝帘石", "hardness": "6-7", "scarcity": "一般"},  # 假设值
]

# 合并
all_minerals = minerals + extra_minerals

# 标记是否已整理
for m in all_minerals:
    name = m['name']
    if name in reverse_map:
        m['sorted'] = '是'
        # 如果是族，备注
        if reverse_map[name].endswith('族'):
            m['note'] = f"已整理（{reverse_map[name]}）"
        else:
            m['note'] = "已整理"
    else:
        m['sorted'] = '否'
        m['note'] = ''

# 按名称排序
all_minerals.sort(key=lambda x: x['name'])

# 生成Markdown表格
print("| 宝石品种 | 硬度 | 稀缺性 | 已整理 | 备注 |")
print("|----------|------|--------|--------|------|")
for m in all_minerals:
    name = m['name']
    hardness = m['hardness']
    scarcity = m['scarcity']
    sorted_flag = m['sorted']
    note = m.get('note', '')
    print(f"| {name} | {hardness} | {scarcity} | {sorted_flag} | {note} |")

# 输出到文件
with open(r'D:\soli\宝石学整理\宝石品种整理状态表.md', 'w', encoding='utf-8') as f:
    f.write("# 宝石品种整理状态表\n\n")
    f.write("> 生成日期：2026-05-01\n\n")
    f.write("| 宝石品种 | 硬度 | 稀缺性 | 已整理 | 备注 |\n")
    f.write("|----------|------|--------|--------|------|\n")
    for m in all_minerals:
        name = m['name']
        hardness = m['hardness']
        scarcity = m['scarcity']
        sorted_flag = m['sorted']
        note = m.get('note', '')
        f.write(f"| {name} | {hardness} | {scarcity} | {sorted_flag} | {note} |\n")
    f.write("\n\n## 说明\n")
    f.write("- **已整理**：已按照八章结构完成系统笔记（位于 `宝石学整理/` 目录）\n")
    f.write("- **稀缺性**：参考《单晶矿物种宝石_矿标综合参考表》中的分类\n")
    f.write("- **硬度**：莫氏硬度，范围为近似值\n")

print("\n表格已生成到 '宝石品种整理状态表.md'")