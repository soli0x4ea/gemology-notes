import json

# 加载矿物数据
with open(r'D:\soli\宝石学整理\minerals_unique.json', 'r', encoding='utf-8') as f:
    minerals = json.load(f)

# 已整理的宝石笔记文件列表（不含扩展名）
sorted_files = [
    "钻石", "尖晶石", "托帕石", "方柱石", "橄榄石", "水晶", "电气石", "石榴石族",
    "磷灰石", "绿柱石", "蓝锥矿", "赛黄晶", "辉石族", "金绿宝石", "刚玉", "锆石",
    "长石族", "黝帘石"
]

# 映射：参考表名称 -> 已整理文件
# 主品种映射
main_mapping = {
    "钻石": "钻石",
    "尖晶石": "尖晶石",
    "托帕石": "托帕石",
    "橄榄石": "橄榄石",
    "石英": "水晶",
    "碧玺": "电气石",
    "石榴石": "石榴石族",
    "磷灰石": "磷灰石",
    "绿柱石": "绿柱石",
    "蓝锥矿": "蓝锥矿",
    "赛黄晶": "赛黄晶",
    "金绿宝石": "金绿宝石",
    "刚玉": "刚玉",
    "锆石": "锆石",
    "长石": "长石族",
}

# 子品种映射（包含在主品种中）
sub_mapping = {
    "变石": "金绿宝石",
    "猫眼金绿宝石": "金绿宝石",
    "红色绿柱石": "绿柱石",
    "锂电气石": "电气石",
    "锂辉石": "辉石族",
    "蓝宝石尖晶石": "尖晶石",  # 尖晶石变种
}

# 额外品种（参考表中没有）
extra_minerals = [
    {"name": "方柱石", "hardness": "5-6", "scarcity": "稀有"},
    {"name": "黝帘石", "hardness": "6-7", "scarcity": "一般"},
]

# 合并
all_minerals = minerals + extra_minerals

# 标记是否已整理
for m in all_minerals:
    name = m['name']
    sorted_flag = '否'
    note = ''
    
    # 检查主映射
    if name in main_mapping:
        sorted_flag = '是'
        mapped = main_mapping[name]
        if mapped.endswith('族'):
            note = f"已整理（{mapped}）"
        else:
            note = "已整理"
    # 检查子映射
    elif name in sub_mapping:
        sorted_flag = '是'
        mapped = sub_mapping[name]
        note = f"已整理（{mapped}）"
    
    m['sorted'] = sorted_flag
    m['note'] = note

# 按名称排序
all_minerals.sort(key=lambda x: x['name'])

# 生成Markdown表格
output_file = r'D:\soli\宝石学整理\宝石品种整理状态表.md'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write("# 宝石品种整理状态表\n\n")
    f.write("> 生成日期：2026-05-01 | 数据来源：《单晶矿物种宝石_矿标综合参考表》\n\n")
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
    f.write("- 若宝石品种属于某个族（如石榴石、长石、辉石），则在备注中标注已整理的族笔记名称\n")
    f.write("- 极稀有品种（如马塔菲石、塔菲石、硼铝石）尚未整理，建议优先编写\n")

print(f"表格已生成到 '{output_file}'")
print("\n预览前10行：")
for m in all_minerals[:10]:
    print(f"{m['name']}: 硬度 {m['hardness']}, 稀缺性 {m['scarcity']}, 已整理 {m['sorted']}")